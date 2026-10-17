// Multi-car race on the stadium circuit: every car runs the full single-car
// physics in lockstep at FIXED_DT, with aerodynamic wakes (tow + dirty air),
// rigid car-to-car contact, simple traffic-aware AI drivers and live standings.
// All wake, contact and AI numbers are illustrative assumptions, not CFD or
// telemetry: a close follower loses up to towDragLoss of its drag and
// dirtyAirLoss of its downforce, decaying over wakeLength metres behind the
// leader and wakeWidth metres either side of its centreline.
import { step, createCar, carMass, fitTires, newErsLap, tireTempGrip, tireWearGrip, TIRE_COMPOUNDS, FIXED_DT, clamp } from './physics.mjs';
import { createAutopilot } from './autopilot.mjs';

export const RACE_DEFAULTS = Object.freeze({
  wakeLength: 30, wakeWidth: 1.4, wakeMinGap: 4, towDragLoss: 0.35, dirtyAirLoss: 0.25,
  carRestitution: 0.3, carFriction: 0.4,
  // AI traffic: lane offset for passing (m from the centreline), how far ahead
  // a car counts as "in the way", the follow gap and lane-change rate (m/s).
  passLane: 3, passCutoff: 60, exitClear: 40, passGain: 3, alongside: 7, lookAhead: 45, followGap: 14, followDecel: 18, anticipation: 0.4, laneRate: 2.2, laneClearance: 2.6, closeTime: 2.5, mergeTime: 5, creepSpeed: 1.5,
  // Standing start: five red lights come on one per lightInterval seconds, then
  // go out after a random hold in [holdMin, holdMax]. Moving more than
  // jumpDistance metres before lights out is a jump start (jumpPenalty seconds).
  // AI reaction times are drawn from [reactionMin, reactionMax].
  lightInterval: 1, holdMin: 0.2, holdMax: 3, jumpDistance: 0.5, jumpPenalty: 5, reactionMin: 0.18, reactionMax: 0.3,
  // After taking the chequered flag a car cruises at most coolDownSpeed (m/s).
  coolDownSpeed: 45,
  // Pit stops (illustrative): planning decelerations to the speed-limit line
  // and to the box marks (m/s²), stationary time range (s), the window either
  // side of the box marks where the crew services a stopped car (m), the
  // pit-lane speeding penalty (s), the tread wear that forces an unplanned stop
  // and the spacing a car keeps to one ahead in the pit lane; a planned stop is
  // put off a lap when a car less than queueDistance (m) ahead is boxing.
  // A car leaving the pits rejoins only with mergeTime seconds of closing time.
  // Fuel (illustrative): a race of N laps starts with N * fuelPerLap kg (the
  // autopilot's burn on this circuit) plus fuelMargin of that and fuelReserve
  // kg (the sample a car must still hold after the flag). No refuelling.
  fuelPerLap: 0.38, fuelMargin: 0.03, fuelReserve: 1,
  pitDecel: 14, boxDecel: 5, stopTimeMin: 2.1, stopTimeMax: 3.2, boxWindow: 3, pitSpeedingPenalty: 5, pitWear: 0.6, pitGap: 8, pitHeadway: 1.2, queueDistance: 200,
});

// Smooth 0..1 blend of s across [a, b] (cosine, zero lateral rate at both ends).
const blend = (s, a, b) => s <= a ? 0 : s >= b ? 1 : (1 - Math.cos(Math.PI * (s - a) / (b - a))) / 2;

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
// tyres: the start compound, then the compound fitted at each planned stop.
export const DEFAULT_GRID = Object.freeze([
  { name: 'M. Kovač', color: 0xc8102e, accent: 0xf4f4f4, cornerSpeed: 43.6, brakeDecel: 26.5, tyres: ['medium', 'hard'] },
  { name: 'L. Ferreira', color: 0xff7a00, accent: 0x1b2a6b, cornerSpeed: 42.4, brakeDecel: 25.5, tyres: ['soft', 'hard'] },
  { name: 'J. Hart', color: 0xb9c2c9, accent: 0x00a19b, cornerSpeed: 43.9, brakeDecel: 26, tyres: ['medium', 'hard'] },
  { name: 'S. Tanaka', color: 0xf2c500, accent: 0x111111, cornerSpeed: 42.8, brakeDecel: 27, tyres: ['medium', 'hard'] },
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
  const ma = carMass(a), mb = carMass(b), Ia = a.config.yawInertia, Ib = b.config.yawInertia;
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
// true or { seed } runs the standing-start light sequence first. laps: race
// distance; the chequered flag falls when the leader completes it, and every
// other car finishes on its next crossing of the line (0 = no finish).
// compoundRule: in a race of 2+ laps every finisher must have used two
// different compounds (so must stop at least once) or is disqualified; the AI
// and the player's autopilot then plan one stop. Without it, cars stop only
// when their tread wear passes pitWear (or the player requests a stop).
// fuel: in a race with a distance every car carries the fuel for it (unless
// its car spec sets fuelLoad); the burn-off makes the cars lighter lap by lap.
export function createRace(track, { grid = DEFAULT_GRID, options = {}, player = {}, start = false, laps = 0, compoundRule = false, fuel = true } = {}) {
  const o = { ...RACE_DEFAULTS, ...options };
  const rand = random(start?.seed ?? (Math.random() * 2 ** 32));
  const lightsOn = start ? 5 * o.lightInterval : 0;
  const lightsOut = start ? lightsOn + o.holdMin + rand() * (o.holdMax - o.holdMin) : 0;
  const { halfStraight, radius, length, pit } = track;
  const startLine = halfStraight + 0.8, straight = 2 * halfStraight, rule = compoundRule && laps >= 2;
  const entries = [{ name: 'You', player: true, cornerSpeed: 43, brakeDecel: 26, tyres: ['medium', 'hard'], ...player }, ...grid].map((spec, i) => {
    const car = createCar(spec.car), tyres = spec.tyres ?? ['medium', 'hard'];
    fitTires(car, tyres[0]);
    if (fuel && laps && spec.car?.fuelLoad === undefined) car.fuel = laps * o.fuelPerLap * (1 + o.fuelMargin) + o.fuelReserve;
    const lane = i === 0 ? 0 : (i % 2 ? -1 : 1) * 2.6;
    car.x = i ? -8 * i : 0; car.y = -(radius + lane); // pole at x = 0 (not -0)
    const p = track.progress(car.x, car.y);
    return { ...spec, index: i, car, lane: 0, offset: lane, last: p, covered: p - startLine, grid: p - startLine,
      reactionTime: o.reactionMin + rand() * (o.reactionMax - o.reactionMin), reaction: null, jumpStart: false, penalty: 0, finish: null,
      // Pit stops: own box, compounds used, completed stops, the stop in
      // progress (phase in/service/out), this pit-lane visit, player request.
      tyres, box: pit.boxStart + pit.boxSpacing * i, compounds: [tyres[0]], stops: [], pit: null, pitVisit: null, pitRequest: null,
      drive: createAutopilot({ halfStraight, radius }, { cornerSpeed: spec.cornerSpeed, brakeDecel: spec.brakeDecel }) };
  });
  // Planned stop lap under the compound rule: 35-65% race distance.
  for (const e of entries) e.stopLap = rule ? clamp(Math.round(laps * (0.35 + 0.3 * rand())), 1, laps - 1) : null;
  const passTimes = new Map(); // first time any car reached each 10 m milestone
  let accumulator = 0, time = 0, flagTime = null;

  // Distance along the lap to a car `d` metres of covered distance ahead (ignores laps).
  const ahead_ = d => ((d % length) + length) % length;

  // Lap progress along the main straight (null elsewhere), and whether a car is
  // in the speed-limited pit lane (between the lines, beyond the white line).
  const pitS = car => { const p = track.progress(car.x, car.y); return car.y < 0 && p <= straight ? p : null; };
  const inPitLane = (car, s = pitS(car)) => s !== null && s >= pit.limitStart && s <= pit.limitEnd && track.offset(car.x, car.y) < -pit.inner;
  // The compound a car fits at its next stop.
  const nextCompound = e => e.pitRequest ?? e.tyres[e.stops.length + 1] ?? (e.car.compound === 'hard' ? 'medium' : 'hard');
  // Path offset of a stopping car at lap progress s: from its line into the
  // fast lane, across to its box and back, then (from mergeAt, once the
  // rejoin is clear) out to the racing line.
  const pitPath = e => s => {
    const { from, phase, mergeAt, mergeLength } = e.pit;
    if (s > straight && phase === 'in') return from;
    return from + (pit.lane - from) * blend(s, pit.entry, pit.limitStart - 10)
      + (pit.boxOffset - pit.lane) * (blend(s, e.box - 18, e.box - 1) - blend(s, e.box + 1, e.box + 18))
      - (mergeAt === undefined ? 0 : pit.lane * blend(s, mergeAt, mergeAt + mergeLength));
  };
  // A car on the circuit (not in the pit lane) alongside, or closing from
  // behind within closeTime, of a car at covered distance `covered` and `speed`.
  const traffic = (e, near) => entries.some(x => {
    if (x === e || track.offset(x.car.x, x.car.y) < -pit.inner) return false;
    let gap = ahead_(x.covered - e.covered); if (gap > length / 2) gap -= length;
    return near(gap, x.car.telemetry.speed);
  });
  // Box this lap? Called as a car nears the line, from 100 m before it to the
  // pit entry: a player request, the planned stop lap, or worn-out tread.
  function wantsStop(e) {
    const lap = Math.round(e.covered / length), remaining = laps ? laps - lap : Infinity;
    if (remaining < 1 || e.finish || flagTime !== null) return false;
    if (e.pitRequest) return true;
    // A planned stop waits a lap rather than queue behind a car just ahead
    // that is boxing too, unless this is the last lap it can be made.
    const queue = entries.some(x => x !== e && x.pit?.phase === 'in' && ahead_(x.covered - e.covered) < o.queueDistance);
    if (e.stopLap !== null && lap >= e.stopLap && new Set(e.compounds).size < 2 && (!queue || remaining <= 1)) return true;
    return remaining >= 3 && Math.max(...e.car.tireWear) > o.pitWear;
  }
  // Pit lane rules and service after each step: limiter speeding penalty,
  // the stop on the box marks (any car stopped there is serviced, once per
  // visit), fitting the new set, and the end of the stop at the pit exit.
  function updatePit(e) {
    const car = e.car, s = pitS(car), speed = car.telemetry.speed, lane = inPitLane(car, s);
    if (s === null) e.pitVisit = null;
    if (lane) {
      e.pitVisit ??= { speeding: false, served: false };
      if (!e.pitVisit.speeding && speed > pit.speedLimit + 0.5) { e.pitVisit.speeding = true; e.penalty += o.pitSpeedingPenalty; }
    }
    const p = e.pit;
    if (p?.phase === 'service') {
      // Safe release: the crew holds the car while one approaches in the fast
      // lane or is pulling out of a box behind.
      const unsafe = entries.some(x => {
        if (x === e || x.pit?.phase === 'service') return false;
        const xs = pitS(x.car), xo = track.offset(x.car.x, x.car.y);
        const leaving = x.pit?.phase === 'out' && xs !== null && xs < x.box + 20;
        return xs !== null && xs > e.box - 50 && xs < e.box + 6 && xo < -pit.inner && (leaving || (xo > pit.boxOffset + 1.5 && x.car.telemetry.speed > 1));
      });
      if (time >= p.end && !unsafe) {
        fitTires(car, p.compound); e.compounds.push(p.compound); e.pitRequest = null;
        e.stops.push({ lap: p.lap, compound: p.compound, service: p.end - p.begin, stationary: time - p.begin });
        p.phase = 'out';
      }
      return;
    }
    if (lane && !e.pitVisit.served && speed < 0.3 && Math.abs(s - e.box) <= o.boxWindow && Math.abs(track.offset(car.x, car.y) - pit.boxOffset) < 1.5) {
      e.pitVisit.served = true;
      e.pit = { from: 0, ...p, phase: 'service', compound: p?.compound ?? nextCompound(e), begin: time,
        end: time + o.stopTimeMin + rand() * (o.stopTimeMax - o.stopTimeMin), lap: Math.max(0, Math.floor(e.covered / length)) + 1 };
      return;
    }
    if (p?.phase === 'in' && s !== null && s > e.box + o.boxWindow) p.phase = 'out'; // missed the box
    if (p?.phase === 'out') {
      const progress = track.progress(car.x, car.y);
      // Over once merged (AI), or back on the circuit or past the exit (driving).
      const back = e.manual && track.offset(car.x, car.y) > -pit.inner && progress > pit.limitEnd;
      if (p.mergeAt !== undefined ? progress >= p.mergeAt + p.mergeLength || progress < pit.entry : back || progress >= pit.exit || progress < pit.entry) { e.pit = null; e.lane = e.offset = 0; }
    }
  }

  // Traffic-aware autopilot command for entry i (also drives the player's car on
  // autopilot). Candidate lanes are the racing line (0) and a passing lane each
  // side. Each lane's speed cap lets the car stop followGap behind the nearest
  // car in it; the car moves to a clearly faster lane when the sweep across is
  // free of cars alongside, and back to the racing line once that is as good.
  // New passing moves start only on a straight before the braking zone, unless
  // the car is slow (e.g. stuck behind a stopped car).
  function aiCommand(i, dt = FIXED_DT) {
    const e = entries[i], car = e.car, speed = car.telemetry.speed;
    // Dirty air: corner speed scaled by the expected loss of normal load (the
    // downforce share of it is taken as ~45% at this circuit's corner speeds),
    // and by the tires: the compound, the coldest (e.g. on an out lap) and the most worn.
    const grip = (1 - (1 - car.wake.downforce) * 0.45) * TIRE_COMPOUNDS[car.compound].grip
      * Math.min(...car.tireTemp.map(t => tireTempGrip(car.config, t))) * tireWearGrip(car.config, Math.max(...car.tireWear));
    const lookAhead = Math.max(o.lookAhead, o.followGap + 1.5 * speed * speed / (2 * o.followDecel));
    // Cars on the other side of the pit-lane line are separate traffic.
    const side = x => track.offset(x.car.x, x.car.y) < -pit.inner;
    const others = entries.filter(other => other !== e && side(other) === side(e)).map(other => {
      const d = ahead_(other.covered - e.covered);
      return { gap: d > length / 2 ? d - length : d, offset: track.offset(other.car.x, other.car.y), lane: other.lane, pitIn: other.pit?.phase === 'in',
        // Anticipate a braking car: its speed a moment (anticipation s) from now.
        speed: Math.max(0, other.car.telemetry.speed + Math.min(0, other.car.ax) * o.anticipation) };
    });
    const into = track.progress(car.x, car.y) % (2 * halfStraight + Math.PI * radius);
    const canMove = into < 2 * halfStraight - o.passCutoff || speed < 30;
    // No new lane change in the first exitClear metres of a straight (still
    // unwinding the steering under power out of the hairpin) unless slow.
    const canChange = canMove && (into > o.exitClear || speed < 30);
    // A lane's cap counts cars in it or moving into it (a car heading for the
    // pit entry sweeps every lane on its inside). From the braking zone
    // to the corner exit nobody runs side by side: a car that is not ahead
    // backs out behind one alongside, whatever its lane.
    const cap = (lane, gap = o.followGap) => others.reduce((m, x) => x.gap > 0 && x.gap < lookAhead
      && (Math.abs(x.offset - lane) < o.laneClearance || x.lane === lane || (x.pitIn && lane < x.offset + o.laneClearance) || (!canMove && x.gap < 2 * o.alongside))
      ? Math.min(m, Math.sqrt(Math.max(0, x.speed ** 2 + 2 * o.followDecel * (x.gap - gap)))) : m, Infinity);
    // No car alongside, or closing from behind within closeTime seconds,
    // anywhere across the strip swept from here to the lane, and no nearby car
    // already heading for that lane.
    const free = lane => others.every(x => (x.gap > o.alongside
      || -x.gap > o.alongside + Math.max(0, x.speed - speed) * o.closeTime
      || x.offset < Math.min(e.offset, lane) - o.laneClearance || x.offset > Math.max(e.offset, lane) + o.laneClearance)
      && (Math.abs(x.gap) > 2 * o.alongside || x.lane !== lane));
    if (e.pit) {
      // Pit stop: follow the pit path, brake to the limit by the line and to
      // the box marks, hold the brake there, keep to the limit until its end.
      const p = track.progress(car.x, car.y), s = p > straight && e.pit.phase === 'in' ? p - length : p;
      // Rejoin from the back straight only when no car on the circuit is
      // alongside or closing from behind; otherwise stop at the end of the lane.
      if (e.pit.phase === 'out' && e.pit.mergeAt === undefined && s > pit.mergeStart
        && !traffic(e, (gap, v) => gap < o.alongside && -gap < o.alongside + Math.max(0, v - speed) * o.mergeTime)) {
        e.pit.mergeAt = s; e.pit.mergeLength = Math.max(40, 1.8 * speed);
      }
      const path = pitPath(e);
      e.offset = e.lane = path(Math.max(0, s));
      const limit = s < pit.limitStart ? Math.sqrt(pit.speedLimit ** 2 + 2 * o.pitDecel * Math.max(0, pit.limitStart - 15 - s)) : s <= pit.limitEnd ? pit.speedLimit : Infinity;
      if (e.pit.phase === 'in' && s > e.box - 1 && speed < 4) return { throttle: 0, brake: 1, steer: 0 };
      const boxCap = e.pit.phase === 'in' ? Math.sqrt(2 * o.boxDecel * Math.max(0, e.box - s))
        : e.pit.mergeAt === undefined ? Math.sqrt(2 * o.boxDecel * Math.max(0, pit.exit - 8 - s)) : Infinity;
      const occupied = Math.max(o.creepSpeed, cap(track.offset(car.x, car.y), car.config.bodyFront + car.config.bodyRear + 1));
      // Single file into and down the pit lane behind any car ahead heading
      // there (not one already parked in its box), at a constant time headway
      // (pitHeadway s plus pitGap m), which keeps a queue from concertinaing.
      const queue = others.reduce((m, x) => x.gap > 0 && x.gap < lookAhead && (x.pitIn || x.offset < -pit.inner) && x.offset > pit.boxOffset + 1.5
        ? Math.min(m, Math.max(0, x.gap - o.pitGap) / o.pitHeadway) : m, Infinity);
      return e.drive(car, { offset: path, maxSpeed: Math.min(cap(e.offset), occupied, queue, limit, boxCap), grip });
    }
    const current = cap(e.lane);
    if (canChange) {
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
    // Also respect whoever is in the strip the car is steering for, and (down
    // to a nose-to-tail gap, then creeping) the strip it actually occupies.
    const occupied = Math.max(o.creepSpeed, cap(track.offset(car.x, car.y), car.config.bodyFront + car.config.bodyRear + 1));
    const maxSpeed = Math.min(current, cap(e.offset), occupied, e.finish ? o.coolDownSpeed : Infinity);
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
    // Strategy: a car the AI drives (the player's only on autopilot) boxes
    // when it decides to as it nears the line.
    for (const e of entries) {
      const p = track.progress(e.car.x, e.car.y);
      if (!e.pit && !(e.player && input) && time >= lightsOut && (p > length - 100 || p < pit.entry - 5) && wantsStop(e))
        e.pit = { phase: 'in', compound: nextCompound(e), from: e.offset };
    }
    for (const e of entries) e.manual = !!(e.player && input);
    const commands = entries.map((e, i) => {
      let command = e.pit?.phase === 'service' ? hold : e.player && input ? input
        : time < lightsOut + (start ? e.reactionTime : 0) ? hold : aiCommand(i);
      // Pit limiter: no drive above the speed limit in the pit lane.
      if (command.throttle > 0 && e.car.telemetry.speed > pit.speedLimit && inPitLane(e.car)) command = { ...command, throttle: 0 };
      return (e.command = command);
    });
    entries.forEach((e, i) => step(e.car, commands[i], FIXED_DT, surfaceAt, barrierAt));
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) resolveCarContact(entries[i].car, entries[j].car, o);
    time += FIXED_DT;
    for (const e of entries) {
      const p = track.progress(e.car.x, e.car.y);
      let d = p - e.last; if (d < -length / 2) d += length; else if (d > length / 2) d -= length;
      const before = e.covered;
      e.covered += d; e.last = p;
      // Crossing the line starts the ERS lap allowances afresh.
      if (Math.floor(e.covered / length) > Math.floor(before / length)) newErsLap(e.car);
      // Finish: the leader at the race distance drops the flag; after that a car
      // finishes at its next line crossing (lapped cars a lap or more short).
      // The crossing time is interpolated within the step.
      if (laps && !e.finish) {
        const line = flagTime === null ? laps * length : Math.floor(e.covered / length) * length;
        if (line >= length && before < line && e.covered >= line) {
          const t = time - FIXED_DT * (e.covered - line) / (e.covered - before);
          flagTime ??= t;
          e.finish = { laps: Math.round(line / length), time: t - lightsOut };
        }
      }
      updatePit(e);
      if (start && !e.jumpStart && time < lightsOut && e.covered - e.grid > o.jumpDistance) { e.jumpStart = true; e.penalty += o.jumpPenalty; }
      // Reaction: from lights out to the first firm throttle (> 50%).
      if (start && e.reaction === null && time >= lightsOut && commands[e.index].throttle > 0.5) e.reaction = time - lightsOut;
      const m = Math.floor(e.covered / 10);
      if (m > (e.milestone ?? -Infinity)) { e.milestone = m; e.milestoneTime = time; if (!passTimes.has(m)) passTimes.set(m, time); }
    }
  }

  return {
    entries, options: o, aiCommand, pit, compoundRule: rule, inPitLane: car => inPitLane(car),
    // Player's pit request: the compound to fit at the next stop (null cancels).
    // On autopilot the car boxes at the next pit entry; driving, stop in the box.
    requestPit(compound) { entries[0].pitRequest = compound === null || TIRE_COMPOUNDS[compound] ? compound : entries[0].pitRequest; },
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
        compound: e.car.compound, stops: e.stops.length, pit: e.pit?.phase ?? null, fuel: e.car.fuel,
        lap: Math.max(0, Math.floor(e.covered / length)) + 1, covered: e.covered,
        gap: k === 0 || e.milestone === undefined ? 0 : e.milestoneTime - (passTimes.get(e.milestone) ?? e.milestoneTime),
      }));
    },
    // Chequered flag state: flag = the leader has completed the race distance;
    // done = every car has finished.
    get finish() {
      return { laps, flag: flagTime !== null, flagTime, done: !!laps && entries.every(e => e.finish) };
    },
    // Classification: finishers by laps completed, then race time (from lights
    // out) plus time penalties; cars still running follow in road order, then
    // finishers disqualified under the compound rule. gap is seconds behind
    // the winner on the lead lap, lapsDown otherwise.
    classification() {
      const total = e => e.finish.time + e.penalty;
      const dsq = e => rule && !!e.finish && new Set(e.compounds).size < 2;
      const group = e => !e.finish ? 1 : dsq(e) ? 2 : 0;
      const ranked = [...entries].sort((a, b) => group(a) - group(b)
        || (a.finish ? b.finish.laps - a.finish.laps || total(a) - total(b) : b.covered - a.covered));
      const winner = ranked[0].finish && !dsq(ranked[0]) ? ranked[0] : null;
      return ranked.map((e, k) => ({
        position: k + 1, name: e.name, player: !!e.player, index: e.index, finished: !!e.finish, penalty: e.penalty,
        dsq: dsq(e), stops: e.stops.length, compounds: [...e.compounds],
        laps: e.finish?.laps ?? Math.max(0, Math.floor(e.covered / length)), time: e.finish?.time ?? null, total: e.finish ? total(e) : null,
        lapsDown: e.finish && winner && !dsq(e) ? winner.finish.laps - e.finish.laps : null,
        gap: e.finish && winner && !dsq(e) && e.finish.laps === winner.finish.laps ? total(e) - total(winner) : null,
      }));
    },
  };
}
