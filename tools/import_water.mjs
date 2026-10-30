// Writes src/water.mjs: the real lakes, ponds, rivers and basins around each
// real circuit, from OpenStreetMap (Overpass API; © OpenStreetMap
// contributors, ODbL). Each circuit is tied to the globe through its
// bacinger/f1-circuits trace (osm_frame.mjs). The water polygons
// (natural=water, waterway=riverbank, landuse=reservoir; multipolygons with
// their islands) are mapped into the circuit's frame, clipped to 1500 m
// around the circuit, simplified to 3 m and kept from 1500 m² up. A polygon
// the road runs through (bridges, culverts) is left out. Responses are
// cached in /tmp/osm.
//   node tools/import_water.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, area, inside, clip, simplifyRing, frame, rad2deg } from './osm_frame.mjs';

const MARGIN = 1500, MIN_AREA = 1500, TOL = 3;
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
  const { X, Y, fit, toLocal, box: boxOf, bb: bbOf } = frame(c), box = boxOf(MARGIN), bb = bbOf(MARGIN);
  const q = `[out:json][timeout:120];(wr["natural"="water"](${bb});wr["waterway"="riverbank"](${bb});wr["landuse"="reservoir"](${bb}););out geom;`;
  const osm = await overpass(`water-${id}.json`, q);
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
    const prep = rings => rings.map(r => clip(r.map(toLocal), box)).filter(r => r.length > 2).map(r => simplifyRing(r, TOL)).filter(r => r.length > 2 && Math.abs(area(r)) >= MIN_AREA);
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
  report.push(`${id}: fit rotation ${(fit.th * rad2deg).toFixed(2)}°, scale ${fit.k.toFixed(4)}, ${fit.rms.toFixed(1)} m rms; ${polys.length} water polygons, ${Math.round(polys.reduce((a, p) => a + p.wet, 0) / 1e4)} ha${named.length ? ' (' + named.join(', ') + ')' : ''}`);
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
