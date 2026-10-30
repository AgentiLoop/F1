// Writes src/buildings.mjs: the real buildings around each real circuit —
// grandstands, pit buildings, hotels, houses, the apartment blocks of Monte
// Carlo — from OpenStreetMap (Overpass API; © OpenStreetMap contributors,
// ODbL). Each circuit is tied to the globe through its bacinger/f1-circuits
// trace (osm_frame.mjs). Every footprint (building=*, outer ring) within
// REACH m of the road is mapped into the circuit's frame, simplified to 0.8 m
// and kept from 40 m² up, the REACH m nearest the road first, at most MAX per
// circuit. Its height is OSM's height, else building:levels × 3.2 m (+ roof
// levels), else a guess from its kind. Roofs, canopies and anything the road
// runs through or under (Monaco's tunnel under the Fairmont) are left out.
// Responses are cached in /tmp/osm.
//   node tools/import_buildings.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { overpass, area, inside, simplifyRing, frame } from './osm_frame.mjs';

const REACH = 500, MIN_AREA = 40, TOL = 0.8, MAX = 2500;
const SKIP = /^(roof|canopy|carport|construction|ruins|no|bridge|collapsed|proposed|demolished|tent|ses)$/;
const KIND_HEIGHT = { grandstand: 12, stadium: 20, house: 7, detached: 7, semidetached_house: 7, terrace: 8, residential: 9, bungalow: 4, apartments: 15, hotel: 18, office: 15, commercial: 10, retail: 7, industrial: 9, warehouse: 9, hangar: 10, garage: 3, garages: 3, shed: 3, hut: 3, cabin: 3, kiosk: 3, toilets: 3, service: 3, transformer_tower: 6, church: 14, farm_auxiliary: 6, barn: 7, greenhouse: 4 };
const metres = v => { const m = /^\s*([\d.]+)\s*(m|ft|')?\s*$/.exec(v ?? ''); return m ? +m[1] * (m[2] === 'ft' || m[2] === "'" ? 0.3048 : 1) : NaN; };
const heightOf = t => {
  const h = metres(t.height);
  if (h > 1.5 && h < 400) return h;
  const lv = parseFloat(t['building:levels']), rl = parseFloat(t['roof:levels']) || 0;
  if (lv > 0 && lv < 100) return (lv + rl * 0.6) * 3.2 + 1;
  return KIND_HEIGHT[t.building] ?? 8;
};

const out = {}, stands = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { X, Y, toLocal, bb: bbOf } = frame(c), half = createCircuitTrack({ ...c, pitLane: false }).roadWidth / 2;
  // Distance to the centreline through a 50 m grid of its samples.
  const G = 50, grid = new Map();
  for (let i = 0; i < X.length; i++) {
    const k = `${Math.floor(X[i] / G)},${Math.floor(Y[i] / G)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }
  const roadDist = (x, y, reach) => {
    let best = Infinity; const r = Math.ceil(reach / G), gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) for (const i of grid.get(`${gx + u},${gy + v}`) ?? []) best = Math.min(best, Math.hypot(X[i] - x, Y[i] - y));
    return best;
  };
  const q = `[out:json][timeout:180];(way["building"](${bbOf(REACH)});relation["building"]["type"="multipolygon"](${bbOf(REACH)}););out geom;`;
  const osm = await overpass(`buildings-${id}.json`, q);
  const list = []; let through = 0;
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    if (SKIP.test(t.building) || t.layer < 0 || t.location === 'underground') continue;
    let g = null;
    if (e.type === 'way' && e.geometry) g = e.geometry.map(p => [p.lon, p.lat]);
    else if (e.type === 'relation') g = e.members.find(m => m.type === 'way' && m.role === 'outer' && m.geometry)?.geometry.map(p => [p.lon, p.lat]);
    if (!g || g.length < 4 || g[0][0] !== g.at(-1)[0] || g[0][1] !== g.at(-1)[1]) continue;
    let ring = simplifyRing(g.slice(0, -1).map(toLocal), TOL);
    if (ring.length < 3 || Math.abs(area(ring)) < MIN_AREA) continue;
    if (area(ring) < 0) ring = ring.reverse();
    const cxy = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
    const d = roadDist(cxy[0], cxy[1], REACH + 60);
    if (d > REACH) continue;
    // Clear of the road: no vertex on it and no centreline sample inside.
    let hit = ring.some(([x, y]) => roadDist(x, y, 60) < half + 1.5);
    for (let i = 0; i < X.length && !hit; i++) hit = Math.abs(X[i] - cxy[0]) < 400 && Math.abs(Y[i] - cxy[1]) < 400 && inside([ring], X[i], Y[i]);
    if (hit) { through++; continue; }
    list.push({ d, h: Math.round(heightOf(t)), ring, kind: t.building });
  }
  list.sort((a, b) => a.d - b.d);
  const kept = list.slice(0, MAX);
  out[id] = kept.map(b => [b.h, ...b.ring.flatMap(([x, y]) => [Math.round(x * 2) / 2, Math.round(y * 2) / 2])]);
  stands[id] = kept.flatMap((b, i) => b.kind === 'grandstand' ? [i] : []);
  const tall = Math.max(0, ...kept.map(b => b.h));
  report.push(`${id}: ${kept.length} buildings (of ${list.length} within ${REACH} m; ${through} on or over the road left out), ${stands[id].length} grandstands, tallest ${tall} m, ${Math.round(kept.reduce((a, b) => a + Math.abs(area(b.ring)), 0) / 1e4)} ha`);
}

const head = `// Real buildings around each real circuit (circuits.mjs keys) from
// OpenStreetMap (© OpenStreetMap contributors, ODbL,
// openstreetmap.org/copyright), placed in each circuit's local east/north
// metres through its bacinger/f1-circuits trace: footprints within ${REACH} m of
// the road, simplified to ${TOL} m (tools/import_buildings.mjs). Each building is
// flat [height m, x, y, x, y, ...], its footprint anticlockwise; none is on or
// over the road. STANDS lists which of them are grandstands (building=grandstand),
// by index. Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, bs]) => `  '${id}': [${bs.map(b => `[${b.join(',')}]`).join(',\n    ')}],`).join('\n');
writeFileSync(new URL('../src/buildings.mjs', import.meta.url), `${head}export const BUILDINGS = Object.freeze({\n${body}\n});\nexport const STANDS = Object.freeze({\n${Object.entries(stands).map(([id, l]) => `  '${id}': [${l.join(',')}],`).join('\n')}\n});\n`);
console.log(report.join('\n'));
