// Writes src/tunnels.mjs: the stretches of each real circuit that run
// through a tunnel or under cover (Monaco's tunnel under the Fairmont), from
// OpenStreetMap (Overpass API; © OpenStreetMap contributors, ODbL): the
// highway=* ways tagged tunnel=* (other than no) or covered=* (other than
// no) that run along the circuit — points within 4 m of the road's edge,
// heading within 25° of the circuit's — mapped into the circuit's frame
// through its bacinger/f1-circuits trace (osm_frame.mjs) and turned into
// lap-distance ranges (gaps under 40 m bridged, ranges under 20 m dropped,
// and only those where the circuit's own raceway way is tagged tunnel or
// covered, so public roads tunnelling under it are left out, as are ways
// crossing under or over it).
// Responses are cached in /tmp/osm.
//   node tools/import_tunnels.mjs
import { writeFileSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { overpass, frame } from './osm_frame.mjs';

const EDGE = 4, ANGLE = 25, GAP = 40, MIN = 20;
const out = {}, report = [];
for (const [id, c] of Object.entries(CIRCUITS)) {
  if (id === 'rwanda') continue;
  const { toLocal, bb } = frame(c), track = createCircuitTrack({ ...c, pitLane: false }), L = track.length;
  const r = await overpass(`covered-${id}.json`, `[out:json][timeout:180];(way["tunnel"]["tunnel"!="no"]["highway"](${bb(20)});way["covered"]["covered"!="no"]["highway"](${bb(20)});way["building"="bridge"](${bb(20)});way["man_made"="bridge"](${bb(20)});way["building"]["layer"](${bb(20)});way["building:part"]["min_height"](${bb(20)}););out tags geom;`);
  const along = [];
  for (const e of r.elements) {
    const t = e.tags ?? {};
    if (!e.geometry || !t.highway || !((t.tunnel && t.tunnel !== 'no') || (t.covered && t.covered !== 'no'))) continue;
    const p = e.geometry.map(q => toLocal([q.lon, q.lat]));
    for (let i = 1; i < p.length; i++) {
      const [ax, ay] = p[i - 1], [bx, by] = p[i], len = Math.hypot(bx - ax, by - ay), dir = Math.atan2(by - ay, bx - ax);
      for (let k = 0, m = Math.max(1, Math.ceil(len / 2)); k <= m; k++) {
        const x = ax + (bx - ax) * k / m, y = ay + (by - ay) * k / m;
        if (Math.abs(track.offset(x, y)) > track.roadWidth / 2 + EDGE) continue;
        const s = track.progress(x, y), d = Math.abs(((dir - track.heading(s)) % Math.PI + 1.5 * Math.PI) % Math.PI - Math.PI / 2);
        if (d < ANGLE * Math.PI / 180) along.push([s, t.highway === 'raceway']);
      }
    }
  }
  // Lap-distance ranges: sorted, gaps under GAP bridged (also across s = 0),
  // kept where the circuit's own way (highway=raceway) is tagged in them.
  along.sort((a, b) => a[0] - b[0]);
  const ranges = [];
  for (const [s, race] of along) { const last = ranges.at(-1); if (last && s - last[1] < GAP) { last[1] = s; last[2] ||= race; } else ranges.push([s, s, race]); }
  if (ranges.length > 1 && ranges[0][0] + L - ranges.at(-1)[1] < GAP) { ranges[0][0] = ranges.at(-1)[0] - L; ranges[0][2] ||= ranges.at(-1)[2]; ranges.pop(); }
  out[id] = ranges.filter(([a, b, race]) => race && b - a >= MIN).map(([a, b]) => [Math.round(a), Math.round(b)]);
  report.push(`${id}: ${out[id].map(([a, b]) => `${a}-${b} m (${b - a} m)`).join(', ') || 'none'}`);
}

const head = `// The stretches of each real circuit (circuits.mjs keys) that run through a
// tunnel or under cover, from OpenStreetMap (© OpenStreetMap contributors,
// ODbL, openstreetmap.org/copyright): roads tagged tunnel or covered that run
// along the circuit, as [from, to] lap distances in metres (from may be
// negative where a range spans the line) (tools/import_tunnels.mjs).
// Generated; do not edit by hand.
`;
const body = Object.entries(out).filter(([, l]) => l.length).map(([id, l]) => `  '${id}': [${l.map(r => `[${r.join(', ')}]`).join(', ')}],`).join('\n');
writeFileSync(new URL('../src/tunnels.mjs', import.meta.url), `${head}export const TUNNELS = Object.freeze({\n${body}\n});\n`);
console.log(report.join('\n'));
