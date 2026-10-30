// Stadium test circuit: surfaces and barriers matching the world3d.mjs layout
// (road, 1.2 m kerbs, runoff to 8 m past the road edge, walls at edge + 12 m).
// Grip multipliers are illustrative assumptions, not measured surface data.
import { clamp } from './physics.mjs';

export const SURFACE_GRIP = Object.freeze({ asphalt: 1, pit: 1, kerb: 0.9, runoff: 0.7, grass: 0.35, gravel: 0.45 });
// Loose surfaces also plough: a drag of this fraction of each wheel's load
// against its motion (gravel traps; circuit.mjs, from real land cover).
export const SURFACE_ROLLING = Object.freeze({ gravel: 0.25 });

// Pit lane on the inside of the circuit, positions in metres of lap progress
// (0 = left end of the main straight) and track offset (negative = inside).
// Cars leave the circuit from `entry`, reach the fast lane (offset `lane`)
// before the speed-limit line `limitStart`, stop in their box (boxStart +
// boxSpacing * car index, offset `boxOffset`), and pass the limit-end line
// `limitEnd`; the exit lane then runs round the inside of the first hairpin and
// rejoins the back straight between `mergeStart` and `exit`, as many real pit
// exits blend in after turn 1. Layout and the 80 km/h limit are illustrative.
export function stadiumPitLane(halfStraight, radius, roadWidth) {
  const half = roadWidth / 2, straight = 2 * halfStraight, turn = straight + Math.PI * radius;
  return Object.freeze({ entry: 0.07 * straight, limitStart: 0.33 * straight, limitEnd: 0.73 * straight, mergeStart: turn + 40, exit: turn + 0.4 * straight,
    inner: half + 1.2, outer: half + 11, lane: -(half + 4.5), boxOffset: -(half + 8.5), boxStart: 0.4 * straight, boxSpacing: 30, speedLimit: 80 / 3.6 });
}

export function createStadiumTrack({ halfStraight, radius, roadWidth, wallOffset = roadWidth / 2 + 12 }) {
  const half = roadWidth / 2, pit = stadiumPitLane(halfStraight, radius, roadWidth);
  // On the pit apron (lane, boxes, exit lane and their run-offs).
  const inPitArea = (x, y, d) => d < -pit.inner && d > -pit.outer && (p => p > pit.entry && p < pit.exit)(progress(x, y));
  // Radial frame about the nearest point of the straight between the two arc centres.
  const local = (x, y) => {
    const dx = x - clamp(x, -halfStraight, halfStraight), r = Math.hypot(dx, y);
    return r > 0 ? { r, ux: dx / r, uy: y / r } : { r, ux: 0, uy: 1 };
  };
  // Signed offset from the centreline, positive towards the outside of the loop.
  const offset = (x, y) => local(x, y).r - radius;
  const surface = (x, y) => {
    const o = offset(x, y), d = Math.abs(o);
    if (inPitArea(x, y, o)) return 'pit';
    return d <= half ? 'asphalt' : d <= half + 1.2 ? 'kerb' : d <= half + 8 ? 'runoff' : 'grass';
  };
  // Arc length along the centreline (anticlockwise), from the left end of the bottom straight.
  const straight = 2 * halfStraight, arc = Math.PI * radius, length = 2 * straight + 2 * arc;
  const progress = (x, y) => {
    if (x >= -halfStraight && x <= halfStraight) return y < 0 ? x + halfStraight : straight + arc + (halfStraight - x);
    if (x > halfStraight) return straight + (Math.atan2(y, x - halfStraight) + Math.PI / 2) * radius;
    const a = Math.atan2(y, x + halfStraight);
    return 2 * straight + arc + ((a < 0 ? a + 2 * Math.PI : a) - Math.PI / 2) * radius;
  };
  return {
    halfStraight, radius, roadWidth, wallOffset, offset, surface, length, progress, pit,
    surfaceAt: (x, y) => SURFACE_GRIP[surface(x, y)],
    // Outer and inner walls; the normal points back towards the circuit.
    barrierAt: (x, y) => {
      const { r, ux, uy } = local(x, y);
      const outer = r - (radius + wallOffset);
      if (outer > 0) return { depth: outer, nx: -ux, ny: -uy };
      const inner = radius - wallOffset - r;
      return inner > 0 ? { depth: inner, nx: ux, ny: uy } : null;
    },
  };
}
