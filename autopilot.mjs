// Autopilot for the stadium test circuit: pure-pursuit steering on the centerline,
// anticlockwise, with a braking-distance speed plan for the two hairpins.
import { clamp } from './physics.mjs';

export function createAutopilot({ halfStraight, radius }, tuning = {}) {
  const t = { cornerSpeed: 43, brakeDecel: 26, lookahead: 0.55, minLookahead: 9, ...tuning };
  const straight = 2 * halfStraight, arc = Math.PI * radius, length = 2 * straight + 2 * arc;
  const wrap = s => ((s % length) + length) % length;
  // Arc length along the centerline, starting at the left end of the bottom straight.
  function progress(x, y) {
    if (x >= -halfStraight && x <= halfStraight) return y < 0 ? x + halfStraight : straight + arc + (halfStraight - x);
    if (x > halfStraight) return straight + (Math.atan2(y, x - halfStraight) + Math.PI / 2) * radius;
    const a = Math.atan2(y, x + halfStraight);
    return 2 * straight + arc + ((a < 0 ? a + 2 * Math.PI : a) - Math.PI / 2) * radius;
  }
  function point(s) {
    s = wrap(s);
    if (s < straight) return [s - halfStraight, -radius];
    if ((s -= straight) < arc) { const a = s / radius - Math.PI / 2; return [halfStraight + radius * Math.cos(a), radius * Math.sin(a)]; }
    if ((s -= arc) < straight) return [halfStraight - s, radius];
    const a = (s - straight) / radius + Math.PI / 2;
    return [-halfStraight + radius * Math.cos(a), radius * Math.sin(a)];
  }
  // Distance to the next hairpin entry, or 0 while inside one.
  function toCorner(s) {
    const into = s % (straight + arc);
    return into < straight ? straight - into : 0;
  }
  return function drive(car) {
    const c = car.config, speed = car.telemetry.speed;
    const s = progress(car.x, car.y);
    const ld = Math.max(t.minLookahead, speed * t.lookahead);
    const [px, py] = point(s + ld);
    const alpha = Math.atan2(py - car.y, px - car.x) - car.heading;
    const steerAngle = Math.atan(2 * c.wheelbase * Math.sin(Math.atan2(Math.sin(alpha), Math.cos(alpha))) / ld);
    const d = toCorner(s);
    const target = d > 0 ? Math.sqrt(t.cornerSpeed ** 2 + 2 * t.brakeDecel * Math.max(0, d - 5)) : t.cornerSpeed;
    const err = target - speed;
    return {
      steer: clamp(steerAngle / c.maxSteer, -1, 1),
      throttle: err > 0 ? clamp(err / 3, 0, 1) : 0,
      brake: err < -1 ? clamp(-err / 8, 0, 1) : 0,
    };
  };
}
