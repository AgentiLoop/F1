// Autopilot for the stadium test circuit: pure-pursuit steering on the centerline,
// anticlockwise, with a braking-distance speed plan for the two hairpins.
// Optional per-call control: offset (m, + towards the outside of the loop) runs a
// parallel line, maxSpeed (m/s) caps the target speed (traffic following), grip
// scales the corner speed (e.g. < 1 in dirty air). The corner speed also scales
// down with the square root of a tighter (inside) line's radius; an outside line keeps
// the centreline speed, so it has margin for running wide.
import { clamp } from './physics.mjs';

export function createAutopilot({ halfStraight, radius }, tuning = {}) {
  const t = { cornerSpeed: 43, brakeDecel: 26, lookahead: 0.55, minLookahead: 9, slipTarget: 0.1, slipBand: 0.15, crossTrackGain: 0.012, crossTrackSpeed: 40, driftLift: 1.5, driftAllowance: 2, ...tuning };
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
    const [px, py] = point(s + ld, offset);
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
    const traction = clamp(1 - (rearSlip - t.slipTarget) / t.slipBand, 0.15, 1);
    return {
      steer: clamp(steerAngle / c.maxSteer, -1, 1),
      throttle: err > 0 ? clamp(err / 3, 0, 1) * traction : 0,
      brake: err < -1 ? clamp(-err / 8, 0, 1) : 0,
    };
  };
}
