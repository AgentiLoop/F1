// Real-circuit track model built from a traced centreline (circuits.mjs): the
// same surface/barrier/progress interface as createStadiumTrack, plus the
// sampled path (point, heading, curvature) the autopilot and scenery use.
// The trace is splined (centripetal Catmull-Rom), resampled every `step`
// metres, lightly smoothed (traced corners are polygonal) and scaled to the
// official lap length. Offsets are positive to the right of the race
// direction (the outside of an anticlockwise loop, as on the stadium track).
// Kerbs are laid only where the line curves (|curvature| above kerbCurvature
// within kerbReach); elsewhere the road edge runs straight into runoff.
// Surface widths, wall placement and grip are illustrative, not survey data.
import { SURFACE_GRIP } from './track.mjs';

// Long traced segments are straights: they are kept straight rather than
// bowed by the spline's end tangents (a 700 m chord would otherwise bulge).
function spline(points, step, straightLength = 60) {
  const n = points.length, out = [];
  const P = i => points[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    // Centripetal parameterisation (alpha 0.5) avoids loops and cusps on uneven spacing.
    const t = (a, b) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t1 = t(p0, p1), t2 = t1 + t(p1, p2), t3 = t2 + t(p2, p3);
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (step / 2)));
    for (let k = 0; k < m; k++) {
      const u = t1 + (t2 - t1) * k / m;
      if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > straightLength) { out.push([p1[0] + (p2[0] - p1[0]) * k / m, p1[1] + (p2[1] - p1[1]) * k / m]); continue; }
      const lerp = (a, b, ta, tb) => [0, 1].map(j => ((tb - u) * a[j] + (u - ta) * b[j]) / (tb - ta));
      const a1 = lerp(p0, p1, 0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  return out;
}

// Closed polyline resampled at equal arc-length spacing (count points).
function resample(poly, count) {
  const n = poly.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = cum[n], out = [];
  for (let k = 0, j = 0; k < count; k++) {
    const s = L * k / count;
    while (cum[j + 1] < s) j++;
    const a = poly[j], b = poly[(j + 1) % n], f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

// Minimum-curvature racing line: offsets (m, + right) within ±limit that
// minimise the summed squared second difference of the path (≈ curvature²
// at even spacing), by projected Gauss-Seidel on the biharmonic condition
// p_i = (4(p_i-1 + p_i+1) - (p_i-2 + p_i+2)) / 6 along each sample's normal.
// Solved coarse to fine (every 16th, 4th, then every sample) because long
// corners converge slowly. This is the classic geometric line; it ignores
// that the fastest line trades curvature for acceleration and braking.
function racingLine(xs, ys, headings, limit) {
  const n = xs.length, nxs = headings.map(Math.sin), nys = headings.map(h => -Math.cos(h));
  function relax(idx, o, iterations) {
    const m = idx.length, X = k => xs[idx[(k + m) % m]] + nxs[idx[(k + m) % m]] * o[(k + m) % m], Y = k => ys[idx[(k + m) % m]] + nys[idx[(k + m) % m]] * o[(k + m) % m];
    for (let it = 0; it < iterations; it++) for (let k = 0; k < m; k++) {
      const i = idx[k], tx = (4 * (X(k - 1) + X(k + 1)) - X(k - 2) - X(k + 2)) / 6, ty = (4 * (Y(k - 1) + Y(k + 1)) - Y(k - 2) - Y(k + 2)) / 6;
      o[k] = Math.max(-limit, Math.min(limit, (tx - xs[i]) * nxs[i] + (ty - ys[i]) * nys[i]));
    }
    return o;
  }
  // Offsets at every sample, linearly interpolated from those at indices idx.
  const spread = (idx, o) => {
    const out = new Float64Array(n), m = idx.length;
    for (let k = 0; k < m; k++) {
      const a = idx[k], b = k + 1 < m ? idx[k + 1] : n;
      for (let i = a; i < b; i++) out[i] = o[k] + (o[(k + 1) % m] - o[k]) * (i - a) / (b - a);
    }
    return out;
  };
  let full = new Float64Array(n);
  for (const [stride, iterations] of [[16, 4000], [4, 1500], [1, 400]]) {
    const idx = Array.from({ length: Math.floor(n / stride) }, (_, k) => k * stride);
    full = spread(idx, relax(idx, Float64Array.from(idx, i => full[i]), iterations));
  }
  return full;
}

export function createCircuitTrack({ name = 'Circuit', points, length: officialLength, roadWidth = 13, wallOffset = roadWidth / 2 + 12,
  step = 2, smoothing = 40, kerbCurvature = 1 / 600, kerbReach = 30, lineMargin = 1.6 }) {
  const pairs = points.length && typeof points[0] === 'number' ? Array.from({ length: points.length / 2 }, (_, i) => [points[2 * i], points[2 * i + 1]]) : points;
  let poly = spline(pairs, step);
  const polyLength = () => poly.reduce((L, a, i) => { const b = poly[(i + 1) % poly.length]; return L + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0);
  poly = resample(poly, Math.round(polyLength() / step));
  // Laplacian smoothing passes (each pulls a point a quarter of the way to its neighbours' mean).
  for (let pass = 0; pass < smoothing; pass++) {
    poly = poly.map((p, i) => { const a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length]; return [0.5 * p[0] + 0.25 * (a[0] + b[0]), 0.5 * p[1] + 0.25 * (a[1] + b[1])]; });
  }
  // Scale about the start point to the official length, then resample evenly.
  const scale = officialLength ? officialLength / polyLength() : 1, [ox, oy] = poly[0];
  poly = poly.map(([x, y]) => [ox + (x - ox) * scale, oy + (y - oy) * scale]);
  const count = Math.round(polyLength() / step);
  poly = resample(poly, count);
  const n = poly.length, xs = new Float64Array(n), ys = new Float64Array(n), ss = new Float64Array(n + 1);
  poly.forEach(([x, y], i) => { xs[i] = x; ys[i] = y; });
  for (let i = 0; i < n; i++) ss[i + 1] = ss[i] + Math.hypot(xs[(i + 1) % n] - xs[i], ys[(i + 1) % n] - ys[i]);
  const length = ss[n], half = roadWidth / 2;
  const headings = new Float64Array(n), curvature = new Float64Array(n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; headings[i] = Math.atan2(ys[j] - ys[i], xs[j] - xs[i]); }
  for (let i = 0; i < n; i++) {
    const a = headings[(i - 1 + n) % n], b = headings[i], d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    curvature[i] = d / ((ss[i + 1] - ss[Math.max(0, i - 1)]) / (i ? 2 : 1) || step);
  }
  // Racing line points, the arc length of each line segment and its curvature
  // (indexed like the centreline samples).
  const line = racingLine(xs, ys, headings, half - lineMargin);
  const lx = xs.map((x, i) => x + Math.sin(headings[i]) * line[i]), ly = ys.map((y, i) => y - Math.cos(headings[i]) * line[i]);
  const lineStep = new Float64Array(n), lineCurvature = new Float64Array(n);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; lineStep[i] = Math.hypot(lx[j] - lx[i], ly[j] - ly[i]); }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const h0 = Math.atan2(ly[i] - ly[a], lx[i] - lx[a]), h1 = Math.atan2(ly[b] - ly[i], lx[b] - lx[i]);
    lineCurvature[i] = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) / ((lineStep[a] + lineStep[i]) / 2);
  }
  const kerb = new Uint8Array(n), reach = Math.round(kerbReach / step);
  for (let i = 0; i < n; i++) if (Math.abs(curvature[i]) > kerbCurvature) for (let k = -reach; k <= reach; k++) kerb[(i + k + n) % n] = 1;

  // Uniform grid of segment indices for nearest-segment queries near the road.
  const cell = 25, near = wallOffset + 15, grid = new Map();
  const key = (cx, cy) => cx * 65536 + cy;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, x0 = Math.min(xs[i], xs[j]) - near, x1 = Math.max(xs[i], xs[j]) + near, y0 = Math.min(ys[i], ys[j]) - near, y1 = Math.max(ys[i], ys[j]) + near;
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
      const k = key(cx, cy); (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
    }
  }
  const all = Array.from({ length: n }, (_, i) => i);
  // Nearest point on the centreline: segment index, fraction, signed offset (+ right), distance.
  function nearest(x, y) {
    const list = grid.get(key(Math.floor(x / cell), Math.floor(y / cell)));
    let best = null;
    for (const i of list ?? all) {
      const j = (i + 1) % n, dx = xs[j] - xs[i], dy = ys[j] - ys[i], l2 = dx * dx + dy * dy;
      const f = Math.max(0, Math.min(1, ((x - xs[i]) * dx + (y - ys[i]) * dy) / l2));
      const px = xs[i] + dx * f, py = ys[i] + dy * f, d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { i, f, px, py, d, cross: dx * (y - ys[i]) - dy * (x - xs[i]) };
    }
    best.offset = best.cross > 0 ? -best.d : best.d;
    return best;
  }
  const wrap = s => ((s % length) + length) % length;
  const index = s => { s = wrap(s); let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; } return lo; };
  // Centreline point at arc length s, shifted `offset` metres to the right.
  function point(s, offset = 0) {
    const i = index(s), j = (i + 1) % n, f = (wrap(s) - ss[i]) / (ss[i + 1] - ss[i]);
    const x = xs[i] + (xs[j] - xs[i]) * f, y = ys[i] + (ys[j] - ys[i]) * f, h = headings[i];
    return [x + Math.sin(h) * offset, y - Math.cos(h) * offset];
  }
  const progress = (x, y) => { const q = nearest(x, y); return ss[q.i] + (ss[q.i + 1] - ss[q.i]) * q.f; };
  const offset = (x, y) => nearest(x, y).offset;
  const surface = (x, y) => {
    const q = nearest(x, y), d = q.d;
    return d <= half ? 'asphalt' : d <= half + 1.2 && kerb[q.i] ? 'kerb' : d <= half + 8 ? 'runoff' : 'grass';
  };
  return {
    kind: 'circuit', name, length, roadWidth, wallOffset, step, offset, surface, progress, point, pit: null,
    samples: { x: xs, y: ys, s: ss, heading: headings, curvature, kerb, line, lineStep, lineCurvature },
    heading: s => headings[index(s)], curvatureAt: s => curvature[index(s)],
    // Racing-line offset (m, + right) at arc length s, interpolated.
    lineOffset: s => { const i = index(s), f = (wrap(s) - ss[i]) / (ss[i + 1] - ss[i]); return line[i] + (line[(i + 1) % n] - line[i]) * f; },
    surfaceAt: (x, y) => SURFACE_GRIP[surface(x, y)],
    // Walls wallOffset either side of the centreline; where two parts of the
    // circuit run closer than that, the boundary is the midline between them.
    barrierAt: (x, y) => {
      const q = nearest(x, y), depth = q.d - wallOffset;
      return depth > 0 ? { depth, nx: (q.px - x) / q.d, ny: (q.py - y) / q.d } : null;
    },
  };
}
