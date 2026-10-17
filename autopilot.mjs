import { clamp } from './physics.mjs';

// Autopilot for a real circuit (circuit.mjs): pure pursuit on the track's
// minimum-curvature racing line with a speed plan from that line's curvature. The corner
// speed solves v²|κ| = latGrip·μ·(g + q·v²), q = ½ρ·downforceArea/m, so fast
// corners with downforce are flat out; a backward pass then limits each point
// to what braking (brakeGrip·μ·(g + q·v²) plus drag) can reach from the next.
// latGrip/brakeGrip < 1 leave margin for load sensitivity and slip.
// Steering adds yaw-rate feedback: yawGain × wheelbase × (pursuit curvature −
// yawRate/speed) turns in harder when the car understeers off the arc (at
// speed the downforce is rear-biased), and a cross-track term pulls it back
// to the line.
// A per-call offset from the line (traffic) is kept edgeMargin metres inside
// the road edge; a path function (the pit lane) is followed as given.
export function createCircuitAutopilot(track, tuning = {}) {
  const t = { latGrip: 0.74, brakeGrip: 0.62, lookahead: 0.45, minLookahead: 8, curvatureWindow: 6, preview: 0.3, maxSpeed: 100, edgeMargin: 2, laneSmoothing: 100, lateBrake: 1.2, recoverySpeed: 8, coastThrottle: 0.15, coastSpeed: 15,
    slipTarget: 0.1, slipBand: 0.15, crossTrackGain: 0.012, crossTrackSpeed: 60, yawGain: 2, rearSlide: 0.08, frontSlide: 0.16, slideBand: 0.08, ersPlan: true, ersReserve: 0.5, ...tuning };
  const { lineCurvature: curvature, lineStep } = track.samples, n = curvature.length, step = track.length / n;
  let plan = null;
  // Deceleration (m/s²) the plan brakes at from speed v: brakeGrip of the tire
  // limit with downforce, plus drag (a + b·v²).
  const brakeDecel = (c, v) => t.brakeGrip * c.tireMu * (9.81 + 0.5 * c.airDensity * c.downforceArea / c.mass * v * v) + 0.5 * c.airDensity * c.dragArea / c.mass * v * v;
  function speedPlan(c, k0 = curvature, ds = lineStep, late = 1) {
    const g = 9.81, mu = c.tireMu, q = 0.5 * c.airDensity * c.downforceArea / c.mass;
    const w = Math.round(t.curvatureWindow / step), v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let k = 0; for (let j = -w; j <= w; j++) k = Math.max(k, Math.abs(k0[(i + j + n) % n]));
      const den = k - t.latGrip * mu * q;
      v[i] = den > 0 ? Math.min(t.maxSpeed, Math.sqrt(t.latGrip * mu * g / den)) : t.maxSpeed;
    }
    for (let lap = 0; lap < 2; lap++) for (let i = n - 1; i >= 0; i--) {
      const next = v[(i + 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * late * brakeDecel(c, next) * ds[i]));
    }
    return v;
  }
  const index = s => Math.floor((((s % track.length) + track.length) % track.length) / step) % n;
  const at = s => plan[index(s)];
  const edge = track.roadWidth / 2 - t.edgeMargin;
  // Centreline offset of the path `offset` metres right of the line at s.
  const path = (s, offset) => offset ? clamp(track.lineOffset(s) + offset, -edge, edge) : track.lineOffset(s);
  // Speed plan of the parallel path `lane` metres right of the line (a
  // passing lane): its own curvature and arc lengths, so a tighter inside
  // line brakes earlier and corners slower than the racing line (cached).
  // late: a car diving down the inside brakes lateBrake times harder (later).
  const lanePlans = new Map();
  function lanePlan(c, lane, late = false) {
    const key = `${lane}:${late}`;
    if (lanePlans.has(key)) return lanePlans.get(key);
    const { x: xs, y: ys, heading: hs, line } = track.samples, px = new Float64Array(n), py = new Float64Array(n);
    // The clamp at the road edge leaves kinks the car never drives (pure
    // pursuit rounds them off), so the offsets are smoothed first.
    let off = Float64Array.from(line, o => clamp(o + lane, -edge, edge));
    for (let pass = 0; pass < t.laneSmoothing; pass++) off = off.map((o, i) => 0.5 * o + 0.25 * (off[(i - 1 + n) % n] + off[(i + 1) % n]));
    for (let i = 0; i < n; i++) { px[i] = xs[i] + Math.sin(hs[i]) * off[i]; py[i] = ys[i] - Math.cos(hs[i]) * off[i]; }
    const ds = new Float64Array(n), k = new Float64Array(n);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; ds[i] = Math.hypot(px[j] - px[i], py[j] - py[i]); }
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const h0 = Math.atan2(py[i] - py[a], px[i] - px[a]), h1 = Math.atan2(py[b] - py[i], px[b] - px[i]);
      k[i] = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) / Math.max(1e-6, (ds[a] + ds[i]) / 2);
    }
    const v = speedPlan(c, k, ds, late ? t.lateBrake : 1);
    lanePlans.set(key, v);
    return v;
  }
  // ERS deployment plan. The lap allowance (ersDeployPerLap) runs out part way
  // round a power circuit if the MGU-K deploys on every throttle application,
  // so it goes where a joule buys the most lap time. Extra power P at speed v
  // gains Δv = P·dt/(m·v) for P·dt joules, and the gain lasts until the next
  // braking point D metres on, fading with drag over L = m/(ρ·dragArea)
  // metres: lap time saved per joule ∝ L·(1 − e^(−D/L)) / v³ (score). A
  // forward pass (ICE + MGU-K power, rear traction, drag) over the speed plan
  // gives each sample's speed, whether it is on the throttle (accelerating)
  // and the energy deploying there costs; the MGU-K deploys where the score,
  // rescaled by (plan speed / actual speed)³ (a car held up in traffic or
  // slow out of a corner gains more), is at least a threshold set so the
  // planned energy matches the lap target. Off the plan's throttle samples
  // it holds back (a steady corner gains nothing from it), unless the target
  // covers the whole plan (threshold 0: deploy on every throttle application).
  // Each lap (detected by the per-lap count resetting) recalibrates: the
  // ratio of energy actually deployed to the plan's estimate for the samples
  // passed while deploying was possible, and a target of what the store
  // recovered that lap plus half its charge above ersReserve of the capacity
  // (at most the allowance), so the store neither runs flat nor sits full.
  let ers = null;
  function ersPlan(c) {
    const g = 9.81, m = c.mass, base = plan ?? speedPlan(c), ds = lineStep;
    const rpmOf = 60 / (2 * Math.PI), ice = c.drivelineEfficiency * Math.max(...c.torqueCurve.map(([r, q]) => q * r / rpmOf));
    const accel = (v, power) => Math.min(c.tireMu * (g * (1 - c.frontWeight) + 0.5 * c.airDensity * c.downforceArea * (1 - c.frontAero) / m * v * v),
      power / (m * Math.max(v, 1)) - 0.5 * c.airDensity * c.dragArea / m * v * v - c.rollingResistance * g);
    const v = Float64Array.from(base), on = new Uint8Array(n);
    for (let lap = 0; lap < 2; lap++) for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, reach = Math.sqrt(Math.max(0, v[i] * v[i] + 2 * accel(v[i], ice + c.ersPower) * ds[i]));
      on[i] = reach <= base[j] + 1e-9 ? 1 : 0;
      v[j] = Math.min(base[j], reach);
    }
    const L = m / (c.airDensity * c.dragArea), D = new Float64Array(n), score = new Float64Array(n).fill(-1), energy = new Float64Array(n);
    for (let lap = 0; lap < 2; lap++) for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n; D[i] = v[j] < v[i] - 1e-6 ? 0 : D[j] + ds[i]; }
    for (let i = 0; i < n; i++) if (on[i] && v[i] > c.ersMinSpeed) {
      energy[i] = c.ersPower * ds[i] / v[i];
      score[i] = L * (1 - Math.exp(-D[i] / L)) / v[i] ** 3;
    }
    // Samples by falling score with the planned energy deployed down to each.
    const order = Array.from({ length: n }, (_, i) => i).filter(i => score[i] >= 0).sort((a, b) => score[b] - score[a]);
    const cumulative = new Float64Array(order.length);
    order.forEach((i, k) => { cumulative[k] = (k ? cumulative[k - 1] : 0) + energy[i]; });
    const threshold = target => { const k = cumulative.findIndex(e => e >= target); return k < 0 ? 0 : score[order[k]]; };
    return { speed: v, score, energy, total: cumulative.at(-1) ?? 0, threshold, ratio: 0.9, lambda: threshold(c.ersDeployPerLap), last: -1, passed: 0, prev: 0, lineCharge: null };
  }
  function ersCommand(car, s) {
    const c = car.config, store = car.ers;
    if (!store || !t.ersPlan) return undefined;
    ers ??= ersPlan(c);
    if (store.deployed < ers.prev - 1) {
      // New lap: recalibrate on the one just finished.
      if (ers.passed > 0.2 * c.ersDeployPerLap) ers.ratio = clamp(ers.prev / ers.passed, 0.5, 2);
      const recovered = ers.lineCharge === null ? null : store.charge - ers.lineCharge + ers.prev;
      const target = recovered === null ? c.ersDeployPerLap
        : clamp(recovered + 0.5 * (store.charge - t.ersReserve * c.ersCapacity), 0, c.ersDeployPerLap);
      ers.lambda = ers.threshold(target / ers.ratio);
      ers.lineCharge = store.charge; ers.passed = 0;
    }
    ers.prev = store.deployed;
    const i = index(s), deploying = ers.lambda <= 0 || (ers.score[i] >= 0 && ers.score[i] * (ers.speed[i] / Math.max(car.telemetry.speed, 1)) ** 3 >= ers.lambda);
    // Plan energy of the samples passed while the MGU-K could still deploy.
    if (i !== ers.last) {
      const skipped = ers.last < 0 ? 0 : (i - ers.last + n) % n;
      if (skipped > 0 && skipped < 50 && store.deployed < c.ersDeployPerLap - 1 && store.charge > 1)
        for (let k = 1; k <= skipped; k++) { const j = (ers.last + k) % n; if (deploying) ers.passed += ers.energy[j]; }
      ers.last = i;
    }
    return deploying;
  }
  let turn = 0; // turning round after a spin: steer direction (±1), 0 = not
  // offset: metres to the right of the racing line, or a function of lap
  // progress giving the centreline offset to follow, unclamped (the pit
  // lane, off the road); lane: the passing lane
  // the car is on or heading for (its path's plan also caps the speed);
  // late: diving down the inside on that lane, its plan alone (braking later).
  const drive = function drive(car, { offset = 0, lane = 0, late = false, maxSpeed = Infinity, grip = 1 } = {}) {
    plan ??= speedPlan(car.config);
    const lp = lane ? lanePlan(car.config, lane, late) : plan, atLane = late && lane ? s => lp[index(s)] : s => Math.min(at(s), lp[index(s)]);
    const c = car.config, speed = car.telemetry.speed, s = track.progress(car.x, car.y);
    const ld = Math.max(t.minLookahead, speed * t.lookahead);
    const pathAt = typeof offset === 'function' ? offset : q => path(q, offset);
    const [px, py] = track.point(s + ld, pathAt(s + ld));
    const raw = Math.atan2(py - car.y, px - car.x) - car.heading, alpha = Math.atan2(Math.sin(raw), Math.cos(raw));
    const drift = track.offset(car.x, car.y) - pathAt(s);
    // Pointing away from the target (after a spin): full lock towards it at
    // no more than recoverySpeed, turning round instead of driving the wrong
    // way: towards the target, or, when facing nearly backwards, towards the
    // centreline (more room for the turning circle). The turn keeps its
    // direction until the car points within 60° of the target.
    const across = Math.abs(alpha) > 5 * Math.PI / 6 ? (track.offset(car.x, car.y) < 0 ? 1 : -1) : Math.sign(alpha);
    turn = Math.abs(alpha) > Math.PI / 2 ? turn || across : Math.abs(alpha) < Math.PI / 3 ? 0 : turn;
    const turning = turn !== 0;
    const steerAngle = turning ? turn * c.maxSteer : Math.atan(2 * c.wheelbase * Math.sin(alpha) / ld)
      + t.crossTrackGain * drift * Math.min(1, (t.crossTrackSpeed / Math.max(speed, 1)) ** 2)
      + (speed > 5 ? t.yawGain * c.wheelbase * (2 * Math.sin(alpha) / ld - car.yawRate / speed) : 0);
    // Target: the plan's lowest speed over the next `preview` seconds of travel.
    let target = atLane(s);
    for (let d = step; d <= speed * t.preview; d += step) target = Math.min(target, atLane(s + d));
    target = Math.min(maxSpeed, turning ? t.recoverySpeed : Infinity, target * Math.sqrt(grip));
    const err = target - speed;
    const wheels = car.telemetry.wheels, rearSlip = wheels.length ? Math.max(wheels[2].slipRatio ?? 0, wheels[3].slipRatio ?? 0) : 0;
    const slipAt = k => wheels.length ? Math.abs(wheels[k].slipAngle ?? 0) : 0;
    const rearAlpha = Math.max(slipAt(2), slipAt(3)), frontAlpha = Math.max(slipAt(0), slipAt(1));
    const traction = clamp(1 - (rearSlip - t.slipTarget) / t.slipBand, 0.15, 1) * clamp(1 - (rearAlpha - t.rearSlide) / t.slideBand, 0, 1);
    // Understeer only when the fronts slide more than the rears: in a spin
    // the fronts slide too, and holding the lock then would block the catch.
    const understeer = frontAlpha > t.frontSlide && frontAlpha > rearAlpha && Math.abs(steerAngle) > Math.abs(car.steer) && Math.sign(steerAngle) === Math.sign(car.steer);
    return {
      steer: clamp((understeer ? car.steer : steerAngle) / c.maxSteer, -1, 1),
      // Off the brakes at speed the throttle stays at least coastThrottle,
      // which cancels the engine braking: lifting fully (to catch a slide, or
      // just over the target in traffic) would snap the rear loose mid-corner.
      throttle: understeer ? 0 : Math.max(err > 0 ? clamp(err / 3, 0, 1) * traction : 0, err >= -1 && speed > t.coastSpeed ? t.coastThrottle : 0),
      brake: err < -1 ? clamp(-err / 8, 0, 1) : 0,
      ers: ersCommand(car, s),
    };
  };
  drive.ers = car => (ers ??= ersPlan(car.config));
  drive.plan = car => (plan ??= speedPlan(car.config));
  drive.planSpeed = (car, s) => (plan ??= speedPlan(car.config), at(s));
  drive.path = path;
  drive.lanePlan = (car, lane, late) => lanePlan(car.config, lane, late);
  drive.brakeDecel = brakeDecel;
  // Highest speed from which that braking slows to v within d metres:
  // decel a + b·u² integrates to v0² = ((a + b·v²)·e^(2bd) − a) / b.
  drive.brakeSpeed = (c, v, d) => {
    const a = brakeDecel(c, 0), b = brakeDecel(c, 1) - a;
    return Math.sqrt(Math.max(0, ((a + b * v * v) * Math.exp(2 * b * Math.max(0, d)) - a) / b));
  };
  return drive;
}

// Autopilot for the stadium test circuit: pure-pursuit steering on the centerline,
// anticlockwise, with a braking-distance speed plan for the two hairpins.
// Optional per-call control: offset (m, + towards the outside of the loop) runs a
// parallel line (a function of lap progress s for a path such as the pit lane), maxSpeed (m/s) caps the target speed (traffic following), grip
// scales the corner speed (e.g. < 1 in dirty air). The corner speed also scales
// down with the square root of a tighter (inside) line's radius; an outside line keeps
// the centreline speed, so it has margin for running wide.
export function createAutopilot({ halfStraight, radius }, tuning = {}) {
  const t = { cornerSpeed: 43, brakeDecel: 26, lookahead: 0.55, minLookahead: 9, slipTarget: 0.1, slipBand: 0.15, crossTrackGain: 0.012, crossTrackSpeed: 40, driftLift: 1.5, driftAllowance: 2, rearSlide: 0.08, frontSlide: 0.16, slideBand: 0.08, ...tuning };
  const straight = 2 * halfStraight, arc = Math.PI * radius, length = 2 * straight + 2 * arc;
  const wrap = s => ((s % length) + length) % length;
  // Arc length along the centerline, starting at the left end of the bottom straight.
  function progress(x, y) {
    if (x >= -halfStraight && x <= halfStraight) return y < 0 ? x + halfStraight : straight + arc + (halfStraight - x);
    if (x > halfStraight) return straight + (Math.atan2(y, x - halfStraight) + Math.PI / 2) * radius;
    const a = Math.atan2(y, x + halfStraight);
    return 2 * straight + arc + ((a < 0 ? a + 2 * Math.PI : a) - Math.PI / 2) * radius;
  }
  // Point at centerline arc length s, shifted `offset` metres towards the outside.
  function point(s, offset = 0) {
    const r = radius + offset;
    s = wrap(s);
    if (s < straight) return [s - halfStraight, -r];
    if ((s -= straight) < arc) { const a = s / radius - Math.PI / 2; return [halfStraight + r * Math.cos(a), r * Math.sin(a)]; }
    if ((s -= arc) < straight) return [halfStraight - s, r];
    const a = (s - straight) / radius + Math.PI / 2;
    return [-halfStraight + r * Math.cos(a), r * Math.sin(a)];
  }
  // Distance to the next hairpin entry, or 0 while inside one.
  function toCorner(s) {
    const into = s % (straight + arc);
    return into < straight ? straight - into : 0;
  }
  return function drive(car, { offset = 0, maxSpeed = Infinity, grip = 1 } = {}) {
    const c = car.config, speed = car.telemetry.speed;
    const s = progress(car.x, car.y);
    const ld = Math.max(t.minLookahead, speed * t.lookahead);
    const offsetAt = typeof offset === 'function' ? q => offset(wrap(q)) : () => offset;
    const [px, py] = point(s + ld, offsetAt(s + ld));
    offset = offsetAt(s);
    const alpha = Math.atan2(py - car.y, px - car.x) - car.heading;
    // Pure pursuit plus a cross-track term: tire slip makes pure pursuit run
    // wide at the limit, so steer back towards the chosen line (+ offset = outside).
    // The gain falls with speed squared above crossTrackSpeed (constant lateral
    // acceleration per metre of error), which keeps it from weaving on straights.
    const dx = car.x - clamp(car.x, -halfStraight, halfStraight), drift = Math.hypot(dx, car.y) - radius - offset;
    const steerAngle = Math.atan(2 * c.wheelbase * Math.sin(Math.atan2(Math.sin(alpha), Math.cos(alpha))) / ld)
      + t.crossTrackGain * drift * Math.min(1, (t.crossTrackSpeed / Math.max(speed, 1)) ** 2);
    // Lift when running wide of the line, as a driver would.
    const d = toCorner(s), corner = t.cornerSpeed * Math.sqrt(grip * clamp((radius + offset) / radius, 0.5, 1))
      - t.driftLift * Math.max(0, drift - t.driftAllowance);
    const target = Math.min(maxSpeed, d > 0 ? Math.sqrt(corner ** 2 + 2 * t.brakeDecel * Math.max(0, d - 5)) : corner);
    const err = target - speed;
    // Throttle modulation like a driver catching wheelspin: back off as the
    // driven (rear) wheels' slip ratio passes t.slipTarget.
    const wheels = car.telemetry.wheels, rearSlip = wheels.length ? Math.max(wheels[2].slipRatio ?? 0, wheels[3].slipRatio ?? 0) : 0;
    // Catching a slide: lift as the rear slip angle grows past rearSlide
    // (power oversteer); when the fronts slide past frontSlide (understeer),
    // stop adding lock and come off the throttle.
    const slipAt = k => wheels.length ? Math.abs(wheels[k].slipAngle ?? 0) : 0;
    const rearAlpha = Math.max(slipAt(2), slipAt(3)), frontAlpha = Math.max(slipAt(0), slipAt(1));
    const traction = clamp(1 - (rearSlip - t.slipTarget) / t.slipBand, 0.15, 1) * clamp(1 - (rearAlpha - t.rearSlide) / t.slideBand, 0, 1);
    const understeer = frontAlpha > t.frontSlide && Math.abs(steerAngle) > Math.abs(car.steer) && Math.sign(steerAngle) === Math.sign(car.steer);
    return {
      steer: clamp((understeer ? car.steer : steerAngle) / c.maxSteer, -1, 1),
      throttle: err > 0 && !understeer ? clamp(err / 3, 0, 1) * traction : 0,
      brake: err < -1 ? clamp(-err / 8, 0, 1) : 0,
    };
  };
}
