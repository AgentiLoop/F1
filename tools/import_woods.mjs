// Writes src/woods.mjs: the real woods and trees around each real circuit,
// from OpenStreetMap (Overpass API; © OpenStreetMap contributors, ODbL).
// Each circuit is tied to the globe through its bacinger/f1-circuits trace
// (osm_frame.mjs). Woods (natural=wood, landuse=forest; multipolygons with
// their clearings) are mapped into the circuit's frame, clipped to 600 m
// around the circuit, simplified to 4 m and kept from 300 m² up; single
// trees (natural=tree) and tree rows (natural=tree_row, a tree every 8 m)
// within the same box are kept as points. Each carries its leaf type
// (leaf_type: 1 broadleaved, 2 needleleaved, 3 mixed, 0 not mapped).
// Responses are cached in /tmp/osm.
//   node tools/import_woods.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, area, inside, clip, simplifyRing, frame } from './osm_frame.mjs';

const MARGIN = 600, MIN_AREA = 300, TOL = 4, ROW_STEP = 8;
const LEAF = { broadleaved: 1, needleleaved: 2, mixed: 3 };
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
const r1 = v => Math.round(v * 10) / 10;

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, box: boxOf, bb: bbOf } = frame(c), box = boxOf(MARGIN), bb = bbOf(MARGIN);
  const q = `[out:json][timeout:180];(wr["natural"="wood"](${bb});wr["landuse"="forest"](${bb});node["natural"="tree"](${bb});way["natural"="tree_row"](${bb}););out geom;`;
  const osm = await overpass(`woods-${id}.json`, q);
  const woods = [], trees = [];
  const inBox = ([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  for (const e of osm.elements) {
    const t = e.tags ?? {}, leaf = LEAF[t.leaf_type] ?? 0;
    if (e.type === 'node') { const p = toLocal([e.lon, e.lat]); if (inBox(p)) trees.push(r1(p[0]), r1(p[1]), leaf); continue; }
    if (t.natural === 'tree_row' && e.geometry) {
      const g = e.geometry.map(p => toLocal([p.lon, p.lat]));
      for (let i = 0, carry = 0; i < g.length - 1; i++) {
        const [ax, ay] = g[i], [bx, by] = g[i + 1], L = Math.hypot(bx - ax, by - ay);
        let d = carry;
        for (; d < L; d += ROW_STEP) { const p = [ax + (bx - ax) * d / L, ay + (by - ay) * d / L]; if (inBox(p)) trees.push(r1(p[0]), r1(p[1]), leaf); }
        carry = d - L;
      }
      continue;
    }
    let outer = [], holes = [];
    if (e.type === 'way' && e.geometry) {
      const g = e.geometry.map(p => [p.lon, p.lat]);
      if (g.length > 3 && g[0][0] === g.at(-1)[0] && g[0][1] === g.at(-1)[1]) outer = [g.slice(0, -1)];
    } else if (e.type === 'relation') {
      const ways = role => e.members.filter(m => m.type === 'way' && m.role === role && m.geometry).map(m => m.geometry.map(p => [p.lon, p.lat]));
      outer = stitch(ways('outer')); holes = stitch(ways('inner'));
    }
    const prep = rings => rings.map(r => clip(r.map(toLocal), box)).filter(r => r.length > 2).map(r => simplifyRing(r, TOL)).filter(r => r.length > 2 && Math.abs(area(r)) >= MIN_AREA);
    const H = prep(holes);
    for (const o of prep(outer)) {
      const mine = H.filter(h => inside([o], h[0][0], h[0][1]));
      const leafy = Math.abs(area(o)) - mine.reduce((a, h) => a + Math.abs(area(h)), 0);
      if (leafy < MIN_AREA) continue;
      woods.push({ leaf, leafy, rings: [o, ...mine].map(r => (area(r) < 0 === (r === o) ? r.slice().reverse() : r)) });
    }
  }
  woods.sort((a, b) => b.leafy - a.leafy);
  out[id] = { woods: woods.map(w => [w.leaf, ...w.rings.map(r => r.flatMap(([x, y]) => [r1(x), r1(y)]))]), trees };
  report.push(`${id}: ${woods.length} woods, ${Math.round(woods.reduce((a, w) => a + w.leafy, 0) / 1e4)} ha; ${trees.length / 3} single trees`);
}

const head = `// Real woods and trees around each real circuit (circuits.mjs keys), from
// OpenStreetMap (© OpenStreetMap contributors, ODbL,
// openstreetmap.org/copyright), placed in each circuit's local east/north
// metres through its bacinger/f1-circuits trace, within ${MARGIN} m of the
// circuit (tools/import_woods.mjs). woods: [leaf, outer, ...clearings], each
// ring flat [x, y, x, y, ...] (outer anticlockwise, clearings clockwise),
// natural=wood and landuse=forest clipped to that box and simplified to
// ${TOL} m; trees: flat [x, y, leaf, ...], single trees and tree rows (a tree
// every ${ROW_STEP} m). leaf: OSM leaf_type, 1 broadleaved, 2 needleleaved,
// 3 mixed, 0 not mapped. Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, { woods, trees }]) => `  '${id}': { woods: [${woods.map(w => `[${w[0]},${w.slice(1).map(r => `[${r.join(',')}]`).join(',')}]`).join(',\n    ')}],\n    trees: [${trees.join(',')}] },`).join('\n');
writeFileSync(new URL('../src/woods.mjs', import.meta.url), `${head}export const WOODS = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
