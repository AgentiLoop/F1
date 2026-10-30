// Adds (or refreshes) `heights` on the real circuits in src/circuits.mjs from
// where the cars actually drove: the OpenF1 API (api.openf1.org) car
// positions also carry a height (z, 0.1 m units), the same race sessions as
// the layouts (2024; 2023 at Silverstone and Interlagos). Each clean lap of a
// few drivers (no pit in or out lap, within 107% of the driver's median) is
// placed on the stored trace by its fraction of the lap (distance travelled,
// from the real timing line, which lies timingLine m along the trace), and
// the pooled heights are Gaussian-smoothed (sigma 15 m) at every stored
// point. Heights are metres relative to the lap's mean height. Responses are
// cached in a directory (default /tmp/openf1-cache) so reruns are offline.
//   node tools/import_elevation.mjs [cacheDir]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { CIRCUITS } from '../src/circuits.mjs';

const SESSIONS = {
  'bahrain': 9472, 'shanghai': 9673, 'catalunya': 9539, 'monaco': 9523, 'montreal': 9531, 'red-bull-ring': 9550,
  'silverstone': 9126, 'hungaroring': 9566, 'spa': 9574, 'monza': 9590, 'cota': 9617, 'mexico': 9625,
  'interlagos': 9205, 'yas-marina': 9662, 'imola': 9515, 'zandvoort': 9582, 'jeddah': 9480, 'miami': 9507,
};
const DRIVERS = 4, SIGMA = 15;
const cache = process.argv[2] ?? '/tmp/openf1-cache';
mkdirSync(cache, { recursive: true });

async function get(path) {
  const file = `${cache}/${path.replace(/[^a-z0-9=._-]+/gi, '_')}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let attempt = 0; ; attempt++) {
    await new Promise(r => setTimeout(r, 600));
    const res = await fetch(`https://api.openf1.org/v1/${path}`);
    if (res.ok) { const text = await res.text(); writeFileSync(file, text); return JSON.parse(text); }
    if (attempt > 5) throw new Error(`${path}: HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
  }
}
const median = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };

const heightsOf = {};
for (const [key, session] of Object.entries(SESSIONS)) {
  const c = CIRCUITS[key], m = c.points.length / 2, cum = [0];
  for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; cum.push(cum[k] + Math.hypot(c.points[2 * k1] - c.points[2 * k], c.points[2 * k1 + 1] - c.points[2 * k + 1])); }
  const L = cum[m], laps = await get(`laps?session_key=${session}`);
  // The drivers with the most clean laps.
  const byDriver = new Map();
  for (const l of laps) if (l.lap_duration && l.date_start && !l.is_pit_out_lap && l.lap_number > 1) (byDriver.get(l.driver_number) ?? byDriver.set(l.driver_number, []).get(l.driver_number)).push(l);
  const pitIn = new Set(laps.filter(l => l.is_pit_out_lap).map(l => `${l.driver_number}:${l.lap_number - 1}`));
  const drivers = [...byDriver].map(([d, ls]) => { const med = median(ls.map(l => l.lap_duration)); return [d, ls.filter(l => l.lap_duration < med * 1.07 && !pitIn.has(`${d}:${l.lap_number}`))]; })
    .sort((a, b) => b[1].length - a[1].length).slice(0, DRIVERS);
  const samples = []; let lapCount = 0;
  for (const [driver, ls] of drivers) {
    const t0 = Math.min(...ls.map(l => Date.parse(l.date_start))) - 1000, t1 = Math.max(...ls.map(l => Date.parse(l.date_start) + l.lap_duration * 1000)) + 1000;
    const iso = t => new Date(t).toISOString().replace('Z', '');
    const loc = (await get(`location?session_key=${session}&driver_number=${driver}&date>=${iso(t0)}&date<=${iso(t1)}`)).map(p => ({ t: Date.parse(p.date), x: p.x / 10, y: p.y / 10, z: p.z / 10 }));
    for (const l of ls) {
      const a = Date.parse(l.date_start), b = a + l.lap_duration * 1000, lap = loc.filter(p => p.t >= a && p.t < b);
      if (lap.length < 20 || lap.some(p => p.x === 0 && p.y === 0 && p.z === 0)) continue;
      const d = [0];
      for (let i = 1; i < lap.length; i++) d.push(d[i - 1] + Math.hypot(lap[i].x - lap[i - 1].x, lap[i].y - lap[i - 1].y));
      // Distance from the line to the first sample and from the last one back
      // to it, at the lap's average speed.
      const v = d.at(-1) / ((lap.at(-1).t - lap[0].t) / 1000), lead = v * (lap[0].t - a) / 1000, total = lead + d.at(-1) + v * (b - lap.at(-1).t) / 1000;
      lap.forEach((p, i) => samples.push([((c.timingLine + (lead + d[i]) / total * L) % L + L) % L, p.z]));
      lapCount++;
    }
  }
  const mean = samples.reduce((s, p) => s + p[1], 0) / samples.length, raw = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    let w = 0, sum = 0;
    for (const [s, z] of samples) {
      let ds = Math.abs(s - cum[k]); ds = Math.min(ds, L - ds);
      if (ds > 3 * SIGMA) continue;
      const g = Math.exp(-0.5 * (ds / SIGMA) ** 2); w += g; sum += g * (z - mean);
    }
    raw[k] = sum / w;
  }
  heightsOf[key] = Array.from(raw, h => Math.round(h * 10) / 10);
  const h = heightsOf[key];
  console.log(`${key}: ${lapCount} laps of ${drivers.length} drivers, ${samples.length} samples, height range ${(Math.max(...h) - Math.min(...h)).toFixed(1)} m`);
}

const file = new URL('../src/circuits.mjs', import.meta.url);
let text = readFileSync(file, 'utf8');
for (const [key, h] of Object.entries(heightsOf)) {
  const re = new RegExp(`(  '${key}': \\{[^\\n]*\\n)(?:    heights: [^\\n]*\\n)?(    points: )`);
  if (!re.test(text)) throw new Error(`${key}: entry not found`);
  text = text.replace(re, `$1    heights: [${h.join(',')}],\n$2`);
}
writeFileSync(file, text);
