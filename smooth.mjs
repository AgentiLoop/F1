// Smooth surfaces for low-poly meshes seen close up: Loop subdivision that keeps the
// author's hard edges. Vertices are welded by position for the surface; an edge whose
// two faces use different vertices (split normals: a hard edge), a boundary or a
// non-manifold edge stays a crease. Normals are recomputed per smoothing group, so
// curved panels shade smooth and hard edges stay hard.
import * as THREE from './vendor/three.module.js';

// One Loop step. pos: Float64Array of welded positions; tris: welded triangles;
// corners: the original vertex at each triangle corner (same length as tris).
function loop(pos, tris, corners) {
  const nv = pos.length / 3, edges = new Map();
  const key = (a, b) => a < b ? a * nv + b : b * nv + a;
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    const i = t + k, j = t + (k + 1) % 3, a = tris[i], b = tris[j], id = key(a, b);
    const corner = corners[i] < corners[j] ? `${corners[i]},${corners[j]}` : `${corners[j]},${corners[i]}`;
    const e = edges.get(id);
    if (e) { e.opp.push(tris[t + (k + 2) % 3]); e.corner.push(corner); }
    else edges.set(id, { a, b, opp: [tris[t + (k + 2) % 3]], corner: [corner], mid: 0 });
  }
  const ring = Array.from({ length: nv }, () => []), crease = Array.from({ length: nv }, () => []);
  const out = new Float64Array((nv + edges.size) * 3);
  let next = nv;
  for (const e of edges.values()) {
    e.sharp = e.opp.length !== 2 || e.corner[0] !== e.corner[1]; e.mid = next++;
    ring[e.a].push(e.b); ring[e.b].push(e.a);
    if (e.sharp) { crease[e.a].push(e.b); crease[e.b].push(e.a); }
    const o = e.mid * 3, A = e.a * 3, B = e.b * 3;
    for (let k = 0; k < 3; k++) out[o + k] = e.sharp ? (pos[A + k] + pos[B + k]) / 2
      : 0.375 * (pos[A + k] + pos[B + k]) + 0.125 * (pos[e.opp[0] * 3 + k] + pos[e.opp[1] * 3 + k]);
  }
  for (let v = 0; v < nv; v++) {
    const r = ring[v], c = crease[v], o = v * 3;
    for (let k = 0; k < 3; k++) out[o + k] = pos[o + k]; // corners (1 or 3+ creases) stay put
    if (c.length === 2) {
      for (let k = 0; k < 3; k++) out[o + k] = 0.75 * pos[o + k] + 0.125 * (pos[c[0] * 3 + k] + pos[c[1] * 3 + k]);
    } else if (c.length === 0 && r.length >= 3) {
      const n = r.length, beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      for (let k = 0; k < 3; k++) {
        let s = 0; for (const u of r) s += pos[u * 3 + k];
        out[o + k] = (1 - n * beta) * pos[o + k] + beta * s;
      }
    }
  }
  // Four triangles per triangle. A new edge vertex gets one corner id per side of a
  // hard edge (keyed by the original corner pair), so the split carries on.
  const nt = new Uint32Array(tris.length * 4), nc = new Array(tris.length * 4), ids = new Map();
  const cornerId = (ci, cj) => { const k = ci < cj ? `${ci},${cj}` : `${cj},${ci}`; let id = ids.get(k); if (id === undefined) ids.set(k, id = `${nv}:${ids.size}`); return id; };
  for (let t = 0, j = 0; t < tris.length; t += 3, j += 12) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]], [ca, cb, cc] = [corners[t], corners[t + 1], corners[t + 2]];
    const ab = edges.get(key(a, b)).mid, bc = edges.get(key(b, c)).mid, cA = edges.get(key(c, a)).mid;
    const iab = cornerId(ca, cb), ibc = cornerId(cb, cc), ica = cornerId(cc, ca);
    nt.set([a, ab, cA, ab, b, bc, cA, bc, c, ab, bc, cA], j);
    [ca, iab, ica, iab, cb, ibc, ica, ibc, cc, iab, ibc, ica].forEach((v, k) => { nc[j + k] = v; });
  }
  return { pos: out, tris: nt, corners: nc };
}

// A smooth indexed copy of geometry (position + normal only), levels Loop steps.
export function smoothGeometry(geometry, { levels = 1, tolerance = 1e-5 } = {}) {
  const p = geometry.getAttribute('position'), index = geometry.index;
  const map = new Map(), weld = new Uint32Array(p.count), welded = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
    let w = map.get(k);
    if (w === undefined) { w = welded.length / 3; map.set(k, w); welded.push(x, y, z); }
    weld[i] = w;
  }
  // A triangle whose authored normals face against its winding (mirrored parts) is
  // flipped: its recomputed normals point the authored way, as the author shaded it.
  const n = index ? index.count : p.count, tris = [], corners = [], flip = [], N = geometry.getAttribute('normal');
  const e0 = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    const c = [0, 1, 2].map(k => index ? index.getX(t + k) : t + k), w = c.map(i => weld[i]);
    if (w[0] !== w[1] && w[1] !== w[2] && w[2] !== w[0]) {
      tris.push(...w); corners.push(...c.map(String));
      let f = false;
      if (N) {
        e0.fromBufferAttribute(p, c[0]);
        e1.fromBufferAttribute(p, c[1]).sub(e0); e2.fromBufferAttribute(p, c[2]).sub(e0);
        e1.cross(e2);
        let d = 0; for (const i of c) d += e1.x * N.getX(i) + e1.y * N.getY(i) + e1.z * N.getZ(i);
        f = d < 0;
      }
      flip.push(f);
    }
  }
  let mesh = { pos: Float64Array.from(welded), tris: Uint32Array.from(tris), corners };
  for (let i = 0; i < levels; i++) mesh = loop(mesh.pos, mesh.tris, mesh.corners);
  const sub = 4 ** levels; // loop splits triangle t into triangles t*4 .. t*4+3
  // One output vertex per (surface vertex, smoothing group, facing).
  const out = new Map(), positions = [], indices = new Uint32Array(mesh.tris.length);
  mesh.tris.forEach((w, i) => {
    const f = flip[Math.floor(i / 3 / sub)];
    const k = `${w}|${mesh.corners[i]}|${f ? 1 : 0}`; let v = out.get(k);
    if (v === undefined) { v = positions.length / 3; out.set(k, v); positions.push(mesh.pos[w * 3], mesh.pos[w * 3 + 1], mesh.pos[w * 3 + 2]); }
    indices[i] = v;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  if (flip.includes(true)) {
    const nrm = g.getAttribute('normal'), done = new Set();
    indices.forEach((v, i) => {
      if (!flip[Math.floor(i / 3 / sub)] || done.has(v)) return;
      done.add(v); nrm.setXYZ(v, -nrm.getX(v), -nrm.getY(v), -nrm.getZ(v));
    });
  }
  return g;
}

