// Writes src/roads.mjs: the public roads and streets around each real
// circuit, from OpenStreetMap (Overpass API; © OpenStreetMap contributors,
// ODbL): motorways down to residential streets, service roads and
// pedestrian streets, at ground level (bridges and tunnels left out). Each
// circuit is tied to the globe through its bacinger/f1-circuits trace
// (osm_frame.mjs); the ways are mapped into the circuit's frame, clipped to
// 600 m around the circuit and simplified to 1.5 m. A road's width is its
// width tag, else 3.3 m a lane (lanes tag), else its class's usual width
// (one-way carriageways narrower). Responses are cached in /tmp/osm.
//   node tools/import_roads.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, simplify, frame } from './osm_frame.mjs';

const MARGIN = 600, TOL = 1.5;
const WIDTH = { motorway: 11, trunk: 10, primary: 9, secondary: 8, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, pedestrian: 5, service: 4.5 };
const widthOf = t => {
  const cls = t.highway.replace(/_link$/, ''), w = parseFloat(t.width), lanes = parseInt(t.lanes, 10), one = t.oneway === 'yes' || t.junction === 'roundabout' || t.highway.endsWith('_link');
  if (w >= 2.5 && w <= 40) return w;
  if (lanes >= 1 && lanes <= 10) return lanes * 3.3 + (cls === 'motorway' || cls === 'trunk' ? 2 : 0.6);
  return one ? Math.min(WIDTH[cls], 7.5) : WIDTH[cls];
};

// The parts of an open path inside the box (Liang–Barsky on each segment).
const clipPath = (pts, [x0, y0, x1, y1]) => {
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

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, box: boxOf, bb: bbOf } = frame(c), box = boxOf(MARGIN), bb = bbOf(MARGIN);
  const q = `[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(unclassified|residential|living_street|pedestrian|service)$"](${bb});out tags geom;`;
  const osm = await overpass(`roads-${id}.json`, q);
  const roads = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    if (!e.geometry || (t.bridge && t.bridge !== 'no') || (t.tunnel && t.tunnel !== 'no') || t.area === 'yes' || (t.layer && +t.layer !== 0)
      || t.access === 'private' || ['parking_aisle', 'driveway', 'drive-through'].includes(t.service)) continue;
    const w = Math.round(widthOf(t) * 2) / 2;
    for (const part of clipPath(e.geometry.map(p => toLocal([p.lon, p.lat])), box)) {
      const s = simplify(part, TOL).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      if (s.length > 1) roads.push([w, ...s.flat()]);
    }
  }
  // Widest first, so narrower roads joining them are drawn over them.
  roads.sort((a, b) => b[0] - a[0]);
  out[id] = roads;
  let km = 0; for (const r of roads) for (let i = 3; i + 1 < r.length; i += 2) km += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]) / 1000;
  report.push(`${id}: ${roads.length} roads, ${km.toFixed(1)} km`);
}

const head = `// The public roads and streets around each real circuit (circuits.mjs
// keys), from OpenStreetMap (© OpenStreetMap contributors, ODbL,
// openstreetmap.org/copyright), placed in each circuit's local east/north
// metres through its bacinger/f1-circuits trace, within ${MARGIN} m of the
// circuit (tools/import_roads.mjs): motorways to residential streets,
// service roads and pedestrian streets at ground level (no bridges or
// tunnels). Each road is [width m, x, y, x, y, ...] in whole metres,
// simplified to ${TOL} m, widest first. Where a street circuit runs on public
// roads they include the circuit's own streets.
// Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, roads]) => `  '${id}': [${roads.map(r => `[${r.join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/roads.mjs', import.meta.url), `${head}export const ROADS = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
