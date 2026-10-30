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
import { SURFACE_GRIP, SURFACE_ROLLING } from './track.mjs';

// Beyond the kerbs, the surface of the real land cover under a point (cover,
// e.g. scenery.mjs landcoverField: 1 farmland, 2 grass, 3 scrub/heath, 4 sand,
// 5 gravel, 6 paved), where one is mapped: sand and gravel are gravel traps,
// paved ground is asphalt run-off. Elsewhere runoff to 8 m, then grass.
const COVER_SURFACE = [null, 'grass', 'grass', 'grass', 'gravel', 'gravel', 'runoff'];
// Loose surfaces as physics.mjs's { grip, rolling }.
const LOOSE = Object.fromEntries(Object.entries(SURFACE_ROLLING).map(([name, rolling]) => [name, Object.freeze({ grip: SURFACE_GRIP[name], rolling })]));

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

// Pit lane beside the start/finish straight, laid out as the stadium's
// (track.mjs stadiumPitLane: apron from inner to outer metres off the
// centreline, fast lane at `lane`, box marks at `boxOffset`, 80 km/h limit),
// with positions in signed lap progress (negative before the line). The pit
// frame's offsets are negative towards the pit side; the centreline offset
// (+ right) is side × that (side +1: pits on the left of the race direction).
// Each side is checked every 10 m out to `reach` m either side of the line:
// there is room where a point just beyond the apron is still nearest this
// part of the circuit and the centreline curving towards the pits leaves at
// least minInsideRadius m inside it. The lane is the standard layout (entry,
// `toLimit` m to the limit line, `limitLength` m of boxes, `toMerge` m to the
// merge zone, `mergeLength` m of it to the exit) slid as little as possible
// from its nominal place (entry `entryAt` m before the line) to fit a side's
// room; the side needing the smaller slide gets it (left on a tie). With the
// real pit lane (real: [side, entry, exit], pits.mjs) it goes on that side,
// centred beside the real one and as long (the boxes' stretch taking up the
// difference; never shorter than the standard layout unless the room around
// the real lane's middle is, and then never under 150 m of boxes); where
// that side has no room for that, it is placed as without it. No room either side: null (no pit stops).
function circuitPitLane({ half, point, offset, progress, signed, curvatureAt }, { real = null, reach = 700, minInsideRadius = 20, entryAt = 300, toLimit = 120, limitLength = 260, toMerge = 40, mergeLength = 130 } = {}) {
  const layout = { inner: half + 1.2, outer: half + 11, lane: -(half + 4.5), boxOffset: -(half + 8.5), boxSpacing: 30, speedLimit: 80 / 3.6 };
  const total = toLimit + limitLength + toMerge + mergeLength, edge = layout.outer + 1;
  const fits = (s, side) => {
    const o = -side * edge, [x, y] = point(s, o);
    let k = 0; for (let d = -10; d <= 10; d += 2) { const v = curvatureAt(s + d); if (Math.sign(v) === side) k = Math.max(k, Math.abs(v)); }
    return Math.abs(offset(x, y) - o) < 1 && Math.abs(signed(progress(x, y) - s)) < 20 && (k === 0 || 1 / k - edge >= minInsideRadius);
  };
  // The room [a, b] on a side around lap distance c, or null.
  const room = (side, c) => {
    if (!fits(c, side)) return null;
    let a = c, b = c;
    while (a > c - reach && fits(a - 10, side)) a -= 10;
    while (b < c + reach && fits(b + 10, side)) b += 10;
    return [a, b];
  };
  let best = null;
  if (real) {
    const [side, from, to] = real, mid = Math.round((from + to) / 20) * 10, r = room(side, mid);
    if (r && r[1] - r[0] >= total - limitLength + 150) {
      const len = Math.min(Math.max(total, to - from), r[1] - r[0]);
      best = { side, entry: Math.min(Math.max((from + to - len) / 2, r[0]), r[1] - len), boxes: limitLength + len - total };
    }
  }
  if (!best) for (const side of [1, -1]) {
    const r = room(side, 0);
    if (!r || r[1] - r[0] < total) continue;
    const entry = Math.min(Math.max(-entryAt, r[0]), r[1] - total);
    if (!best || Math.abs(entry + entryAt) < Math.abs(best.entry + entryAt)) best = { side, entry, boxes: limitLength };
  }
  if (!best) return null;
  const { side, entry, boxes } = best, limitStart = entry + toLimit, limitEnd = limitStart + boxes;
  // Five boxes centred between the limit lines.
  return Object.freeze({ ...layout, side, entry, limitStart, limitEnd, mergeStart: limitEnd + toMerge, exit: limitEnd + toMerge + mergeLength,
    boxStart: (limitStart + limitEnd) / 2 - 2 * layout.boxSpacing });
}

export function createCircuitTrack({ name = 'Circuit', points, length: officialLength, roadWidth = 13, wallOffset = roadWidth / 2 + 12,
  step = 2, smoothing = 40, kerbCurvature = 1 / 600, kerbReach = 30, lineMargin = 1.6, minRadius = 15, pitLane = true, timingLine = 0, drs = null,
  heights = null, banks = null, lakeLevel = null, cover = null, pits = null }) {
  const pairs = points.length && typeof points[0] === 'number' ? Array.from({ length: points.length / 2 }, (_, i) => [points[2 * i], points[2 * i + 1]]) : points;
  let poly = spline(pairs, step);
  const polyLength = () => poly.reduce((L, a, i) => { const b = poly[(i + 1) % poly.length]; return L + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0);
  poly = resample(poly, Math.round(polyLength() / step));
  // Laplacian smoothing passes (each pulls a point a quarter of the way to its neighbours' mean).
  for (let pass = 0; pass < smoothing; pass++) {
    poly = poly.map((p, i) => { const a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length]; return [0.5 * p[0] + 0.25 * (a[0] + b[0]), 0.5 * p[1] + 0.25 * (a[1] + b[1])]; });
  }
  // Scale about the start point to the official length, then resample evenly.
  const scaleTo = () => {
    const scale = officialLength ? officialLength / polyLength() : 1, [ox, oy] = poly[0];
    poly = poly.map(([x, y]) => [ox + (x - ox) * scale, oy + (y - oy) * scale]);
    poly = resample(poly, Math.round(polyLength() / step));
  };
  scaleTo();
  // Traced hairpins can come out tighter than a car can turn (or than the
  // racing line can follow inside them). Where a sample turns more than
  // step/minRadius, the excess turn is passed on to its neighbours (the total
  // turn of each corner is kept, so it just becomes rounder), the path is
  // rebuilt from the new headings, its closing gap spread along the lap,
  // and the result rescaled to the lap length.
  if (minRadius > 0) {
    const m = poly.length, P = i => poly[(i + m) % m], ds = [], h = [], turn = new Float64Array(m);
    for (let i = 0; i < m; i++) { const a = P(i), b = P(i + 1); ds.push(Math.hypot(b[0] - a[0], b[1] - a[1])); h.push(Math.atan2(b[1] - a[1], b[0] - a[0])); }
    for (let i = 0; i < m; i++) { const d = h[i] - h[(i - 1 + m) % m]; turn[i] = Math.atan2(Math.sin(d), Math.cos(d)); }
    for (let pass = 0, over = 1; pass < 20000 && over > 1e-7; pass++) {
      over = 0;
      for (let i = 0; i < m; i++) {
        const limit = (ds[i] + ds[(i - 1 + m) % m]) / 2 / minRadius, e = turn[i] - Math.sign(turn[i]) * limit;
        if (Math.abs(turn[i]) <= limit) continue;
        over = Math.max(over, Math.abs(e));
        turn[i] -= e; turn[(i - 1 + m) % m] += e / 2; turn[(i + 1) % m] += e / 2;
      }
    }
    const out = [poly[0]];
    for (let i = 0, heading = h[0]; i < m - 1; i++) {
      if (i) heading += turn[i];
      out.push([out[i][0] + ds[i] * Math.cos(heading), out[i][1] + ds[i] * Math.sin(heading)]);
    }
    const last = out[m - 1], end = [last[0] + ds[m - 1] * Math.cos(h[0] - turn[0]), last[1] + ds[m - 1] * Math.sin(h[0] - turn[0])];
    poly = out.map(([x, y], i) => [x - (end[0] - poly[0][0]) * i / m, y - (end[1] - poly[0][1]) * i / m]);
    scaleTo();
  }
  const n = poly.length, xs = new Float64Array(n), ys = new Float64Array(n), ss = new Float64Array(n + 1);
  poly.forEach(([x, y], i) => { xs[i] = x; ys[i] = y; });
  for (let i = 0; i < n; i++) ss[i + 1] = ss[i] + Math.hypot(xs[(i + 1) % n] - xs[i], ys[(i + 1) % n] - ys[i]);
  const length = ss[n], half = roadWidth / 2;
  // Elevation: heights (m) and banks (cross-slope, height gained per metre to
  // the left) given at the traced points are carried to each sample by its
  // fraction of the lap, then lightly smoothed (the points are 10 m apart).
  const zs = new Float64Array(n), banking = new Float64Array(n);
  if (heights) {
    const m = pairs.length, cum = [0];
    for (let k = 0; k < m; k++) { const a = pairs[k], b = pairs[(k + 1) % m]; cum.push(cum[k] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    for (let i = 0, k = 0; i < n; i++) {
      const u = ss[i] / length * cum[m];
      while (cum[k + 1] < u) k++;
      const f = (u - cum[k]) / (cum[k + 1] - cum[k]), k1 = (k + 1) % m;
      zs[i] = heights[k] + (heights[k1] - heights[k]) * f;
      if (banks) banking[i] = banks[k] + (banks[k1] - banks[k]) * f;
    }
    for (const a of [zs, banking]) for (let pass = 0; pass < 8; pass++) {
      const v = a.slice();
      for (let i = 0; i < n; i++) a[i] = 0.5 * v[i] + 0.25 * (v[(i - 1 + n) % n] + v[(i + 1) % n]);
    }
  }
  // The lap starts on the real timing line (the start/finish line), timingLine
  // m along the trace: the samples are turned round to begin at the one
  // nearest it (the road itself is unchanged).
  if (timingLine) {
    const t = ((timingLine % ss[n]) + ss[n]) % ss[n];
    let k = 0; while (k < n - 1 && ss[k + 1] <= t) k++;
    if (t - ss[k] > ss[k + 1] - t) k = (k + 1) % n;
    for (const a of [xs, ys, zs, banking]) { const v = a.slice(); for (let i = 0; i < n; i++) a[i] = v[(i + k) % n]; }
    for (let i = 0; i < n; i++) ss[i + 1] = ss[i] + Math.hypot(xs[(i + 1) % n] - xs[i], ys[(i + 1) % n] - ys[i]);
  }
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
  const signed = s => (s = wrap(s)) > length / 2 ? s - length : s;
  // Ground height at lap progress s, `off` metres to the right of the
  // centreline: the road's cross-slope out to its edges, then (with
  // elevation) falling 2% beyond them, as the RISE sim's verges do.
  const verge = heights ? 0.02 : 0;
  const elevation = (s, off = 0) => {
    const i = index(s), j = (i + 1) % n, f = (wrap(s) - ss[i]) / (ss[i + 1] - ss[i]), e = Math.min(Math.abs(off), half);
    const z = zs[i] + (zs[j] - zs[i]) * f, b = banking[i] + (banking[j] - banking[i]) * f;
    return z - Math.sign(off) * e * b - (Math.abs(off) - e) * verge;
  };
  const pit = pitLane ? circuitPitLane({ length, half, wallOffset, point, offset, progress, signed, curvatureAt: s => curvature[index(s)] }, { real: pits }) : null;
  const surface = (x, y) => {
    const q = nearest(x, y), d = q.d;
    // The pit apron, and its entry and exit roads from the road edge.
    if (pit && pit.side * q.offset < -half && pit.side * q.offset > -pit.outer && (s => s > pit.entry && s < pit.exit)(signed(ss[q.i] + (ss[q.i + 1] - ss[q.i]) * q.f))) return 'pit';
    if (d <= half) return 'asphalt';
    if (d <= half + 1.2 && kerb[q.i]) return 'kerb';
    return COVER_SURFACE[cover?.(x, y) ?? 0] ?? (d <= half + 8 ? 'runoff' : 'grass');
  };
  return {
    kind: 'circuit', name, length, roadWidth, wallOffset, step, offset, surface, progress, point, pit,
    // DRS zones [open, close] (lap progress, m), or null: drs gives them as
    // fractions of the lap from the real timing line, where the lap starts.
    drsZones: drs && drs.map(z => z.map(f => f * length)),
    // z, bank: the centreline height (m) and cross-slope (height gained per
    // metre to the left) at each sample, all zero without heights.
    samples: { x: xs, y: ys, s: ss, heading: headings, curvature, kerb, line, lineStep, lineCurvature, z: zs, bank: banking },
    heading: s => headings[index(s)], curvatureAt: s => curvature[index(s)],
    // Racing-line offset (m, + right) at arc length s, interpolated.
    lineOffset: s => { const i = index(s), f = (wrap(s) - ss[i]) / (ss[i + 1] - ss[i]); return line[i] + (line[(i + 1) % n] - line[i]) * f; },
    surfaceAt: (x, y) => { const name = surface(x, y); return LOOSE[name] ?? SURFACE_GRIP[name]; },
    // Elevation (all zero without heights): elevation(s, off) along the lap,
    // heightAt(x, y) from the nearest part of the circuit; lakeLevel, if any,
    // is the height of the water beside it.
    hasElevation: !!heights, lakeLevel, elevation,
    heightAt: (x, y) => { const q = nearest(x, y); return elevation(ss[q.i] + (ss[q.i + 1] - ss[q.i]) * q.f, q.offset); },
    // For the physics (null without heights): the ground's world gradient
    // (gx, gy) = (dz/dx, dz/dy) under (x, y) and the road profile's second
    // derivative along the lap (zss, 1/m: + in compressions, - over crests),
    // all from the nearest part of the circuit, so a crossover's other level
    // never leaks in. zss spans ±25 m: the telemetry heights (0.1 m steps,
    // 10 m apart) give a ±10 m stencil bumps of up to 9e-4/m even at flat
    // Monza (0.6 g at 80 m/s); at ±25 m that falls to 4.5e-4 while Eau
    // Rouge's compression (2.5e-3, 1 km from the line) keeps 77% of its size.
    groundAt: heights ? (x, y) => {
      const q = nearest(x, y), s = ss[q.i] + (ss[q.i + 1] - ss[q.i]) * q.f, off = q.offset, h = headings[q.i];
      const along = (elevation(s + 2, off) - elevation(s - 2, off)) / 4, across = elevation(s, off + 0.5) - elevation(s, off - 0.5);
      const zss = (elevation(s + 25, off) - 2 * elevation(s, off) + elevation(s - 25, off)) / 625;
      return { gx: along * Math.cos(h) + across * Math.sin(h), gy: along * Math.sin(h) - across * Math.cos(h), zss };
    } : null,
    // Walls wallOffset either side of the centreline; where two parts of the
    // circuit run closer than that, the boundary is the midline between them.
    barrierAt: (x, y) => {
      const q = nearest(x, y), depth = q.d - wallOffset;
      return depth > 0 ? { depth, nx: (q.px - x) / q.d, ny: (q.py - y) / q.d } : null;
    },
  };
}
