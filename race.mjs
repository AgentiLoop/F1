// Multi-car race on the stadium circuit: every car runs the full single-car
// physics in lockstep at FIXED_DT, with aerodynamic wakes (tow + dirty air),
// rigid car-to-car contact, simple traffic-aware AI drivers and live standings.
// All wake, contact and AI numbers are illustrative assumptions, not CFD or
// telemetry: a close follower loses up to towDragLoss of its drag and
// dirtyAirLoss of its downforce, decaying over wakeLength metres behind the
// leader and wakeWidth metres either side of its centreline.
import { step, createCar, FIXED_DT, clamp } from './physics.mjs';
import { createAutopilot } from './autopilot.mjs';

export const RACE_DEFAULTS = Object.freeze({
  wakeLength: 30, wakeWidth: 1.4, wakeMinGap: 4, towDragLoss: 0.35, dirtyAirLoss: 0.25,
  carRestitution: 0.3, carFriction: 0.4,
  // AI traffic: lane offset for passing (m from the centreline), how far ahead
  // a car counts as "in the way", the follow gap and lane-change rate (m/s).
  passLane: 3, passCutoff: 60, passGain: 3, alongside: 7, lookAhead: 45, followGap: 14, followDecel: 18, laneRate: 2.2, laneClearance: 2.6,
  // Standing start: five red lights come on one per lightInterval seconds, then
  // go out after a random hold in [holdMin, holdMax]. Moving more than
  // jumpDistance metres before lights out is a jump start (jumpPenalty seconds).
  // AI reaction times are drawn from [reactionMin, reactionMax].
  lightInterval: 1, holdMin: 0.2, holdMax: 3, jumpDistance: 0.5, jumpPenalty: 5, reactionMin: 0.18, reactionMax: 0.3,
});

// Small deterministic PRNG (mulberry32) so a seeded start is reproducible.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fictional field; pace is the autopilot corner speed (m/s), the player's is 43.
export const DEFAULT_GRID = Object.freeze([
  { name: 'M. Kovač', color: 0xc8102e, accent: 0xf4f4f4, cornerSpeed: 43.6, brakeDecel: 26.5 },
  { name: 'L. Ferreira', color: 0xff7a00, accent: 0x1b2a6b, cornerSpeed: 42.4, brakeDecel: 25.5 },
  { name: 'J. Hart', color: 0xb9c2c9, accent: 0x00a19b, cornerSpeed: 43.9, brakeDecel: 26 },
  { name: 'S. Tanaka', color: 0xf2c500, accent: 0x111111, cornerSpeed: 42.8, brakeDecel: 27 },
]);

// Wake strength (0..1) of `lead` felt at `car`: exponential decay with the gap
// behind the leader along its heading, Gaussian in the lateral offset.
export function wakeStrength(lead, car, o = RACE_DEFAULTS) {
  const cos = Math.cos(lead.heading), sin = Math.sin(lead.heading);
  const dx = car.x - lead.x, dy = car.y - lead.y;
  const behind = -(dx * cos + dy * sin), lateral = -dx * sin + dy * cos;
  if (behind < o.wakeMinGap) return 0;
  return Math.exp(-(behind - o.wakeMinGap) / o.wakeLength) * Math.exp(-((lateral / o.wakeWidth) ** 2));
}

// Body footprint as an oriented box: centre, axes, half-extents and corners.
function footprint(car) {
  const c = car.config, ux = Math.cos(car.heading), uy = Math.sin(car.heading);
  const shift = (c.bodyFront - c.bodyRear) / 2, L = (c.bodyFront + c.bodyRear) / 2, W = c.bodyHalfWidth;
  const cx = car.x + shift * ux, cy = car.y + shift * uy;
  const corners = [[L, W], [L, -W], [-L, W], [-L, -W]].map(([a, b]) => [cx + a * ux - b * uy, cy + a * uy + b * ux]);
  return { cx, cy, ux, uy, L, W, corners };
}

// Separating-axis overlap of two footprints: minimum-overlap normal (pointing
// from b towards a), depth and a contact point at the middle of the two
// supporting features (corners within 5 cm of the deepest are averaged, so
// face-to-face contacts act at the face centre, not a corner). Null if apart.
function overlap(a, b) {
  const A = footprint(a), B = footprint(b);
  let best = null;
  for (const [nx, ny] of [[A.ux, A.uy], [-A.uy, A.ux], [B.ux, B.uy], [-B.uy, B.ux]]) {
    const r = F => F.L * Math.abs(F.ux * nx + F.uy * ny) + F.W * Math.abs(-F.uy * nx + F.ux * ny);
    const d = (B.cx - A.cx) * nx + (B.cy - A.cy) * ny, depth = r(A) + r(B) - Math.abs(d);
    if (depth <= 0) return null;
    if (!best || depth < best.depth) best = { depth, nx: -Math.sign(d || 1) * nx, ny: -Math.sign(d || 1) * ny };
  }
  const support = (corners, sign) => {
    const dots = corners.map(([x, y]) => sign * (x * best.nx + y * best.ny)), m = Math.min(...dots);
    const near = corners.filter((_, k) => dots[k] < m + 0.05);
    return near.reduce(([sx, sy], [x, y]) => [sx + x / near.length, sy + y / near.length], [0, 0]);
  };
  const [ax, ay] = support(A.corners, 1), [bx, by] = support(B.corners, -1);
  return { ...best, x: (ax + bx) / 2, y: (ay + by) / 2 };
}

// Rigid contact between two car footprints: separate along the contact normal
// (mass-weighted) and apply one impulse with restitution and Coulomb friction,
// coupled to both yaw rates. Returns the closing speed (m/s), 0 if none.
export function resolveCarContact(a, b, o = RACE_DEFAULTS) {
  if (Math.hypot(a.x - b.x, a.y - b.y) > 8) return 0;
  const hit = overlap(a, b);
  if (!hit) return 0;
  const { nx, ny, depth } = hit; // n points from b towards a
  const ma = a.config.mass, mb = b.config.mass, Ia = a.config.yawInertia, Ib = b.config.yawInertia;
  const share = mb / (ma + mb);
  a.x += nx * depth * share; a.y += ny * depth * share;
  b.x -= nx * depth * (1 - share); b.y -= ny * depth * (1 - share);
  const rax = hit.x - a.x, ray = hit.y - a.y, rbx = hit.x - b.x, rby = hit.y - b.y;
  const rvx = (a.vx - a.yawRate * ray) - (b.vx - b.yawRate * rby);
  const rvy = (a.vy + a.yawRate * rax) - (b.vy + b.yawRate * rbx);
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
  const k = (rx, ry, ux, uy) => (rx * uy - ry * ux) ** 2;
  const kn = 1 / ma + 1 / mb + k(rax, ray, nx, ny) / Ia + k(rbx, rby, nx, ny) / Ib;
  const kt = 1 / ma + 1 / mb + k(rax, ray, tx, ty) / Ia + k(rbx, rby, tx, ty) / Ib;
  const jn = -(1 + o.carRestitution) * vn / kn;
  const jt = clamp(-vt / kt, -o.carFriction * jn, o.carFriction * jn);
  const jx = jn * nx + jt * tx, jy = jn * ny + jt * ty;
  a.vx += jx / ma; a.vy += jy / ma; a.yawRate += (rax * jy - ray * jx) / Ia;
  b.vx -= jx / mb; b.vy -= jy / mb; b.yawRate -= (rbx * jy - rby * jx) / Ib;
  a.contact = { speed: -vn, time: a.time }; b.contact = { speed: -vn, time: b.time };
  return -vn;
}

// track: createStadiumTrack(); grid: opponent specs (the player is entry 0 on
// pole, on the centreline at x = 0; opponents line up 8 m apart behind,
// alternating either side of the centreline). start: false races from t = 0;
// true or { seed } runs the standing-start light sequence first.
export function createRace(track, { grid = DEFAULT_GRID, options = {}, player = {}, start = false } = {}) {
  const o = { ...RACE_DEFAULTS, ...options };
  const rand = random(start?.seed ?? (Math.random() * 2 ** 32));
  const lightsOn = start ? 5 * o.lightInterval : 0;
  const lightsOut = start ? lightsOn + o.holdMin + rand() * (o.holdMax - o.holdMin) : 0;
  const { halfStraight, radius, length } = track;
  const startLine = halfStraight + 0.8;
  const entries = [{ name: 'You', player: true, cornerSpeed: 43, brakeDecel: 26, ...player }, ...grid].map((spec, i) => {
    const car = createCar(spec.car);
    const lane = i === 0 ? 0 : (i % 2 ? -1 : 1) * 2.6;
    car.x = i ? -8 * i : 0; car.y = -(radius + lane); // pole at x = 0 (not -0)
    const p = track.progress(car.x, car.y);
    return { ...spec, index: i, car, lane: 0, offset: lane, last: p, covered: p - startLine, grid: p - startLine,
      reactionTime: o.reactionMin + rand() * (o.reactionMax - o.reactionMin), reaction: null, jumpStart: false, penalty: 0,
      drive: createAutopilot({ halfStraight, radius }, { cornerSpeed: spec.cornerSpeed, brakeDecel: spec.brakeDecel }) };
  });
  const passTimes = new Map(); // first time any car reached each 10 m milestone
  let accumulator = 0, time = 0;

  // Distance along the lap to a car `d` metres of covered distance ahead (ignores laps).
  const ahead_ = d => ((d % length) + length) % length;

  // Traffic-aware autopilot command for entry i (also drives the player's car on
  // autopilot). Candidate lanes are the racing line (0) and a passing lane each
  // side. Each lane's speed cap lets the car stop followGap behind the nearest
  // car in it; the car moves to a clearly faster lane when the sweep across is
  // free of cars alongside, and back to the racing line once that is as good.
  // New passing moves start only on a straight before the braking zone, unless
  // the car is slow (e.g. stuck behind a stopped car).
  function aiCommand(i, dt = FIXED_DT) {
    const e = entries[i], car = e.car, speed = car.telemetry.speed;
    const lookAhead = Math.max(o.lookAhead, o.followGap + 1.5 * speed * speed / (2 * o.followDecel));
    const others = entries.filter(other => other !== e).map(other => {
      const d = ahead_(other.covered - e.covered);
      return { gap: d > length / 2 ? d - length : d, offset: track.offset(other.car.x, other.car.y), lane: other.lane, speed: other.car.telemetry.speed };
    });
    const into = track.progress(car.x, car.y) % (2 * halfStraight + Math.PI * radius);
    const canMove = into < 2 * halfStraight - o.passCutoff || speed < 30;
    // From the braking zone to the corner exit nobody runs side by side: a car
    // that is not ahead backs out behind one alongside, whatever its lane.
    const cap = lane => others.reduce((m, x) => x.gap > 0 && x.gap < lookAhead
      && (Math.abs(x.offset - lane) < o.laneClearance || (!canMove && x.gap < 2 * o.alongside))
      ? Math.min(m, Math.sqrt(Math.max(0, x.speed ** 2 + 2 * o.followDecel * (x.gap - o.followGap)))) : m, Infinity);
    // No car alongside anywhere across the strip swept from here to the lane,
    // and no nearby car already heading for that lane.
    const free = lane => others.every(x => (Math.abs(x.gap) > o.alongside
      || x.offset < Math.min(e.offset, lane) - o.laneClearance || x.offset > Math.max(e.offset, lane) + o.laneClearance)
      && (Math.abs(x.gap) > 2 * o.alongside || x.lane !== lane));
    const current = cap(e.lane);
    if (canMove) {
      let best = e.lane, bestCap = current;
      for (const lane of [0, -o.passLane, o.passLane]) {
        if (lane === e.lane || !free(lane)) continue;
        const c = cap(lane);
        // Hysteresis: leave the line only for a real gain; return when no worse.
        if (lane === 0 ? c >= Math.min(bestCap, 200) - 0.5 : c > bestCap + o.passGain) { best = lane; bestCap = c; }
      }
      e.lane = best;
    }
    e.offset += clamp(e.lane - e.offset, -o.laneRate * dt, o.laneRate * dt);
    // Also respect whoever is in the strip the car currently occupies.
    const maxSpeed = Math.min(current, cap(e.offset));
    // Dirty air: corner speed scaled by the expected loss of normal load (the
    // downforce share of it is taken as ~45% at this circuit's corner speeds).
    const grip = 1 - (1 - car.wake.downforce) * 0.45;
    return e.drive(car, { offset: e.offset, maxSpeed, grip });
  }

  function stepAll(input, surfaceAt, barrierAt) {
    for (const e of entries) {
      let w = 0;
      for (const lead of entries) if (lead !== e) w = Math.max(w, wakeStrength(lead.car, e.car, o));
      e.car.wake = { drag: 1 - o.towDragLoss * w, downforce: 1 - o.dirtyAirLoss * w, strength: w };
    }
    // Before lights out (plus its reaction time) an AI car or the player's
    // autopilot holds the brake; the player's own inputs always pass through.
    const hold = { throttle: 0, brake: 1, steer: 0 };
    const commands = entries.map((e, i) => (e.command = e.player && input ? input
      : time < lightsOut + (start ? e.reactionTime : 0) ? hold : aiCommand(i)));
    entries.forEach((e, i) => step(e.car, commands[i], FIXED_DT, surfaceAt, barrierAt));
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) resolveCarContact(entries[i].car, entries[j].car, o);
    time += FIXED_DT;
    for (const e of entries) {
      const p = track.progress(e.car.x, e.car.y);
      let d = p - e.last; if (d < -length / 2) d += length; else if (d > length / 2) d -= length;
      e.covered += d; e.last = p;
      if (start && !e.jumpStart && time < lightsOut && e.covered - e.grid > o.jumpDistance) { e.jumpStart = true; e.penalty += o.jumpPenalty; }
      // Reaction: from lights out to the first firm throttle (> 50%).
      if (start && e.reaction === null && time >= lightsOut && commands[e.index].throttle > 0.5) e.reaction = time - lightsOut;
      const m = Math.floor(e.covered / 10);
      if (m > (e.milestone ?? -Infinity)) { e.milestone = m; e.milestoneTime = time; if (!passTimes.has(m)) passTimes.set(m, time); }
    }
  }

  return {
    entries, options: o, aiCommand,
    get car() { return entries[0].car; },
    get time() { return time; },
    // Start sequence: phase 'lights' (lit = red lights showing, 0..5) until
    // lights out, then 'racing'; lightsOut is the race time it happened.
    get start() {
      return { enabled: !!start, phase: time < lightsOut ? 'lights' : 'racing', lightsOut, sinceLightsOut: time - lightsOut,
        lit: time < lightsOut ? Math.min(5, Math.floor(time / o.lightInterval + 1e-9)) : 0 };
    },
    // input: the player's command, or null to let the player's autopilot drive.
    advance(elapsed, input, surfaceAt, barrierAt) {
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Elapsed time must be finite and nonnegative');
      accumulator += Math.min(elapsed, 0.25);
      let steps = 0;
      while (accumulator + 1e-12 >= FIXED_DT) { stepAll(input, surfaceAt, barrierAt); accumulator = Math.max(0, accumulator - FIXED_DT); steps++; }
      return steps;
    },
    // Running order by distance covered since the start line; interval to the
    // leader is the time difference at the car's latest 10 m milestone.
    standings() {
      return [...entries].sort((a, b) => b.covered - a.covered).map((e, k) => ({
        position: k + 1, name: e.name, player: !!e.player, index: e.index, penalty: e.penalty, jumpStart: e.jumpStart, reaction: e.reaction,
        lap: Math.max(0, Math.floor(e.covered / length)) + 1, covered: e.covered,
        gap: k === 0 || e.milestone === undefined ? 0 : e.milestoneTime - (passTimes.get(e.milestone) ?? e.milestoneTime),
      }));
    },
  };
}
