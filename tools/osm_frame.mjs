// Shared by the OpenStreetMap importers (import_water.mjs, import_coast.mjs):
// a cache in /tmp/osm, Overpass queries, polygon helpers, and each real
// circuit's tie to the globe. The circuits' local frame is tied to the globe
// through the bacinger/f1-circuits GeoJSON traces they were first placed on:
// each trace is projected (equirectangular about its centroid, east/north m)
// and fitted onto the built track's centreline (rotation, scale and shift,
// least squares over 400 points matched by lap fraction, the best of every
// starting offset).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createCircuitTrack } from '../src/circuit.mjs';

const CACHE = '/tmp/osm', UA = 'F1-sim-water-import/1.0';
mkdirSync(CACHE, { recursive: true });
export const cached = async (name, fetcher) => {
  const f = `${CACHE}/${name}`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const text = await fetcher(); writeFileSync(f, text); return JSON.parse(text);
};
const traces = await cached('f1-circuits.geojson', async () => (await fetch('https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson')).text());

// Overpass (needs a User-Agent; overpass-api.de and kumi.systems often 504,
// so it retries and alternates between them and the mail.ru mirror),
// cached as /tmp/osm/<name>.
export const overpass = (name, q) => cached(name, async () => {
  for (let attempt = 0; ; attempt++) {
    await new Promise(r => setTimeout(r, 3000 + attempt * 15000));
    const host = ['https://maps.mail.ru/osm/tools/overpass', 'https://overpass-api.de', 'https://overpass.kumi.systems'][attempt % 3];
    const res = await fetch(`${host}/api/interpreter`, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }).catch(e => ({ ok: false, status: e.message }));
    if (res.ok) return res.text();
    if (attempt >= 5) throw new Error(`${name}: Overpass ${res.status}`);
  }
});

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
export const area = ring => { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
export const inside = (rings, x, y) => {
  let c = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};
// Joins open ways (arrays of [lon, lat]) end to end into closed rings.
export const stitch = ways => {
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
// Sutherland–Hodgman against an axis-aligned box.
export const clip = (ring, [x0, y0, x1, y1]) => {
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
// Douglas–Peucker on an open path.
// The parts of an open path inside the box (Liang–Barsky on each segment).
export const clipPath = (pts, [x0, y0, x1, y1]) => {
  const out = []; let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) ok = false; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    }
    if (!ok || t0 > t1) { cur = null; continue; }
    const a = [ax + dx * t0, ay + dy * t0], b = [ax + dx * t1, ay + dy * t1];
    if (!cur || t0 > 0) { cur = [a]; out.push(cur); }
    cur.push(b);
    if (t1 < 1) cur = null;
  }
  return out;
};

export const simplify = (pts, tol) => {
  if (pts.length < 3) return pts;
  let best = 0, at = 0;
  const [a, b] = [pts[0], pts.at(-1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
    if (d > best) { best = d; at = i; }
  }
  return best <= tol ? [a, b] : [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
};
export const simplifyRing = (ring, tol) => {
  // Split at the vertex furthest from the first so both halves are open paths.
  let far = 0, fd = 0;
  for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > fd) { fd = d; far = i; } }
  return [...simplify(ring.slice(0, far + 1), tol).slice(0, -1), ...simplify([...ring.slice(far), ring[0]], tol).slice(0, -1)];
};

// The circuit `c` (a circuits.mjs entry) tied to the globe: its built
// centreline samples X, Y; toLocal([lon, lat]) → local [x, y]; the fit
// (th rad, k, rms m); box(margin), the local box `margin` m around the
// circuit; and bb(margin), an Overpass "s,w,n,e" box a little larger.
export function frame(c) {
  const f = traces.features.find(t => t.properties.Name === c.name);
  const geo = f.geometry.coordinates, lon0 = geo.reduce((a, p) => a + p[0], 0) / geo.length, lat0 = geo.reduce((a, p) => a + p[1], 0) / geo.length;
  const project = ([lon, lat]) => [R * (lon - lon0) * rad * Math.cos(lat0 * rad), R * (lat - lat0) * rad];
  const track = createCircuitTrack({ ...c, pitLane: false, timingLine: 0 }), { x: X, y: Y } = track.samples;
  const ours = resample(Array.from(X, (x, i) => [x, Y[i]]), 400);
  const traced = geo.map(project); if (Math.hypot(traced[0][0] - traced.at(-1)[0], traced[0][1] - traced.at(-1)[1]) < 1) traced.pop();
  let fit = null;
  for (const dir of [traced, traced.slice().reverse()]) {
    const P = resample(dir, 400);
    for (let sh = 0; sh < 400; sh++) { const r = procrustes(P.map((_, i) => P[(i + sh) % 400]), ours); if (!fit || r.rms < fit.rms) fit = r; }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < X.length; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (const [lon, lat] of geo) { la0 = Math.min(la0, lat); la1 = Math.max(la1, lat); lo0 = Math.min(lo0, lon); lo1 = Math.max(lo1, lon); }
  return {
    X, Y, fit, toLocal: p => fit.map(project(p)),
    box: margin => [x0 - margin, y0 - margin, x1 + margin, y1 + margin],
    bb: margin => { const dLat = (margin + 300) / (R * rad), dLon = dLat / Math.cos(lat0 * rad); return `${la0 - dLat},${lo0 - dLon},${la1 + dLat},${lo1 + dLon}`; },
  };
}
export const rad2deg = 1 / rad;
