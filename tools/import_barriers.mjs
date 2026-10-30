// Writes src/barriers.mjs: the walls, fences, hedges, guard rails and
// railway lines around each real circuit, from OpenStreetMap (Overpass API;
// © OpenStreetMap contributors, ODbL): barrier=wall/retaining_wall, fence,
// hedge, guard_rail/jersey_barrier, and railway=rail/light_rail/tram/
// narrow_gauge/subway at ground level (bridges, tunnels and other layers
// left out). Each circuit is tied to the globe through its
// bacinger/f1-circuits trace (osm_frame.mjs); the ways are mapped into the
// circuit's frame, clipped to 600 m around the circuit and simplified to
// 1 m. Responses are cached in /tmp/osm.
//   node tools/import_barriers.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, simplify, frame, clipPath } from './osm_frame.mjs';

const MARGIN = 600, TOL = 1;
const RAIL = ['rail', 'light_rail', 'tram', 'narrow_gauge', 'subway'];
const KIND = { wall: 0, retaining_wall: 0, fence: 1, hedge: 2, guard_rail: 3, jersey_barrier: 3 };

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, box: boxOf, bb: bbOf } = frame(c), box = boxOf(MARGIN), bb = bbOf(MARGIN);
  const q = `[out:json][timeout:180];(way["barrier"~"^(wall|retaining_wall|fence|hedge|guard_rail|jersey_barrier)$"](${bb});way["railway"~"^(rail|light_rail|tram|narrow_gauge|subway)$"](${bb}););out tags geom;`;
  const osm = await overpass(`barriers-${id}.json`, q);
  const lines = [], km = [0, 0, 0, 0, 0];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    if (!e.geometry || (t.bridge && t.bridge !== 'no') || (t.tunnel && t.tunnel !== 'no') || (t.layer && +t.layer !== 0) || t.area === 'yes') continue;
    const kind = t.railway ? 4 : KIND[t.barrier];
    if (kind === undefined || (t.railway && !RAIL.includes(t.railway))) continue;
    // Height in decimetres from the height tag (0: the kind's usual height).
    const h = parseFloat(t.height), dm = kind < 4 && h >= 0.3 && h <= 12 ? Math.round(h * 10) : 0;
    for (const part of clipPath(e.geometry.map(p => toLocal([p.lon, p.lat])), box)) {
      const s = simplify(part, TOL).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      if (s.length < 2) continue;
      lines.push([kind, dm, ...s.flat()]);
      for (let i = 1; i < s.length; i++) km[kind] += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]) / 1000;
    }
  }
  lines.sort((a, b) => a[0] - b[0]);
  out[id] = lines;
  report.push(`${id}: ${['walls', 'fences', 'hedges', 'guard rails', 'railway'].map((n, k) => `${n} ${km[k].toFixed(1)} km`).join(', ')}`);
}

const head = `// The walls, fences, hedges, guard rails and railway lines around each
// real circuit (circuits.mjs keys), from OpenStreetMap (© OpenStreetMap
// contributors, ODbL, openstreetmap.org/copyright), placed in each circuit's
// local east/north metres through its bacinger/f1-circuits trace, within
// ${MARGIN} m of the circuit (tools/import_barriers.mjs), at ground level (no
// bridges or tunnels). Each line is [kind, height dm, x, y, x, y, ...] in
// whole metres, simplified to ${TOL} m; kind 0 wall (incl. retaining walls),
// 1 fence, 2 hedge, 3 guard rail (incl. jersey barriers), 4 railway track;
// height 0 where OSM doesn't map it (the kind's usual height).
// Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, lines]) => `  '${id}': [${lines.map(r => `[${r.join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/barriers.mjs', import.meta.url), `${head}export const BARRIERS = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
