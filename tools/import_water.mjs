// Writes src/water.mjs: the real lakes, ponds, rivers and basins around each
// real circuit, from OpenStreetMap (Overpass API; © OpenStreetMap
// contributors, ODbL). The circuits' local frame is tied to the globe through
// the bacinger/f1-circuits GeoJSON traces they were first placed on: each
// trace is projected (equirectangular about its centroid, east/north m) and
// fitted onto the built track's centreline (rotation, scale and shift, least
// squares over 400 points matched by lap fraction, the best of every
// starting offset). The water polygons (natural=water, waterway=riverbank,
// landuse=reservoir; multipolygons with their islands) are mapped through
// the same fit, clipped to 1500 m around the circuit, simplified to 3 m and
// kept from 1500 m² up. A polygon the road runs through (bridges, culverts)
// is left out. Responses are cached in /tmp/osm.
//   node tools/import_water.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';

const CACHE = '/tmp/osm', MARGIN = 1500, MIN_AREA = 1500, TOL = 3, UA = 'F1-sim-water-import/1.0';
mkdirSync(CACHE, { recursive: true });
const cached = async (name, fetcher) => {
  const f = `${CACHE}/${name}`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const text = await fetcher(); writeFileSync(f, text); return JSON.parse(text);
};
const traces = await cached('f1-circuits.geojson', async () => (await fetch('https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson')).text());

const R = 6371008.8, rad = Math.PI / 180;
const resample = (P, m) => {
  const cum = [0];
  for (let i = 0; i < P.length; i++) cum.push(cum[i] + Math.hypot(P[(i + 1) % P.length][0] - P[i][0], P[(i + 1) % P.length][1] - P[i][1]));
  const out = [];
  for (let k = 0, i = 0; k < m; k++) {
    const d = cum.at(-1) * k / m;
    while (cum[i + 1] < d) i++;
    const f = (d - cum[i]) / (cum[i + 1] - cum[i] || 1), a = P[i], b = P[(i + 1) % P.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
};
// Similarity q = k·Rot(θ)·(p − mp) + mq fitted to pairs (p, q).
const procrustes = (Pp, Qq) => {
  const n = Pp.length, mp = [0, 0], mq = [0, 0];
  for (let i = 0; i < n; i++) { mp[0] += Pp[i][0] / n; mp[1] += Pp[i][1] / n; mq[0] += Qq[i][0] / n; mq[1] += Qq[i][1] / n; }
  let a = 0, b = 0, pp = 0;
  for (let i = 0; i < n; i++) {
    const px = Pp[i][0] - mp[0], py = Pp[i][1] - mp[1], qx = Qq[i][0] - mq[0], qy = Qq[i][1] - mq[1];
    a += px * qx + py * qy; b += px * qy - py * qx; pp += px * px + py * py;
  }
  const th = Math.atan2(b, a), k = Math.hypot(a, b) / pp, c = Math.cos(th) * k, s = Math.sin(th) * k;
  const map = ([x, y]) => [c * (x - mp[0]) - s * (y - mp[1]) + mq[0], s * (x - mp[0]) + c * (y - mp[1]) + mq[1]];
  let e = 0; for (let i = 0; i < n; i++) { const [x, y] = map(Pp[i]); e += (x - Qq[i][0]) ** 2 + (y - Qq[i][1]) ** 2; }
  return { th, k, map, rms: Math.sqrt(e / n) };
};
const area = ring => { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const inside = (rings, x, y) => {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};
// Sutherland–Hodgman against an axis-aligned box.
const clip = (ring, [x0, y0, x1, y1]) => {
  let out = ring;
  for (const [axis, lim, keepLess] of [[0, x0, false], [0, x1, true], [1, y0, false], [1, y1, true]]) {
    const inp = out; out = [];
    const ok = p => keepLess ? p[axis] <= lim : p[axis] >= lim;
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      if (ok(a)) out.push(a);
      if (ok(a) !== ok(b)) { const t = (lim - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    if (!out.length) return out;
  }
  return out;
};
const simplify = (pts, tol) => {
  if (pts.length < 3) return pts;
  let best = 0, at = 0;
  const [a, b] = [pts[0], pts.at(-1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
    if (d > best) { best = d; at = i; }
  }
  return best <= tol ? [a, b] : [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
};
const simplifyRing = ring => {
  // Split at the vertex furthest from the first so both halves are open paths.
  let far = 0, fd = 0;
  for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > fd) { fd = d; far = i; } }
  return [...simplify(ring.slice(0, far + 1), TOL).slice(0, -1), ...simplify([...ring.slice(far), ring[0]], TOL).slice(0, -1)];
};
// Joins open ways (arrays of [lon, lat]) end to end into closed rings.
const stitch = ways => {
  const key = p => `${p[0]},${p[1]}`, rings = [], left = ways.map(w => w.slice());
  while (left.length) {
    let cur = left.shift();
    while (key(cur[0]) !== key(cur.at(-1))) {
      const i = left.findIndex(w => key(w[0]) === key(cur.at(-1)) || key(w.at(-1)) === key(cur.at(-1)));
      if (i < 0) { cur = null; break; }
      const w = left.splice(i, 1)[0];
      cur = cur.concat((key(w[0]) === key(cur.at(-1)) ? w : w.reverse()).slice(1));
    }
    if (cur) rings.push(cur.slice(0, -1));
  }
  return rings;
};

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const f = traces.features.find(t => t.properties.Name === c.name);
  const geo = f.geometry.coordinates, lon0 = geo.reduce((a, p) => a + p[0], 0) / geo.length, lat0 = geo.reduce((a, p) => a + p[1], 0) / geo.length;
  const project = ([lon, lat]) => [R * (lon - lon0) * rad * Math.cos(lat0 * rad), R * (lat - lat0) * rad];
  const track = createCircuitTrack({ ...c, pitLane: false }), { x: X, y: Y } = track.samples;
  const ours = resample(Array.from(X, (x, i) => [x, Y[i]]), 400);
  const traced = geo.map(project); if (Math.hypot(traced[0][0] - traced.at(-1)[0], traced[0][1] - traced.at(-1)[1]) < 1) traced.pop();
  let fit = null;
  for (const dir of [traced, traced.slice().reverse()]) {
    const P = resample(dir, 400);
    for (let sh = 0; sh < 400; sh++) { const r = procrustes(P.map((_, i) => P[(i + sh) % 400]), ours); if (!fit || r.rms < fit.rms) fit = r; }
  }
  const toLocal = p => fit.map(project(p));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < X.length; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
  const box = [x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN];
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (const [lon, lat] of geo) { la0 = Math.min(la0, lat); la1 = Math.max(la1, lat); lo0 = Math.min(lo0, lon); lo1 = Math.max(lo1, lon); }
  const dLat = (MARGIN + 300) / (R * rad), dLon = dLat / Math.cos(lat0 * rad), bb = `${la0 - dLat},${lo0 - dLon},${la1 + dLat},${lo1 + dLon}`;
  const q = `[out:json][timeout:120];(wr["natural"="water"](${bb});wr["waterway"="riverbank"](${bb});wr["landuse"="reservoir"](${bb}););out geom;`;
  const osm = await cached(`water-${id}.json`, async () => {
    for (let attempt = 0; ; attempt++) {
      await new Promise(r => setTimeout(r, 3000 + attempt * 15000));
      const host = ['https://overpass-api.de', 'https://overpass.kumi.systems'][attempt % 2];
      const res = await fetch(`${host}/api/interpreter`, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (res.ok) return res.text();
      if (attempt >= 5) throw new Error(`${id}: Overpass ${res.status}`);
    }
  });
  const polys = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    if (t.covered === 'yes' || t.tunnel || t.intermittent === 'yes' || t.seasonal === 'yes') continue;
    let outer = [], holes = [];
    if (e.type === 'way' && e.geometry) {
      const g = e.geometry.map(p => [p.lon, p.lat]);
      if (g.length > 3 && g[0][0] === g.at(-1)[0] && g[0][1] === g.at(-1)[1]) outer = [g.slice(0, -1)];
    } else if (e.type === 'relation') {
      const ways = role => e.members.filter(m => m.type === 'way' && m.role === role && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat]));
      outer = stitch(ways('outer')); holes = stitch(ways('inner'));
    }
    const prep = rings => rings.map(r => clip(r.map(toLocal), box)).filter(r => r.length > 2).map(simplifyRing).filter(r => r.length > 2 && Math.abs(area(r)) >= MIN_AREA);
    const H = prep(holes);
    for (const o of prep(outer)) {
      const mine = H.filter(h => inside([o], h[0][0], h[0][1]));
      const rings = [o, ...mine], wet = Math.abs(area(o)) - mine.reduce((a, h) => a + Math.abs(area(h)), 0);
      if (wet < MIN_AREA) continue;
      let crosses = false;
      for (let i = 0; i < X.length && !crosses; i++) crosses = inside(rings, X[i], Y[i]);
      const name = t.name ?? t['name:en'] ?? t.water ?? 'water';
      if (crosses) { report.push(`  ${id}: skipped ${name} (${Math.round(wet)} m², the road crosses it)`); continue; }
      polys.push({ name, wet, rings: rings.map(r => (area(r) < 0 === (r === o) ? r.slice().reverse() : r)) });
    }
  }
  polys.sort((a, b) => b.wet - a.wet);
  out[id] = polys.map(p => p.rings.map(r => r.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));
  const named = [...new Set(polys.filter(p => !/^(water|pond|basin|lake|river|reservoir|canal|stream_pool|wastewater|reflecting_pool|lagoon|moat|fountain)$/.test(p.name)).map(p => p.name))].slice(0, 6);
  report.push(`${id}: fit rotation ${(fit.th / rad).toFixed(2)}°, scale ${fit.k.toFixed(4)}, ${fit.rms.toFixed(1)} m rms; ${polys.length} water polygons, ${Math.round(polys.reduce((a, p) => a + p.wet, 0) / 1e4)} ha${named.length ? ' (' + named.join(', ') + ')' : ''}`);
}

const head = `// Real water around each real circuit (circuits.mjs keys): lakes, ponds,
// rivers and basins from OpenStreetMap (© OpenStreetMap contributors, ODbL,
// openstreetmap.org/copyright), placed in each circuit's local east/north
// metres through its bacinger/f1-circuits trace, clipped to ${MARGIN} m around the
// circuit and simplified to ${TOL} m (tools/import_water.mjs). Each polygon is
// [outer, ...islands], each ring flat [x, y, x, y, ...] (outer anticlockwise,
// islands clockwise); none is crossed by the road. Generated; do not edit by
// hand.
`;
const body = Object.entries(out).map(([id, polys]) => `  '${id}': [${polys.map(p => `[${p.map(r => `[${r.join(',')}]`).join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/water.mjs', import.meta.url), `${head}export const WATER = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
