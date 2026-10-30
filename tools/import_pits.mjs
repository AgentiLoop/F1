// Writes src/pits.mjs: where each real circuit's pit lane runs, from
// OpenStreetMap (Overpass API; © OpenStreetMap contributors, ODbL): the
// highway=raceway ways tagged raceway=pit_lane or named as a pit lane (Pit
// Lane, Boxenstraße, Voie des stands, Bokszutca…), mapped into the circuit's
// frame through its bacinger/f1-circuits trace (osm_frame.mjs) and sampled
// every 2 m. Points between 8 and 80 m off the centreline whose nearest part
// of the circuit runs within 30° of them are kept; the cluster of them
// (lap-distance gaps under 60 m bridged, also across the line) nearest the
// real timing line is the pit lane: its side of the circuit (side +1: left
// of the race direction, as circuit.mjs pit lanes) and the lap distances
// beside which it leaves and rejoins the circuit's side, from the real
// timing line (negative before it).
// Responses are cached in /tmp/osm.
//   node tools/import_pits.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { overpass, frame } from './osm_frame.mjs';

const NAME = /pit|box|stand|puits|ピット|维修/i, NEAR = 8, FAR = 80, ANGLE = 30, GAP = 60;
const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, bb } = frame(c), track = createCircuitTrack({ ...c, pitLane: false }), L = track.length;
  const r = await overpass(`pits-${id}.json`, `[out:json][timeout:180];(way["highway"="raceway"](${bb(100)});way["highway"="service"]["service"="pit_lane"](${bb(100)}););out tags geom;`);
  const pts = [];
  for (const e of r.elements) {
    const t = e.tags ?? {};
    if (!e.geometry || !(t.raceway === 'pit_lane' || t.service === 'pit_lane' || NAME.test(`${t.name ?? ''} ${t['name:en'] ?? ''}`))) continue;
    const p = e.geometry.map(q => toLocal([q.lon, q.lat]));
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1], [bx, by] = p[i], len = Math.hypot(bx - ax, by - ay), dir = Math.atan2(by - ay, bx - ax);
      for (let k = 0, m = Math.max(1, Math.ceil(len / 2)); k < m; k++) {
        const x = ax + (bx - ax) * k / m, y = ay + (by - ay) * k / m, o = track.offset(x, y);
        if (Math.abs(o) < NEAR || Math.abs(o) > FAR) continue;
        const s = track.progress(x, y), d = Math.abs(((dir - track.heading(s)) % Math.PI + 1.5 * Math.PI) % Math.PI - Math.PI / 2);
        if (d < ANGLE * Math.PI / 180) pts.push([(s + L / 2) % L - L / 2, o]);
      }
    }
  }
  pts.sort((a, b) => a[0] - b[0]);
  const groups = [];
  for (const q of pts) { const g = groups.at(-1); if (g && q[0] - g.at(-1)[0] < GAP) g.push(q); else groups.push([q]); }
  if (groups.length > 1 && groups[0][0][0] + L - groups.at(-1).at(-1)[0] < GAP) groups[0] = [...groups.pop().map(([s, o]) => [s - L, o]), ...groups[0]];
  const span = g => [g[0][0], g.at(-1)[0]], miss = g => { const [a, b] = span(g); return a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)); };
  const best = groups.filter(g => span(g)[1] - span(g)[0] >= 100).sort((a, b) => miss(a) - miss(b))[0];
  if (!best) { report.push(`${id}: none (${pts.length} points)`); continue; }
  const right = best.filter(([, o]) => o > 0).length, side = right > best.length / 2 ? -1 : 1, [entry, exit] = span(best).map(Math.round);
  const mean = best.reduce((a, [, o]) => a + Math.abs(o), 0) / best.length;
  out[id] = [side, entry, exit];
  report.push(`${id}: ${side > 0 ? 'left' : 'right'} ${entry}..${exit} m (${exit - entry} m, ${Math.round(100 * Math.max(right, best.length - right) / best.length)}% on that side, mean ${mean.toFixed(1)} m off, ${miss(best)} m from the line)`);
}

const head = `// Each real circuit's pit lane (circuits.mjs keys), from OpenStreetMap (©
// OpenStreetMap contributors, ODbL, openstreetmap.org/copyright): [side,
// entry, exit] — the side of the circuit it lies on (+1 left of the race
// direction, -1 right) and the lap distances (m from the real timing line,
// negative before it) beside which it leaves and rejoins the circuit
// (tools/import_pits.mjs). Generated; do not edit by hand.
`;
const body = Object.entries(out).map(([id, v]) => `  '${id}': [${v.join(', ')}],`).join('\n');
writeFileSync(new URL('../src/pits.mjs', import.meta.url), `${head}export const PITS = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
