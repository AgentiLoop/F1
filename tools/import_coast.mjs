// Writes src/coast.mjs: the real sea beside each coastal circuit, from the
// OpenStreetMap coastline (Overpass API; © OpenStreetMap contributors, ODbL).
// OSM coastline ways run with the land on their left and the sea on their
// right. They are joined end to end, mapped into the circuit's frame
// (osm_frame.mjs), cut to a square reaching 1600 m past the terrain's
// furthest point from the circuit's centre, and closed into sea polygons
// along the square's edge (clockwise, keeping the sea on the right); closed
// rings inside it are islands (or, run clockwise, enclosed sea). Simplified
// to 4 m. Responses are cached in /tmp/osm.
//   node tools/import_coast.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, area, inside, simplify, simplifyRing, frame } from './osm_frame.mjs';

const BEYOND = 1400 + 1600, MIN_AREA = 1500, TOL = 4;
// Joins ways (arrays of [lon, lat]) head to tail, keeping their direction.
const join = ways => {
  const key = p => `${p[0]},${p[1]}`, left = ways.map(w => w.slice()), chains = [];
  while (left.length) {
    let cur = left.shift();
    for (let grew = true; grew && key(cur[0]) !== key(cur.at(-1));) {
      grew = false;
      const i = left.findIndex(w => key(w[0]) === key(cur.at(-1)));
      if (i >= 0) { cur = cur.concat(left.splice(i, 1)[0].slice(1)); grew = true; }
      const j = left.findIndex(w => key(w.at(-1)) === key(cur[0]));
      if (j >= 0) { cur = left.splice(j, 1)[0].concat(cur.slice(1)); grew = true; }
    }
    chains.push(cur);
  }
  return chains;
};
// Liang–Barsky: the part [t0, t1] of segment a→b inside the box, or null.
const clipSeg = (a, b, [x0, y0, x1, y1]) => {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; t0 = Math.max(t0, r); } else { if (r < t0) return null; t1 = Math.min(t1, r); }
  }
  return [t0, t1];
};

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { X, Y, toLocal, box: boxOf, bb: bbOf } = frame(c);
  let [x0, y0, x1, y1] = boxOf(0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, E = Math.hypot(x1 - x0, y1 - y0) / 2 + BEYOND;
  const B = [cx - E, cy - E, cx + E, cy + E];
  const osm = await overpass(`coast-${id}.json`, `[out:json][timeout:120];way["natural"="coastline"](${bbOf(E)});out geom;`);
  const chains = join(osm.elements.filter(e => e.geometry).map(e => e.geometry.map(p => [p.lon, p.lat]))).map(ch => ch.map(toLocal));
  const isIn = p => p[0] >= B[0] && p[0] <= B[2] && p[1] >= B[1] && p[1] <= B[3];
  // Pieces of chain inside B, each entering and leaving through its edge;
  // closed rings wholly inside B.
  const pieces = [], rings = [];
  for (let ch of chains) {
    const closed = ch.length > 3 && Math.hypot(ch[0][0] - ch.at(-1)[0], ch[0][1] - ch.at(-1)[1]) < 1e-6;
    if (closed && ch.every(isIn)) { rings.push(simplifyRing(ch.slice(0, -1), TOL)); continue; }
    if (closed) { const k = ch.findIndex(p => !isIn(p)); ch = [...ch.slice(k, -1), ...ch.slice(0, k + 1)]; }
    let cur = null;
    for (let i = 0; i + 1 < ch.length; i++) {
      const a = ch[i], b = ch[i + 1], t = clipSeg(a, b, B);
      if (!t) continue;
      const at = u => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      if (!cur) cur = [at(t[0])];
      cur.push(at(t[1]));
      if (t[1] < 1) { pieces.push(cur); cur = null; }
    }
    if (cur) throw new Error(`${id}: a coastline ends inside the box`);
  }
  // Clockwise position around B's edge from its top-left corner.
  const W = B[2] - B[0], H = B[3] - B[1], per = 2 * (W + H), eps = 1e-6;
  const edge = ([x, y]) => Math.abs(y - B[3]) < eps ? x - B[0] : Math.abs(x - B[2]) < eps ? W + B[3] - y : Math.abs(y - B[1]) < eps ? W + H + B[2] - x : 2 * W + H + y - B[1];
  const corners = [[0, [B[0], B[3]]], [W, [B[2], B[3]]], [W + H, [B[2], B[1]]], [2 * W + H, [B[0], B[1]]]];
  const P = pieces.map(p => ({ pts: simplify(p, TOL), tin: edge(p[0]), tout: edge(p.at(-1)), used: false }));
  const seas = [];
  for (const start of P) {
    if (start.used) continue;
    const ring = [];
    for (let q = start; ;) {
      q.used = true; ring.push(...q.pts);
      const gap = r => (r.tin - q.tout + per) % per;
      const next = P.filter(r => !r.used || r === start).reduce((m, r) => gap(r) < gap(m) ? r : m);
      // The corners passed on the way, in clockwise order.
      const along = ([t]) => (t - q.tout + per) % per;
      ring.push(...corners.filter(k => along(k) < gap(next)).sort((a, b) => along(a) - along(b)).map(([, p]) => p));
      if (next === start) break;
      q = next;
    }
    seas.push(ring);
  }
  for (const r of rings) if (area(r) < 0) seas.push(r);
  const islands = rings.filter(r => area(r) > 0);
  if (!pieces.length && islands.length) seas.push(corners.map(([, p]) => p));
  const polys = seas.filter(s => -area(s) >= MIN_AREA).map(s => [s, ...islands.filter(h => Math.abs(area(h)) >= MIN_AREA && inside([s], h[0][0], h[0][1]))]);
  let nearest = Infinity, wet = 0;
  for (const p of polys) {
    wet += -area(p[0]) - p.slice(1).reduce((a, h) => a + area(h), 0);
    for (let i = 0; i < X.length; i += 4) {
      if (inside(p, X[i], Y[i])) throw new Error(`${id}: road sample ${i} in the sea`);
      for (const r of p) for (const [x, y] of r) nearest = Math.min(nearest, Math.hypot(x - X[i], y - Y[i]));
    }
  }
  if (!polys.length) continue;
  // Stored like water.mjs: outer anticlockwise, islands clockwise.
  out[id] = polys.map(p => p.map(r => r.slice().reverse().flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));
  report.push(`${id}: ${polys.length} sea polygon(s), ${polys.reduce((a, p) => a + p.length - 1, 0)} island(s), ${Math.round(wet / 1e4)} ha within ${Math.round(E)} m of the centre, shore ${Math.round(nearest)} m from the road, ${out[id].reduce((a, p) => a + p.reduce((b, r) => b + r.length / 2, 0), 0)} vertices`);
}

const head = `// The real sea beside each coastal circuit (circuits.mjs keys), from the
// OpenStreetMap coastline (© OpenStreetMap contributors, ODbL,
// openstreetmap.org/copyright), placed in each circuit's local east/north
// metres through its bacinger/f1-circuits trace, closed along a square
// reaching ${BEYOND} m past the circuit's half-diagonal from its centre, and
// simplified to ${TOL} m (tools/import_coast.mjs). Same form as water.mjs: each
// polygon [outer, ...islands], each ring flat [x, y, x, y, ...] (outer
// anticlockwise, islands clockwise). Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, polys]) => `  '${id}': [${polys.map(p => `[${p.map(r => `[${r.join(',')}]`).join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/coast.mjs', import.meta.url), `${head}export const COAST = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
