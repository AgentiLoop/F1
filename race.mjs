// Multi-car race on the stadium circuit: every car runs the full single-car
// physics in lockstep at FIXED_DT, with aerodynamic wakes (tow + dirty air),
// rigid car-to-car contact, simple traffic-aware AI drivers and live standings.
// All wake, contact and AI numbers are illustrative assumptions, not CFD or
// telemetry: a close follower loses up to towDragLoss of its drag and
// dirtyAirLoss of its downforce, decaying over wakeLength metres behind the
// leader and wakeWidth metres either side of its centreline.
import { step, createCar, carMass, fitTires, newErsLap, tireTempGrip, tireWearGrip, TIRE_COMPOUNDS, FIXED_DT, clamp } from './physics.mjs';
import { createAutopilot, createCircuitAutopilot } from './autopilot.mjs';

export const RACE_DEFAULTS = Object.freeze({
  wakeLength: 30, wakeWidth: 1.4, wakeMinGap: 4, towDragLoss: 0.35, dirtyAirLoss: 0.25,
  carRestitution: 0.3, carFriction: 0.4,
  // AI traffic: lane offset for passing (m from the centreline), how far ahead
  // a car counts as "in the way", the follow gap and lane-change rate (m/s).
  // On a circuit the racing line counts as a corner (no new passing moves)
  // where it curves tighter than cornerCurvature (1/m); lane room look-aheads
  // (m) are explained in aiCommand. Grid slots are
  // gridSpacing m apart.
  cornerCurvature: 1 / 300, laneRoomAhead: 200, laneRoomExit: 80, laneReturn: 150, gridSpacing: 8,
  passLane: 3, passCutoff: 60, exitClear: 40, passGain: 3, alongside: 7, pullOutTime: 0.3, passRoom: 250, diveGap: 20, diveOverlap: 1, diveReach: 0.6, yieldGap: 2, diveTurnIn: 15, diveExit: 40, lookAhead: 45, followGap: 14, followMin: 8, followTime: 0.08, followSlow: 10, followDecel: 18, backOutTime: 1, anticipation: 0.4, laneRate: 2.2, laneClearance: 2.6, closeTime: 2.5, mergeTime: 5, creepSpeed: 1.5,
  // Standing start: five red lights come on one per lightInterval seconds, then
  // go out after a random hold in [holdMin, holdMax]. Moving more than
  // jumpDistance metres before lights out is a jump start (jumpPenalty seconds).
  // AI reaction times are drawn from [reactionMin, reactionMax].
  lightInterval: 1, holdMin: 0.2, holdMax: 3, jumpDistance: 0.5, jumpPenalty: 5, reactionMin: 0.18, reactionMax: 0.3,
  // After taking the chequered flag a car cruises at most coolDownSpeed (m/s).
  // An AI car stopped against a wall tries a bounded reverse manoeuvre before
  // retiring. Fuel-starved cars and ordinary traffic queues do not reverse.
  coolDownSpeed: 45, retireAfter: 10,
  recoveryDelay: 2, recoveryTimeout: 20, recoveryMinDistance: 3, recoveryDistance: 20, recoveryAlign: 0.35, recoverySpeed: 2, recoveryAttempts: 2,
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
  // On a real circuit the burn is fuelPerKm kg per km of lap length instead.
  fuelPerLap: 0.38, fuelPerKm: 0.32, fuelMargin: 0.03, fuelReserve: 1,
  // On a circuit a pitting car also slows for the pit path's own bends: at
  // most pitCornerAccel (m/s²) laterally, looking pitPreview m ahead; it
  // approaches the speed-limit line pitLimitMargin m/s under the limit and
  // rejoins over at least mergeSlope m per metre across to the racing line.
  pitCornerAccel: 12, pitPreview: 150, pitLimitMargin: 1.5, mergeSlope: 6,
  pitDecel: 14, boxDecel: 5, stopTimeMin: 2.1, stopTimeMax: 3.2, boxWindow: 3, pitSpeedingPenalty: 5, pitWear: 0.6, pitGap: 8, pitHeadway: 1.2, queueDistance: 200,
  // DRS (after the 2011-25 sporting rules; zone placement illustrative): a car
  // within drsGap s of the car ahead at a zone's detection point may open its
  // flap in that zone, once the leader has completed drsEnableLaps laps and
  // until the chequered flag. Zones open drsZoneDelay m after a corner exit and
  // close at the next corner, detection drsDetection m before the opening; on a
  // circuit the drsZones longest straights of at least drsMinStraight m get one,
  // a straight being where the racing line curves no tighter than drsCurvature
  // (1/m; looser than cornerCurvature so a zone runs on to the braking zone).
  drsGap: 1, drsEnableLaps: 2, drsZoneDelay: 60, drsDetection: 150, drsZones: 2, drsMinStraight: 450, drsCurvature: 1 / 200,
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

// Where a circuit's racing line counts as a corner: distance (m) to the next
// corner and since the last one per line sample, where the line curves
// tighter than cornerCurvature (within 6 m).
function circuitBends(track, o) {
  const k = track.samples.lineCurvature, n = k.length, step = track.length / n, w = Math.round(6 / step);
  const curvy = Array.from(k, (_, i) => { for (let j = -w; j <= w; j++) if (Math.abs(k[(i + j + n) % n]) > o.cornerCurvature) return true; return false; });
  const to = new Float64Array(n), since = new Float64Array(n);
  let d = Infinity; for (let r = 2 * n - 1; r >= 0; r--) { const i = r % n; d = curvy[i] ? 0 : d + step; to[i] = d; }
  d = Infinity; for (let r = 0; r < 2 * n; r++) { const i = r % n; d = curvy[i] ? 0 : d + step; since[i] = d; }
  return { to, since, step, n };
}

// DRS zones { detection, start, end } (lap progress, m) in lap order: the
// stadium's two straights, or a circuit's drsZones longest runs of the racing
// line between corners of at least drsMinStraight m (see RACE_DEFAULTS).
export function findDrsZones(track, options = {}) {
  const o = { ...RACE_DEFAULTS, ...options }, length = track.length, ahead = d => ((d % length) + length) % length;
  let straights;
  if (track.kind === 'circuit') {
    const b = circuitBends(track, { cornerCurvature: o.drsCurvature });
    straights = b.to.every(d => d === Infinity) ? [] : Array.from(b.to, (d, i) => d > 0 && b.to[(i - 1 + b.n) % b.n] === 0 ? [i * b.step, i * b.step + d] : null)
      .filter(r => r && r[1] - r[0] >= o.drsMinStraight).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, o.drsZones);
  } else {
    const straight = 2 * track.halfStraight, arc = Math.PI * track.radius;
    straights = [[0, straight], [straight + arc, 2 * straight + arc]];
  }
  return straights.map(([a, z]) => ({ detection: ahead(a + o.drsZoneDelay - o.drsDetection), start: ahead(a + o.drsZoneDelay), end: ahead(z) }))
    .sort((x, y) => x.start - y.start);
}
export const inDrsZone = (track, z, p) => { const L = track.length, a = d => ((d % L) + L) % L; return a(p - z.start) <= a(z.end - z.start); };

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
export function createRace(track, { grid = DEFAULT_GRID, options = {}, player = {}, start = false, laps = 0, compoundRule = false, fuel = true, drs = true } = {}) {
  const o = { ...RACE_DEFAULTS, ...options };
  const rand = random(start?.seed ?? (Math.random() * 2 ** 32));
  const lightsOn = start ? 5 * o.lightInterval : 0;
  const lightsOut = start ? lightsOn + o.holdMin + rand() * (o.holdMax - o.holdMin) : 0;
  // A real circuit (circuit.mjs) has its start/finish line at s = 0, lanes
  // measured from its racing line and a pit lane beside the start/finish
  // straight (circuit.mjs; null where there is no room: no stops there).
  const { halfStraight, radius, length, pit } = track, circuit = track.kind === 'circuit';
  const startLine = circuit ? 0 : halfStraight + 0.8, straight = circuit ? 0 : 2 * halfStraight, rule = compoundRule && laps >= 2 && !!pit;
  // Distance along the lap to a car `d` metres of covered distance ahead (ignores laps), and the same in (-length/2, length/2].
  const ahead_ = d => ((d % length) + length) % length;
  const signed = d => (d = ahead_(d)) > length / 2 ? d - length : d;
  // Fuel for the distance: per stadium lap, or per kilometre of a circuit.
  const fuelLap = circuit ? o.fuelPerKm * length / 1000 : o.fuelPerLap;
  const entries = [{ name: 'You', player: true, cornerSpeed: 43, brakeDecel: 26, tyres: ['medium', 'hard'], ...player }, ...grid].map((spec, i) => {
    const car = createCar(spec.car), tyres = spec.tyres ?? ['medium', 'hard'];
    fitTires(car, tyres[0]);
    if (fuel && laps && spec.car?.fuelLoad === undefined) car.fuel = laps * fuelLap * (1 + o.fuelMargin) + o.fuelReserve;
    const lane = i === 0 ? 0 : (i % 2 ? -1 : 1) * 2.6;
    // Grid slots gridSpacing m apart behind the line, alternating sides.
    if (circuit) { const s = length - 0.8 - o.gridSpacing * i; [car.x, car.y] = track.point(s, lane); car.heading = track.heading(s); }
    else { car.x = i ? -o.gridSpacing * i : 0; car.y = -(radius + lane); } // pole at x = 0 (not -0)
    const p = track.progress(car.x, car.y);
    // Circuit AI pace: the plan's grip margins scale with the spec's corner
    // speed and braking relative to the player's (43 m/s, 26 m/s²).
    const drive = circuit ? createCircuitAutopilot(track, { latGrip: 0.74 * spec.cornerSpeed / 43, brakeGrip: 0.62 * spec.brakeDecel / 26 })
      : createAutopilot({ halfStraight, radius }, { cornerSpeed: spec.cornerSpeed, brakeDecel: spec.brakeDecel });
    return { ...spec, index: i, car, lane: 0, offset: circuit ? lane - track.lineOffset(p) : lane, last: p, covered: signed(p - startLine), grid: signed(p - startLine),
      reactionTime: o.reactionMin + rand() * (o.reactionMax - o.reactionMin), reaction: null, jumpStart: false, penalty: 0, finish: null,
      // Pit stops: own box, compounds used, completed stops, the stop in
      // progress (phase in/service/out), this pit-lane visit, player request.
      tyres, box: pit ? pit.boxStart + pit.boxSpacing * i : null, compounds: [tyres[0]], stops: [], pit: null, pitVisit: null, pitRequest: null, drive,
      // DRS: zones this car may open its flap in, its latest detection gap (s).
      drsArmed: new Set(), drsGap: null };
  });
  // Planned stop lap under the compound rule: 35-65% race distance.
  for (const e of entries) e.stopLap = rule ? clamp(Math.round(laps * (0.35 + 0.3 * rand())), 1, laps - 1) : null;
  const passTimes = new Map(); // first time any car reached each 10 m milestone
  let accumulator = 0, time = 0, flagTime = null;

  // Offset of a car from the line its lanes are measured from: the centreline
  // on the stadium, the racing line on a circuit (m, + right/outside).
  const rel = car => circuit ? track.offset(car.x, car.y) - track.lineOffset(track.progress(car.x, car.y)) : track.offset(car.x, car.y);
  // Distance (m) to the next corner and since the last one: the stadium's
  // hairpins, or where a circuit's racing line curves tighter than
  // cornerCurvature (within 6 m).
  const bends = circuit && circuitBends(track, o);
  // Side (+1 right, -1 left of the line) on the inside of the corner that
  // starts toCorner metres ahead of lap progress s: its tightest curvature.
  const insideOf = (s, toCorner) => {
    const k = track.samples.lineCurvature, n = k.length, st = length / n; let m = 0;
    for (let d = toCorner; d <= toCorner + 60; d += 4) { const v = k[Math.floor(ahead_(s + d) / st) % n]; if (Math.abs(v) > Math.abs(m)) m = v; }
    return -Math.sign(m);
  };
  // DRS zones in lap order; last: the latest detection time of a car in the
  // race (not pitting, retired or finished).
  const drsZones = !drs ? [] : findDrsZones(track, o).map(z => ({ ...z, last: -Infinity }));
  // Fraction of the last step at which covered distance passed lap point `point` (null if it did not).
  const crossing = (before, after, point) => Math.floor((after - point) / length) > Math.floor((before - point) / length)
    ? (after - (Math.floor((after - point) / length) * length + point)) / (after - before) : null;
  const drsEnabled = () => flagTime === null && time >= lightsOut && Math.max(...entries.map(e => e.covered)) >= o.drsEnableLaps * length;
  const drsAllowed = e => !e.finish && !e.pit && !e.retired && drsEnabled() && [...e.drsArmed].some(z => inDrsZone(track, z, track.progress(e.car.x, e.car.y)));
  function corners(car) {
    const s = track.progress(car.x, car.y);
    if (bends) { const i = Math.floor(s / bends.step) % bends.n; return { toCorner: bends.to[i], fromCorner: bends.since[i] }; }
    const into = s % (straight + Math.PI * radius);
    return into < straight ? { toCorner: straight - into, fromCorner: into } : { toCorner: 0, fromCorner: 0 };
  }

  // Pit frame: a car's offset with the pit side negative (pit.side flips a
  // circuit's right-hand pits), and the lap progress the pit layout is in
  // (a circuit's is signed about the line; on the stadium, a car heading
  // in counts the last hairpin as before the start of the straight).
  const pitSide = pit?.side ?? 1, pitOff = car => pitSide * track.offset(car.x, car.y);
  const pitFrame = (p, phaseIn = false) => circuit ? signed(p) : phaseIn && p > straight ? p - length : p;
  // Lap progress along the main straight (null elsewhere, or without a pit
  // lane), and whether a car is in the speed-limited pit lane (between the
  // lines, beyond the white line).
  const pitS = car => {
    if (!pit) return null;
    const p = track.progress(car.x, car.y);
    if (circuit) { const s = signed(p); return s >= pit.entry && s <= pit.exit ? s : null; }
    return car.y < 0 && p <= straight ? p : null;
  };
  const inPitLane = (car, s = pitS(car)) => s !== null && s >= pit.limitStart && s <= pit.limitEnd && pitOff(car) < -pit.inner;
  // On the pit apron side of the white line (on a circuit, only beside the pit lane).
  const pitApron = car => !!pit && pitOff(car) < -pit.inner && (!circuit || pitS(car) !== null);
  // The compound a car fits at its next stop.
  const nextCompound = e => e.pitRequest ?? e.tyres[e.stops.length + 1] ?? (e.car.compound === 'hard' ? 'medium' : 'hard');
  // Path offset of a stopping car at lap progress s: from its line into the
  // fast lane, across to its box and back, then (from mergeAt, once the
  // rejoin is clear) out to the racing line. On a circuit the path is a
  // centreline offset at lap progress q, blending from the racing line
  // (plus the lane the car was in) into the pit lane and back.
  const pitPath = e => {
    const swing = s => (pit.boxOffset - pit.lane) * (blend(s, e.box - 18, e.box - 1) - blend(s, e.box + 1, e.box + 18));
    if (circuit) return q => {
      const { from, phase, mergeAt, mergeLength } = e.pit, s = signed(q), line = track.lineOffset(q);
      if (phase === 'in' && s > pit.exit) return line + from;
      const merged = mergeAt === undefined ? 0 : blend(s, mergeAt, mergeAt + mergeLength), into = blend(s, pit.entry, pit.limitStart - 10);
      return (line + from) * (1 - into) + (pitSide * (pit.lane + swing(s)) * (1 - merged) + line * merged) * into;
    };
    return s => {
      const { from, phase, mergeAt, mergeLength } = e.pit;
      if (s > straight && phase === 'in') return from;
      return from + (pit.lane - from) * blend(s, pit.entry, pit.limitStart - 10)
        + swing(s)
        - (mergeAt === undefined ? 0 : pit.lane * blend(s, mergeAt, mergeAt + mergeLength));
    };
  };
  // A car on the circuit (not in the pit lane) alongside, or closing from
  // behind within closeTime, of a car at covered distance `covered` and `speed`.
  const traffic = (e, near) => entries.some(x => {
    if (x === e || pitApron(x.car)) return false;
    const gap = signed(x.covered - e.covered);
    return near(gap, x.car.telemetry.speed);
  });
  // Box this lap? Called as a car nears the pit entry (stadium: from 100 m
  // before the line; circuit: from 150 m before the entry): a player request, the planned stop lap, or worn-out tread.
  function wantsStop(e) {
    const lap = Math.round(e.covered / length), remaining = laps ? laps - lap : Infinity;
    if (!pit || remaining < 1 || e.finish || flagTime !== null) return false;
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
    if (!pit) return;
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
        const xs = pitS(x.car), xo = pitOff(x.car);
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
    if (lane && !e.pitVisit.served && speed < 0.3 && Math.abs(s - e.box) <= o.boxWindow && Math.abs(pitOff(car) - pit.boxOffset) < 1.5) {
      e.pitVisit.served = true;
      e.pit = { from: 0, ...p, phase: 'service', compound: p?.compound ?? nextCompound(e), begin: time,
        end: time + o.stopTimeMin + rand() * (o.stopTimeMax - o.stopTimeMin), lap: Math.max(0, Math.floor(e.covered / length)) + 1 };
      return;
    }
    if (p?.phase === 'in' && s !== null && s > e.box + o.boxWindow) p.phase = 'out'; // missed the box
    if (p?.phase === 'out') {
      const progress = pitFrame(track.progress(car.x, car.y));
      // Over once merged (AI), or back on the circuit or past the exit (driving).
      const back = e.manual && pitOff(car) > -pit.inner && progress > pit.limitEnd;
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
    // A circuit AI's corner-speed margin is the player autopilot's, which already
    // copes with tires at their starting temperature, so only grip lost below
    // that counts there (e.g. on an out lap on a set fitted at blanket temperature).
    const temp = Math.min(...car.tireTemp.map(t => tireTempGrip(car.config, t)))
      / (circuit ? tireTempGrip(car.config, { surface: car.config.tireStartTemp, carcass: car.config.tireStartTemp }) : 1);
    const grip = (1 - (1 - car.wake.downforce) * 0.45) * TIRE_COMPOUNDS[car.compound].grip
      * Math.min(1, temp) * tireWearGrip(car.config, Math.max(...car.tireWear));
    const lookAhead = Math.max(o.lookAhead, o.followGap + 1.5 * speed * speed / (2 * o.followDecel));
    // Cars on the other side of the pit-lane line are separate traffic.
    const others = entries.filter(other => other !== e && pitApron(other.car) === pitApron(car)).map(other => {
      return { gap: signed(other.covered - e.covered), offset: rel(other.car), pitOffset: pit ? pitOff(other.car) : 0, lane: other.lane, pitIn: other.pit?.phase === 'in', index: other.index,
        // Diving down the inside of this car, alongside (it must yield), or of any car.
        claim: other.dive?.rival === e.index && other.dive.overlap, diving: !!other.dive,
        // Anticipate a braking car: its speed a moment (anticipation s) from now.
        // On a circuit the follow law already brakes as the plan does, so only
        // braking harder than that (a spin, a wall) is anticipated.
        speed: Math.max(0, other.car.telemetry.speed + Math.min(0, other.car.ax
          + (circuit ? e.drive.brakeDecel(car.config, other.car.telemetry.speed) : 0)) * o.anticipation) };
    });
    const { toCorner, fromCorner } = corners(car);
    // A slow car (e.g. stuck behind a stopped one) may move anywhere; on a
    // circuit only where its plan is not slow anyway (not in a hairpin, where
    // that would let cars run side by side through the corner).
    const slow = speed < 30 && (!circuit || e.drive.planSpeed(car, track.progress(car.x, car.y)) > 30);
    const canMove = toCorner > o.passCutoff || slow;
    // No new lane change in the first exitClear metres of a straight (still
    // unwinding the steering under power out of the corner) unless slow.
    const canChange = canMove && (fromCorner > o.exitClear || slow);
    // A lane's cap counts cars in it or moving into it (a car heading for the
    // pit entry sweeps every lane on its inside). From the braking zone
    // to the corner exit nobody runs side by side: a car that is not ahead
    // backs out behind one alongside, whatever its lane. The follow law stops
    // the car followGap behind one ahead braking at followDecel; on a circuit
    // it may instead brake as its own speed plan does, with downforce (a flat
    // 18 m/s² there held cars ~1 s/lap behind and out of DRS range). Closer
    // than followGap the flat law alone slows the car below the leader's speed;
    // on a circuit by no more than the shortfall over backOutTime seconds (the
    // flat law asks a car 8 m short behind one at 15 m/s in a hairpin to stop,
    // and the queue behind it then crawled through lap-1 hairpins at 1-5 km/h).
    const follow = (v, d) => Math.max(Math.sqrt(Math.max(0, v * v + 2 * o.followDecel * d)), circuit && d > 0 ? e.drive.brakeSpeed(car.config, v, d) : circuit ? v + d / o.backOutTime : 0);
    // On a circuit the gap kept grows with speed (followMin m plus followTime
    // s of travel, at most followGap): a fixed 14 m was ~0.7 s in a hairpin,
    // and that time gap carried down the next straight out of passing range.
    // A car still crossing to its lane (e.g. off its grid slot) keeps the full gap.
    const followGap = circuit && Math.abs(rel(car) - e.lane) < 1 ? Math.min(o.followGap, o.followMin + o.followTime * speed) : o.followGap;
    const carLength = car.config.bodyFront + car.config.bodyRear;
    // Backing out from alongside drops back the full followGap (on a circuit the
    // speed-scaled gap: the full 14 m behind a car at hairpin speed was ~1 s,
    // and backing out that far stacked up the field behind), except
    // from the car this one is diving down the inside of; a car with another
    // alongside on its inside under a dive yields to it (backs out behind).
    // Behind a car slower than followSlow m/s (e.g. one that ran wide in a
    // hairpin and is crawling across the road) the full followGap applies.
    // (list, sideBySide: the cars and rule a pitting car uses, below.)
    const cap = (lane, gap = null, list = others, sideBySide = canMove) => list.reduce((m, x) => {
      const g = gap ?? (x.speed < o.followSlow ? o.followGap : followGap);
      if (x.claim && x.gap > -2 * o.alongside) return Math.min(m, follow(x.speed, x.gap - carLength - o.yieldGap));
      if (!(x.gap > 0 && x.gap < lookAhead)) return m;
      if (Math.abs(x.offset - lane) < o.laneClearance || x.lane === lane || (x.pitIn && pitSide * lane < pitSide * x.offset + o.laneClearance)) return Math.min(m, follow(x.speed, x.gap - g));
      return !sideBySide && x.gap < 2 * o.alongside && x.index !== e.dive?.rival ? Math.min(m, follow(x.speed, x.gap - (circuit ? g : Math.max(g, o.followGap)))) : m;
    }, Infinity);
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
      const p = track.progress(car.x, car.y), s = pitFrame(p, e.pit.phase === 'in');
      // Rejoin from the back straight only when no car on the circuit is
      // alongside or closing from behind; otherwise stop at the end of the lane.
      if (e.pit.phase === 'out' && e.pit.mergeAt === undefined && s > pit.mergeStart
        && !traffic(e, (gap, v) => gap < o.alongside && -gap < o.alongside + Math.max(0, v - speed) * o.mergeTime)) {
        // (On a circuit the rejoin is at least mergeSlope m long per metre
        // across to the racing line, which may be on the far side of the road.)
        e.pit.mergeAt = s; e.pit.mergeLength = Math.max(40, 1.8 * speed, circuit ? o.mergeSlope * Math.abs(pitSide * pit.lane - track.lineOffset(p)) : 0);
      }
      const path = pitPath(e);
      e.offset = e.lane = circuit ? path(p) - track.lineOffset(p) : path(Math.max(0, s));
      // (On a circuit the approach aims pitLimitMargin m/s under the limit:
      // the circuit autopilot only brakes over 1 m/s above its target, and
      // holds a light throttle below that.)
      const lineSpeed = pit.speedLimit - (circuit ? o.pitLimitMargin : 0);
      const limit = s < pit.limitStart ? Math.sqrt(lineSpeed ** 2 + 2 * o.pitDecel * Math.max(0, pit.limitStart - 15 - s)) : s <= pit.limitEnd ? pit.speedLimit : Infinity;
      if (e.pit.phase === 'in' && s > e.box - 1 && speed < 4) return { throttle: 0, brake: 1, steer: 0 };
      const boxCap = e.pit.phase === 'in' ? Math.sqrt(2 * o.boxDecel * Math.max(0, e.box - s))
        // Waiting to rejoin: on a circuit just into the merge zone, leaving the
        // rest of it for the (longer) rejoin before the exit.
        : e.pit.mergeAt === undefined ? Math.sqrt(2 * o.boxDecel * Math.max(0, (circuit ? pit.mergeStart + 10 : pit.exit - 8) - s)) : Infinity;
      // On a circuit the pit path's own bends (the swing into the lane, a
      // curving straight) are taken at no more than pitCornerAccel laterally,
      // braking for them at pitDecel (from three-point curvature every 5 m).
      let bendCap = Infinity;
      if (circuit) {
        const at = d => track.point(p + d, path(p + d));
        for (let d = 0, a = at(-5), b = at(0); d <= o.pitPreview; d += 5) {
          const c = at(d + 5), k = 2 * Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
            / (Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]) * Math.hypot(c[0] - a[0], c[1] - a[1]) || Infinity);
          bendCap = Math.min(bendCap, Math.sqrt(o.pitCornerAccel / Math.max(k, 1e-6) + 2 * o.pitDecel * d));
          a = b; b = c;
        }
      }
      // On a circuit, lanes along the pit lane are compared as centreline
      // offsets (the racing line's offset changes along it, so offsets from
      // it do not line up between cars), and a car beside a parked one is not
      // side by side in a corner (that rule is for the circuit itself).
      const pitList = circuit ? others.map(x => ({ ...x, offset: pitSide * x.pitOffset, lane: NaN })) : others;
      const here = track.offset(car.x, car.y), along = circuit ? path(p) : e.offset;
      const occupied = Math.max(o.creepSpeed, cap(here, car.config.bodyFront + car.config.bodyRear + 1, pitList, circuit || canMove));
      // Single file into and down the pit lane behind any car ahead heading
      // there (not one already parked in its box), at a constant time headway
      // (pitHeadway s plus pitGap m), which keeps a queue from concertinaing.
      // (On a circuit only from the pit entry: before it the car is still racing
      // through the last corners, where ordinary following applies.)
      const queue = circuit && s < pit.entry ? Infinity : others.reduce((m, x) => x.gap > 0 && x.gap < lookAhead && (x.pitIn || x.pitOffset < -pit.inner) && x.pitOffset > pit.boxOffset + 1.5
        ? Math.min(m, Math.max(0, x.gap - o.pitGap) / o.pitHeadway) : m, Infinity);
      return e.drive(car, { offset: path, maxSpeed: Math.min(cap(along, null, pitList, circuit || canMove), occupied, queue, limit, boxCap, bendCap), grip });
    }
    // On a circuit a passing lane is only offered where the road edge leaves
    // it at least 80% of passLane from the racing line for laneRoomAhead
    // metres; a car heads back to the line (when that strip is clear) within
    // laneReturn metres of a corner or as its lane runs out of room ahead.
    const s = circuit && track.progress(car.x, car.y);
    const room = (lane, ahead) => { let m = Infinity; for (let d = 0; d <= ahead; d += 10) m = Math.min(m, Math.abs(e.drive.path(s + d, lane) - track.lineOffset(s + d))); return m; };
    const target = circuit && !slow ? others.filter(x => x.gap > 0 && x.gap < lookAhead && Math.abs(x.offset) < o.laneClearance).sort((a, b) => a.gap - b.gap)[0] : null;
    // Out-braking (circuit): a car out in the passing lane on the inside of
    // the next corner, within diveGap metres of the car ahead on the line as
    // it reaches the laneReturn point, stays on the inside and brakes later
    // (its lane's plan with lateBrake). Once its nose is alongside (within a
    // car length plus diveOverlap) the other car must yield: it backs out to
    // yieldGap metres nose to tail and moves over to the outside lane (even
    // with traffic closing behind) to leave room (the inside lane meets the
    // racing line at the apex). Not alongside by diveTurnIn metres before the
    // corner, or dropped back, the diving car gives up and backs out (closing
    // fast enough to be alongside within diveReach seconds it is committed:
    // too late to back out without running into the other car). It ends diveExit
    // metres down the next straight, once clearly ahead, or once no longer
    // alongside.
    if (e.dive) {
      const r = others.find(x => x.index === e.dive.rival);
      if (r) e.dive.overlap = r.gap < carLength + o.diveOverlap || (e.dive.overlap && r.gap < carLength + 3);
      const out = e.covered > e.dive.cornerAt && toCorner > 0 && fromCorner > o.diveExit;
      if (!r || out || r.gap < -(carLength + 2) || (e.dive.overlap && r.gap > carLength + 3) || (!e.dive.overlap && ((toCorner < o.diveTurnIn && (speed - r.speed) * o.diveReach < r.gap - carLength - o.diveOverlap) || r.gap > o.diveGap + 5))) e.dive = null;
    } else if (circuit && !slow && !e.finish && e.lane && Math.abs(e.offset - e.lane) < 0.5 && toCorner < o.laneReturn && toCorner > o.diveTurnIn
      && target && !target.diving && target.gap < o.diveGap && Math.sign(e.lane) === insideOf(s, toCorner)) {
      e.dive = { rival: target.index, cornerAt: e.covered + toCorner, overlap: target.gap < carLength + o.diveOverlap };
    }
    const yielding = others.find(x => x.claim && x.gap > -2 * o.alongside);
    if (yielding) e.lane = Math.sign(yielding.offset - rel(car)) * -o.passLane;
    else if (circuit && e.lane && !e.dive && (toCorner < o.laneReturn || room(e.lane, o.laneRoomExit) < 0.8 * o.passLane) && free(0)) e.lane = 0;
    const current = cap(e.lane);
    // Slipstream first: on a circuit a car leaves the racing line to pass only
    // once it has closed in the tow to within pullOutTime seconds (plus a car
    // length) of the car ahead on the line; pulling out further back throws the
    // tow away before it has built the closing speed the move needs.
    // It also needs passRoom metres of straight left to draw alongside before
    // the braking zone; nearer the corner it stays in the tow.
    const towing = !circuit || slow || e.lane !== 0 || (!!target && target.gap < o.pullOutTime * speed + carLength && toCorner > o.passRoom);
    if (canChange && !e.dive && !yielding) {
      let best = e.lane, bestCap = current;
      for (const lane of [0, -o.passLane, o.passLane]) {
        if (lane === e.lane || !free(lane) || (lane && !towing)) continue;
        if (circuit && lane && room(lane, o.laneRoomAhead) < 0.8 * o.passLane) continue;
        const c = cap(lane);
        // Hysteresis: leave the line only for a real gain; return when no worse.
        if (lane === 0 ? c >= Math.min(bestCap, 200) - 0.5 : c > bestCap + o.passGain) { best = lane; bestCap = c; }
      }
      e.lane = best;
    }
    // On a circuit a move across (e.g. from a grid slot to the racing line)
    // pauses while the strip still to sweep is not free.
    if (!circuit || yielding || free(e.lane)) e.offset += clamp(e.lane - e.offset, -o.laneRate * dt, o.laneRate * dt);
    // Also respect whoever is in the strip the car is steering for, and (down
    // to a nose-to-tail gap, then creeping) the strip it actually occupies.
    const occupied = Math.max(o.creepSpeed, cap(rel(car), car.config.bodyFront + car.config.bodyRear + 1));
    const maxSpeed = Math.min(current, cap(e.offset), occupied, e.finish ? o.coolDownSpeed : Infinity);
    return e.drive(car, { offset: e.offset, lane: circuit ? e.lane : 0, late: !!e.dive, maxSpeed, grip });
  }

  // Recovery is opponent-only: never take control of the player's pedals or
  // reverse an ordinary queue. Probe just ahead of the nose for a facing wall.
  function recoveryCommand(e, barrierAt) {
    const car = e.car, c = car.config, cos = Math.cos(car.heading), sin = Math.sin(car.heading);
    const hold = { throttle: 0, brake: 1, steer: 0 };
    if (e.player || e.pit || e.finish || e.retired || time < lightsOut + 2) return null;
    if (!e.recovery && e.stuck >= o.recoveryDelay && car.fuel !== 0 && (e.recoveryAttempts ?? 0) < o.recoveryAttempts) {
      const facing = [-c.bodyHalfWidth, 0, c.bodyHalfWidth].some(y => {
        const hit = barrierAt?.(car.x + (c.bodyFront + 0.5) * cos - y * sin, car.y + (c.bodyFront + 0.5) * sin + y * cos);
        return hit && hit.nx * cos + hit.ny * sin < -0.5;
      });
      if (facing) {
        e.recovery = { phase: 'reverse', begin: time, x: car.x, y: car.y };
        e.recoveryAttempts = (e.recoveryAttempts ?? 0) + 1;
      }
    }
    const r = e.recovery;
    if (!r) return null;
    if (time - r.begin > o.recoveryTimeout) {
      e.recovery = null;
      e.retired = { time: time - lightsOut, lap: Math.max(0, Math.floor(e.covered / length)) + 1 };
      return hold;
    }
    if (r.phase === 'reverse' && (car.gear > 0 || car.shiftTimer > 0)) return { ...hold, reverse: true };
    const heading = circuit ? track.heading(track.progress(car.x, car.y)) : Math.atan2(car.x - clamp(car.x, -halfStraight, halfStraight), -car.y);
    const error = Math.atan2(Math.sin(heading - car.heading), Math.cos(heading - car.heading));
    const steer = -clamp(2 * error, -1, 1);
    // Conservative swept envelope, including the turn and two seconds of
    // approaching traffic. A blocked path holds the brakes, never teleports.
    const distance = Math.max(2, car.telemetry.speed * 1.5), curvature = Math.tan(steer * c.maxSteer) / c.wheelbase;
    let wall = false;
    const unsafe = Array.from({ length: 9 }, (_, i) => {
      const d = distance * i / 8, yaw = car.heading - d * curvature;
      const x = car.x - d * Math.cos(car.heading - d * curvature / 2), y = car.y - d * Math.sin(car.heading - d * curvature / 2);
      const probe = footprint({ ...car, x, y, heading: yaw });
      if (i && probe.corners.some(([px, py]) => barrierAt?.(px, py))) return (wall = true);
      return entries.some(other => {
        if (other === e) return false;
        const b = footprint(other.car), radius = Math.hypot(probe.L, probe.W) + Math.hypot(b.L, b.W) + 1;
        for (let t = 0; t <= 2; t += 0.25)
          if (Math.hypot(probe.cx - b.cx - other.car.vx * t, probe.cy - b.cy - other.car.vy * t) < radius) return true;
        return false;
      });
    }).some(Boolean);
    // Reverse until roughly aligned with the track (full lock needs ~15 m to
    // turn 90 degrees), or until the distance cap or a barrier behind.
    const moved = Math.hypot(car.x - r.x, car.y - r.y);
    if (r.phase === 'reverse' && (moved >= o.recoveryDistance || (moved >= o.recoveryMinDistance && (Math.abs(error) < o.recoveryAlign || wall)))) r.phase = 'forward';
    if (r.phase === 'forward') {
      if (car.gear < 0 || car.telemetry.speed >= 0.2 || car.shiftTimer > 0) return { ...hold, reverse: false };
      e.recovery = null; e.stuck = 0; e.lane = 0; e.offset = rel(car);
      return hold;
    }
    if (unsafe) return hold;
    return { throttle: car.telemetry.speed < o.recoverySpeed ? 0.12 : 0, brake: car.telemetry.speed > o.recoverySpeed + 0.2 ? 0.3 : 0, steer };
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
      const near = circuit ? (s => s > pit.entry - 150 && s < pit.entry - 5)(signed(p)) : p > length - 100 || p < pit.entry - 5;
      if (pit && !e.pit && !e.recovery && !(e.player && input) && time >= lightsOut && near && wantsStop(e))
        e.pit = { phase: 'in', compound: nextCompound(e), from: e.offset };
    }
    for (const e of entries) e.manual = !!(e.player && input);
    const commands = entries.map((e, i) => {
      let command = e.pit?.phase === 'service' || e.retired ? hold : e.player && input ? input
        : time < lightsOut + (start ? e.reactionTime : 0) ? hold : recoveryCommand(e, barrierAt) ?? aiCommand(i);
      // Pit limiter: no drive above the speed limit in the pit lane.
      if (command.throttle > 0 && pit && e.car.telemetry.speed > pit.speedLimit && inPitLane(e.car)) command = { ...command, throttle: 0 };
      // DRS: the AI (and the player's autopilot) opens it wherever allowed;
      // the player's own request (input.drs) is ignored where it is not.
      e.drsAllowed = drsAllowed(e);
      command = { ...command, drs: e.drsAllowed && (!e.manual || command.drs === true) };
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
      // DRS detection (gap to whichever car crossed last) and zone ends.
      for (const z of drsZones) {
        if (crossing(before, e.covered, z.end) !== null) e.drsArmed.delete(z);
        const f = crossing(before, e.covered, z.detection);
        if (f === null || e.pit || e.retired || e.finish) continue;
        const t = time - FIXED_DT * f;
        e.drsGap = t - z.last;
        if (drsEnabled() && e.drsGap <= o.drsGap) e.drsArmed.add(z); else e.drsArmed.delete(z);
        z.last = t;
      }
      updatePit(e);
      e.stuck = !e.player && !e.pit && !e.recovery && !e.finish && !e.retired && time > lightsOut + 2 && e.car.telemetry.speed < 1 ? (e.stuck ?? 0) + FIXED_DT : 0;
      if (e.stuck > o.retireAfter) e.retired = { time: time - lightsOut, lap: Math.max(0, Math.floor(e.covered / length)) + 1 };
      if (start && !e.jumpStart && time < lightsOut && e.covered - e.grid > o.jumpDistance) { e.jumpStart = true; e.penalty += o.jumpPenalty; }
      // Reaction: from lights out to the first firm throttle (> 50%).
      if (start && e.reaction === null && time >= lightsOut && commands[e.index].throttle > 0.5) e.reaction = time - lightsOut;
      const m = Math.floor(e.covered / 10);
      if (m > (e.milestone ?? -Infinity)) { e.milestone = m; e.milestoneTime = time; if (!passTimes.has(m)) passTimes.set(m, time); }
    }
  }

  return {
    entries, options: o, aiCommand, pit, compoundRule: rule, drsZones,
    get drsEnabled() { return drsEnabled(); }, inPitLane: car => inPitLane(car),
    // Player's pit request: the compound to fit at the next stop (null cancels).
    // On autopilot the car boxes at the next pit entry; driving, stop in the box.
    requestPit(compound) { if (pit) entries[0].pitRequest = compound === null || TIRE_COMPOUNDS[compound] ? compound : entries[0].pitRequest; },
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
        compound: e.car.compound, stops: e.stops.length, drs: e.car.drs > 0.5 ? 'open' : e.drsAllowed ? 'available' : null, pit: e.pit?.phase ?? null, fuel: e.car.fuel, retired: !!e.retired,
        lap: Math.max(0, Math.floor(e.covered / length)) + 1, covered: e.covered,
        gap: k === 0 || e.milestone === undefined ? 0 : e.milestoneTime - (passTimes.get(e.milestone) ?? e.milestoneTime),
      }));
    },
    // Chequered flag state: flag = the leader has completed the race distance;
    // done = every car has finished (or retired).
    get finish() {
      return { laps, flag: flagTime !== null, flagTime, done: !!laps && entries.every(e => e.finish || e.retired) };
    },
    // Classification: finishers by laps completed, then race time (from lights
    // out) plus time penalties; cars still running follow in road order, then
    // retired cars (retired: DNF) by distance, then finishers disqualified
    // under the compound rule. gap is seconds behind
    // the winner on the lead lap, lapsDown otherwise.
    classification() {
      const total = e => e.finish.time + e.penalty;
      const dsq = e => rule && !!e.finish && new Set(e.compounds).size < 2;
      const group = e => !e.finish ? (e.retired ? 2 : 1) : dsq(e) ? 3 : 0;
      const ranked = [...entries].sort((a, b) => group(a) - group(b)
        || (a.finish ? b.finish.laps - a.finish.laps || total(a) - total(b) : b.covered - a.covered));
      const winner = ranked[0].finish && !dsq(ranked[0]) ? ranked[0] : null;
      return ranked.map((e, k) => ({
        position: k + 1, name: e.name, player: !!e.player, index: e.index, finished: !!e.finish, penalty: e.penalty,
        dsq: dsq(e), retired: !!e.retired && !e.finish, stops: e.stops.length, compounds: [...e.compounds],
        laps: e.finish?.laps ?? Math.max(0, Math.floor(e.covered / length)), time: e.finish?.time ?? null, total: e.finish ? total(e) : null,
        lapsDown: e.finish && winner && !dsq(e) ? winner.finish.laps - e.finish.laps : null,
        gap: e.finish && winner && !dsq(e) && e.finish.laps === winner.finish.laps ? total(e) - total(winner) : null,
      }));
    },
  };
}
