// Writes src/terrain.mjs: the real ground around each real circuit, from the
// Mapzen/AWS Terrain Tiles (terrarium PNGs, zoom 13, about 19 m per pixel at
// the equator; s3.amazonaws.com/elevation-tiles-prod, open data built from
// SRTM, NED, EU-DEM, ETOPO1 and others — see
// github.com/tilezen/joerd/blob/master/docs/attribution.md). Each circuit is
// tied to the globe through its bacinger/f1-circuits trace (osm_frame.mjs);
// the ground is sampled every STEP m over the square the 3D terrain covers
// (the circuit's half-diagonal + 1400 m from its centre, one step more each
// side) and shifted onto our road heights (circuits.mjs heights, m from the
// lap's mean): by the median of road − ground along the centreline. Tiles are
// cached in /tmp/terrarium.
//   node tools/import_terrain.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { frame } from './osm_frame.mjs';

const Z = 13, STEP = 60, CACHE = '/tmp/terrarium';
mkdirSync(CACHE, { recursive: true });

// 8-bit RGB / RGBA PNG → { w, h, ch, px } (unfiltered bytes).
const decodePNG = buf => {
  let p = 8, w = 0, h = 0, ch = 3; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6)) throw new Error('PNG format'); ch = data[9] === 6 ? 4 : 3; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[o + x - ch] : 0, b = y ? px[o - stride + x] : 0, c = x >= ch && y ? px[o - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  return { w, h, ch, px };
};
const tiles = new Map();
const tile = async (tx, ty) => {
  const k = `${tx}_${ty}`;
  if (tiles.has(k)) return tiles.get(k);
  const f = `${CACHE}/${Z}_${k}.png`;
  if (!existsSync(f)) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
      if (res.ok) { writeFileSync(f, Buffer.from(await res.arrayBuffer())); break; }
      if (attempt > 4) throw new Error(`tile ${k}: HTTP ${res.status}`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  const t = decodePNG(readFileSync(f)); tiles.set(k, t); return t;
};
// Ground height (m above sea level) at [lon, lat], bilinear between pixels.
const N = 256 * 2 ** Z;
const elevation = async (lon, lat) => {
  const fx = (lon + 180) / 360 * N - 0.5, s = Math.sin(lat * Math.PI / 180);
  const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N - 0.5, ix = Math.floor(fx), iy = Math.floor(fy);
  const at = async (x, y) => { const t = await tile(Math.floor(x / 256), Math.floor(y / 256)), o = ((y & 255) * t.w + (x & 255)) * t.ch; return t.px[o] * 256 + t.px[o + 1] + t.px[o + 2] / 256 - 32768; };
  const a = fx - ix, b = fy - iy;
  return (await at(ix, iy) * (1 - a) + await at(ix + 1, iy) * a) * (1 - b) + (await at(ix, iy + 1) * (1 - a) + await at(ix + 1, iy + 1) * a) * b;
};

const out = {}, report = [];
for (const [key, c] of Object.entries(CIRCUITS)) {
  if (key === 'rwanda' || !c.heights) continue;
  const fr = frame(c), track = createCircuitTrack({ ...c, pitLane: false }), { x: X, y: Y, s: S } = track.samples, n = X.length;
  // toLocal is affine in (lon, lat): invert it about the trace's box centre.
  const [la0, lo0, la1, lo1] = fr.bb(0).split(',').map(Number), lonC = (lo0 + lo1) / 2, latC = (la0 + la1) / 2, d = 0.01;
  const p0 = fr.toLocal([lonC, latC]), pe = fr.toLocal([lonC + d, latC]), pn = fr.toLocal([lonC, latC + d]);
  const a = (pe[0] - p0[0]) / d, b = (pn[0] - p0[0]) / d, cc = (pe[1] - p0[1]) / d, dd = (pn[1] - p0[1]) / d, det = a * dd - b * cc;
  const toGlobe = (x, y) => { const u = x - p0[0], v = y - p0[1]; return [lonC + (dd * u - b * v) / det, latC + (-cc * u + a * v) / det]; };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 1400 + STEP;
  const gx = Math.floor((cx - R) / STEP) * STEP, gy = Math.floor((cy - R) / STEP) * STEP, NX = Math.ceil((cx + R - gx) / STEP) + 1, NY = Math.ceil((cy + R - gy) / STEP) + 1;
  // The shift onto our road heights.
  const diff = [];
  for (let k = 0; k < n; k += 3) diff.push(track.elevation(S[k]) - await elevation(...toGlobe(X[k], Y[k])));
  diff.sort((p, q) => p - q);
  const shift = diff[diff.length >> 1], spread = Math.sqrt(diff.reduce((acc, v) => acc + (v - shift) ** 2, 0) / diff.length);
  const h = new Int16Array(NX * NY);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const v = await elevation(...toGlobe(gx + i * STEP, gy + j * STEP)) + shift;
    h[j * NX + i] = Math.round(Math.max(-3200, Math.min(3200, v)) * 10); lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  out[key] = { x0: gx, y0: gy, step: STEP, nx: NX, ny: NY, h: Buffer.from(h.buffer).toString('base64') };
  report.push(`${key.padEnd(14)} ${NX}x${NY}  sea level ${shift.toFixed(1).padStart(7)} m  ground ${lo.toFixed(0)}..${hi.toFixed(0)} m  road vs ground ±${spread.toFixed(1)} m`);
  console.log(report.at(-1));
}

writeFileSync(new URL('../src/terrain.mjs', import.meta.url), `// The real ground around each real circuit (circuits.mjs keys), from the
// Mapzen/AWS Terrain Tiles (open data from SRTM, NED, EU-DEM, ETOPO1 and
// others: github.com/tilezen/joerd/blob/master/docs/attribution.md), zoom 13,
// placed in each circuit's local east/north metres through its
// bacinger/f1-circuits trace and shifted onto the road's heights
// (circuits.mjs heights) by the median gap along the centreline
// (tools/import_terrain.mjs). Each: a grid of nx × ny heights every step m
// from (x0, y0), row by row (x east first), as little-endian Int16
// decimetres in base64 (decoded by scenery.mjs terrainField). Generated; do
// not edit by hand.
export const TERRAIN = Object.freeze({
${Object.entries(out).map(([k, t]) => `  '${k}': { x0: ${t.x0}, y0: ${t.y0}, step: ${t.step}, nx: ${t.nx}, ny: ${t.ny}, h: '${t.h}' },`).join('\n')}
});
`);
console.log('wrote src/terrain.mjs');
