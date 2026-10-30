// Writes src/landcover.mjs: what covers the open ground around each real
// circuit, from OpenStreetMap (Overpass API; © OpenStreetMap contributors,
// ODbL): farmland, grass (meadows, lawns, parks, sports pitches, golf
// courses), scrub and heath, sand (beaches, dunes, golf bunkers), gravel
// (shingle and gravel traps, bare rock, building sites) and paved ground
// (car parks, paddocks, asphalt run-off). Each circuit is tied to the globe
// through its bacinger/f1-circuits trace (osm_frame.mjs); the areas
// (multipolygons with their holes) are mapped into the circuit's frame,
// clipped to 600 m around the circuit, simplified to 3 m and kept from
// 150 m² up. A surface tag decides the class before the land use does (a
// grass car park is grass). Responses are cached in /tmp/osm.
//   node tools/import_landcover.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { overpass, area, inside, clip, simplifyRing, stitch, frame } from './osm_frame.mjs';

const MARGIN = 600, MIN_AREA = 150, TOL = 3;
const FARM = 1, GRASS = 2, SCRUB = 3, SAND = 4, GRAVEL = 5, PAVED = 6;
const any = (v, list) => list.includes(v);
const classOf = t => {
  const s = t.surface;
  if (t.golf === 'bunker' || any(t.natural, ['sand', 'beach', 'dune']) || s === 'sand') return SAND;
  if (any(t.natural, ['shingle', 'scree', 'bare_rock']) || any(s, ['gravel', 'fine_gravel', 'pebblestone', 'compacted', 'unpaved', 'dirt', 'ground'])
    || any(t.landuse, ['construction', 'brownfield', 'quarry'])) return GRAVEL;
  if (any(s, ['asphalt', 'concrete', 'concrete:plates', 'paved', 'paving_stones', 'sett']) || t['area:highway']
    || (t.amenity === 'parking' && !any(s, ['grass', 'grass_paver']))) return PAVED;
  if (any(s, ['grass', 'grass_paver']) || any(t.landuse, ['meadow', 'grass', 'recreation_ground', 'village_green']) || t.natural === 'grassland'
    || any(t.leisure, ['park', 'pitch', 'golf_course', 'garden']) || any(t.golf, ['fairway', 'green', 'rough', 'tee', 'driving_range'])) return GRASS;
  if (any(t.natural, ['scrub', 'heath'])) return SCRUB;
  if (any(t.landuse, ['farmland', 'orchard', 'vineyard', 'allotments', 'plant_nursery', 'greenfield'])) return FARM;
  return 0;
};

const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, box: boxOf, bb: bbOf } = frame(c), box = boxOf(MARGIN), bb = bbOf(MARGIN);
  const q = `[out:json][timeout:180];(wr["landuse"~"^(farmland|meadow|grass|orchard|vineyard|recreation_ground|village_green|allotments|plant_nursery|greenfield|brownfield|construction|quarry)$"](${bb});wr["natural"~"^(sand|beach|dune|scrub|heath|grassland|bare_rock|scree|shingle)$"](${bb});wr["amenity"="parking"](${bb});wr["leisure"~"^(park|pitch|golf_course|garden)$"](${bb});wr["golf"](${bb});way["area:highway"](${bb});way["surface"]["area"="yes"](${bb});way["surface"][!"highway"][!"building"](${bb}););out geom;`;
  const osm = await overpass(`landcover-${id}.json`, q);
  const areas = [], seen = new Set();
  for (const e of osm.elements) {
    const t = e.tags ?? {}, cls = classOf(t);
    if (!cls || seen.has(`${e.type}${e.id}`)) continue;
    seen.add(`${e.type}${e.id}`);
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
      const size = Math.abs(area(o)) - mine.reduce((a, h) => a + Math.abs(area(h)), 0);
      if (size >= MIN_AREA) areas.push({ cls, size, rings: [o, ...mine].map(r => (area(r) < 0 === (r === o) ? r.slice().reverse() : r)) });
    }
  }
  // Largest first, so smaller areas inside them (a bunker on a golf course,
  // a car park in a meadow) are painted over them.
  areas.sort((a, b) => b.size - a.size);
  out[id] = areas.map(a => [a.cls, ...a.rings.map(r => r.flatMap(([x, y]) => [Math.round(x), Math.round(y)]))]);
  const ha = k => Math.round(areas.filter(a => a.cls === k).reduce((s, a) => s + a.size, 0) / 1e3) / 10;
  report.push(`${id}: ${areas.length} areas; farm ${ha(FARM)} ha, grass ${ha(GRASS)}, scrub ${ha(SCRUB)}, sand ${ha(SAND)}, gravel ${ha(GRAVEL)}, paved ${ha(PAVED)}`);
}

const head = `// What covers the open ground around each real circuit (circuits.mjs
// keys), from OpenStreetMap (© OpenStreetMap contributors, ODbL,
// openstreetmap.org/copyright), placed in each circuit's local east/north
// metres through its bacinger/f1-circuits trace, within ${MARGIN} m of the
// circuit (tools/import_landcover.mjs). Each area is [class, outer,
// ...holes], each ring flat [x, y, x, y, ...] in whole metres (outer
// anticlockwise, holes clockwise), simplified to ${TOL} m, largest first.
// class: 1 farmland, 2 grass, 3 scrub or heath, 4 sand, 5 gravel, 6 paved.
// Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, areas]) => `  '${id}': [${areas.map(a => `[${a[0]},${a.slice(1).map(r => `[${r.join(',')}]`).join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/landcover.mjs', import.meta.url), `${head}export const LANDCOVER = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
