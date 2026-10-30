// Writes src/bridges.mjs: the road, railway and foot bridges and viaducts
// around each real circuit, from OpenStreetMap (Overpass API; ©
// OpenStreetMap contributors, ODbL): the ways the roads and barriers
// importers leave out because they are bridges (bridge=* other than no,
// above ground: layer ≥ 1 or untagged), i.e. the same road classes as
// import_roads.mjs, railway=rail/light_rail/tram/narrow_gauge/subway, and
// footway/path/cycleway/steps footbridges. Each circuit is tied to the
// globe through its bacinger/f1-circuits trace (osm_frame.mjs); the ways
// are mapped into the circuit's frame, clipped to 600 m around the circuit
// and simplified to 1 m. Responses are cached in /tmp/osm (the roads and
// barriers importers' queries are reused).
//   node tools/import_bridges.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, simplify, frame, clipPath } from './osm_frame.mjs';

const MARGIN = 600, TOL = 1;
const ROAD = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(unclassified|residential|living_street|pedestrian|service)$/;
const FOOT = /^(footway|path|cycleway|steps|bridleway)$/;
const RAIL = ['rail', 'light_rail', 'tram', 'narrow_gauge', 'subway'];
const WIDTH = { motorway: 11, trunk: 10, primary: 9, secondary: 8, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, pedestrian: 5, service: 4.5 };
const roadWidth = t => {
  const cls = t.highway.replace(/_link$/, ''), w = parseFloat(t.width), lanes = parseInt(t.lanes, 10), one = t.oneway === 'yes' || t.junction === 'roundabout' || t.highway.endsWith('_link');
  if (w >= 2.5 && w <= 40) return w;
  if (lanes >= 1 && lanes <= 10) return lanes * 3.3 + (cls === 'motorway' || cls === 'trunk' ? 2 : 0.6);
  return one ? Math.min(WIDTH[cls], 7.5) : WIDTH[cls];
};

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, box: boxOf, bb: bbOf } = frame(c), box = boxOf(MARGIN), bb = bbOf(MARGIN);
  const roads = await overpass(`roads-${id}.json`, `[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(unclassified|residential|living_street|pedestrian|service)$"](${bb});out tags geom;`);
  const rails = await overpass(`barriers-${id}.json`, `[out:json][timeout:180];(way["barrier"~"^(wall|retaining_wall|fence|hedge|guard_rail|jersey_barrier)$"](${bb});way["railway"~"^(rail|light_rail|tram|narrow_gauge|subway)$"](${bb}););out tags geom;`);
  const foot = await overpass(`footbridges-${id}.json`, `[out:json][timeout:180];way["highway"~"^(footway|path|cycleway|steps|bridleway)$"]["bridge"](${bb});out tags geom;`);
  const list = [], km = [0, 0, 0], seen = new Set();
  for (const e of [...roads.elements, ...rails.elements, ...foot.elements]) {
    const t = e.tags ?? {};
    if (seen.has(e.id) || !e.geometry || !t.bridge || t.bridge === 'no' || (t.tunnel && t.tunnel !== 'no') || t.area === 'yes' || (t.layer && !(+t.layer >= 1))) continue;
    seen.add(e.id);
    let kind, w;
    if (t.railway) { if (!RAIL.includes(t.railway)) continue; kind = 1; w = 5; }
    else if (ROAD.test(t.highway ?? '')) { kind = 0; w = roadWidth(t); }
    else if (FOOT.test(t.highway ?? '')) { kind = 2; const fw = parseFloat(t.width); w = fw >= 1 && fw <= 10 ? fw : 3; }
    else continue;
    const layer = Math.min(3, Math.max(1, parseInt(t.layer, 10) || 1));
    for (const part of clipPath(e.geometry.map(p => toLocal([p.lon, p.lat])), box)) {
      const s = simplify(part, TOL).map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      if (s.length < 2) continue;
      list.push([kind, Math.round(w * 2) / 2, layer, ...s.flat()]);
      for (let i = 1; i < s.length; i++) km[kind] += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]) / 1000;
    }
  }
  list.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  out[id] = list;
  report.push(`${id}: ${list.length} bridges; road ${km[0].toFixed(2)} km, railway ${km[1].toFixed(2)} km, foot ${km[2].toFixed(2)} km`);
}

const head = `// The road, railway and foot bridges and viaducts around each real
// circuit (circuits.mjs keys), from OpenStreetMap (© OpenStreetMap
// contributors, ODbL, openstreetmap.org/copyright), placed in each circuit's
// local east/north metres through its bacinger/f1-circuits trace, within
// ${MARGIN} m of the circuit (tools/import_bridges.mjs). Each bridge is
// [kind, width m, layer, x, y, x, y, ...] in whole metres, simplified to
// ${TOL} m; kind 0 road, 1 railway track, 2 footbridge; layer 1-3 (OSM's
// layer tag, 1 where untagged).
// Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, l]) => `  '${id}': [${l.map(r => `[${r.join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/bridges.mjs', import.meta.url), `${head}export const BRIDGES = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
