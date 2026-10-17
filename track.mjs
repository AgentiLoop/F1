// Stadium test circuit: surfaces and barriers matching the world3d.mjs layout
// (road, 1.2 m kerbs, runoff to 8 m past the road edge, walls at edge + 12 m).
// Grip multipliers are illustrative assumptions, not measured surface data.
import { clamp } from './physics.mjs';

export const SURFACE_GRIP = Object.freeze({ asphalt: 1, kerb: 0.9, runoff: 0.7, grass: 0.35 });

export function createStadiumTrack({ halfStraight, radius, roadWidth, wallOffset = roadWidth / 2 + 12 }) {
  const half = roadWidth / 2;
  // Radial frame about the nearest point of the straight between the two arc centres.
  const local = (x, y) => {
    const dx = x - clamp(x, -halfStraight, halfStraight), r = Math.hypot(dx, y);
    return r > 0 ? { r, ux: dx / r, uy: y / r } : { r, ux: 0, uy: 1 };
  };
  // Signed offset from the centreline, positive towards the outside of the loop.
  const offset = (x, y) => local(x, y).r - radius;
  const surface = (x, y) => {
    const d = Math.abs(offset(x, y));
    return d <= half ? 'asphalt' : d <= half + 1.2 ? 'kerb' : d <= half + 8 ? 'runoff' : 'grass';
  };
  return {
    halfStraight, radius, roadWidth, wallOffset, offset, surface,
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
