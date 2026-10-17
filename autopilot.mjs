import { clamp } from './physics.mjs';

// Autopilot for a real circuit (circuit.mjs): pure pursuit on the track's
// minimum-curvature racing line with a speed plan from that line's curvature. The corner
// speed solves v²|κ| = latGrip·μ·(g + q·v²), q = ½ρ·downforceArea/m, so fast
// corners with downforce are flat out; a backward pass then limits each point
// to what braking (brakeGrip·μ·(g + q·v²) plus drag) can reach from the next.
// latGrip/brakeGrip < 1 leave margin for load sensitivity and slip.
export function createCircuitAutopilot(track, tuning = {}) {
  const t = { latGrip: 0.74, brakeGrip: 0.62, lookahead: 0.45, minLookahead: 8, curvatureWindow: 6, preview: 0.3, maxSpeed: 100,
    slipTarget: 0.1, slipBand: 0.15, crossTrackGain: 0.012, crossTrackSpeed: 40, rearSlide: 0.08, frontSlide: 0.16, slideBand: 0.08, ...tuning };
  const { lineCurvature: curvature, lineStep } = track.samples, n = curvature.length, step = track.length / n;
  let plan = null;
  function speedPlan(c) {
    const g = 9.81, mu = c.tireMu, q = 0.5 * c.airDensity * c.downforceArea / c.mass, drag = 0.5 * c.airDensity * c.dragArea / c.mass;
    const w = Math.round(t.curvatureWindow / step), v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let k = 0; for (let j = -w; j <= w; j++) k = Math.max(k, Math.abs(curvature[(i + j + n) % n]));
      const den = k - t.latGrip * mu * q;
      v[i] = den > 0 ? Math.min(t.maxSpeed, Math.sqrt(t.latGrip * mu * g / den)) : t.maxSpeed;
    }
    for (let lap = 0; lap < 2; lap++) for (let i = n - 1; i >= 0; i--) {
      const next = v[(i + 1) % n], decel = t.brakeGrip * mu * (g + q * next * next) + drag * next * next;
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * decel * lineStep[i]));
    }
    return v;
  }
  const at = s => plan[Math.floor((((s % track.length) + track.length) % track.length) / step) % n];
  // offset: metres to the right of the racing line.
  const drive = function drive(car, { offset = 0, maxSpeed = Infinity, grip = 1 } = {}) {
    plan ??= speedPlan(car.config);
    const c = car.config, speed = car.telemetry.speed, s = track.progress(car.x, car.y);
    const ld = Math.max(t.minLookahead, speed * t.lookahead);
    const [px, py] = track.point(s + ld, track.lineOffset(s + ld) + offset);
    const alpha = Math.atan2(py - car.y, px - car.x) - car.heading;
    const drift = track.offset(car.x, car.y) - track.lineOffset(s) - offset;
    const steerAngle = Math.atan(2 * c.wheelbase * Math.sin(Math.atan2(Math.sin(alpha), Math.cos(alpha))) / ld)
      + t.crossTrackGain * drift * Math.min(1, (t.crossTrackSpeed / Math.max(speed, 1)) ** 2);
    // Target: the plan's lowest speed over the next `preview` seconds of travel.
    let target = at(s);
    for (let d = step; d <= speed * t.preview; d += step) target = Math.min(target, at(s + d));
    target = Math.min(maxSpeed, target * Math.sqrt(grip));
    const err = target - speed;
    const wheels = car.telemetry.wheels, rearSlip = wheels.length ? Math.max(wheels[2].slipRatio ?? 0, wheels[3].slipRatio ?? 0) : 0;
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
  drive.plan = car => (plan ??= speedPlan(car.config));
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
