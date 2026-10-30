// East African vegetation for a circuit with terrain (the RISE Motordrome):
// flat-topped acacias, broadleaf trees, tall eucalyptus, shrubs and papyrus
// along the lake shore, after the species and placement of the RISE sim's
// js/trees.js (forest patches, gallery forest on the shore, open savanna far
// from the road). Our own WebGL code: leaf cards cut out of one canvas atlas,
// one instanced mesh per species. Physics (x, y) maps to world (x, h, -y).
import * as THREE from '../vendor/three.module.js';

const hash2 = (x, y, seed) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };
// Smooth value noise in -1..1, summed over octaves.
function fbm(x, y, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    const n = (hash2(i, j, seed) * (1 - a) + hash2(i + 1, j, seed) * a) * (1 - b) + (hash2(i, j + 1, seed) * (1 - a) + hash2(i + 1, j + 1, seed) * a) * b;
    sum += (n * 2 - 1) * amp; norm += amp; amp *= 0.5; x *= 2.03; y *= 2.03; seed += 17;
  }
  return sum / norm;
}
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

export const SPECIES = ['acacia', 'broadleaf', 'eucalyptus', 'shrub', 'papyrus'];

// Where each tree goes: { species: [[x, y, scale, rotation], ...] } in physics
// metres. terrain = { height(x, y), dist(x, y) coarse distance to the
// centreline, lake(x, y) signed distance from the shore (negative on water) or
// null }. Trees stay wallOffset + 10 m clear of the road, off the start
// straight's stands and garages, and out of the water (papyrus excepted).
export function savannaPlan(track, terrain, { minX, maxX, minY, maxY }, { cell = 13, margin = 650 } = {}) {
  const rnd = mulberry(2026), out = Object.fromEntries(SPECIES.map(k => [k, []])), wallAt = track.wallOffset;
  const straight = s => { s = ((s % track.length) + track.length) % track.length; return s > track.length - 260 || s < 380; };
  for (let gy = minY - margin; gy < maxY + margin; gy += cell) for (let gx = minX - margin; gx < maxX + margin; gx += cell) {
    const x = gx + rnd() * cell, y = gy + rnd() * cell, r = rnd(), pick = rnd();
    const coarse = terrain.dist(x, y);
    if (coarse < wallAt - 15) continue;
    let d = coarse;
    if (coarse < wallAt + 100) {
      d = Math.abs(track.offset(x, y));
      if (d < wallAt + 10 || (d < wallAt + 90 && straight(track.progress(x, y)))) continue;
    }
    const sdf = terrain.lake ? terrain.lake(x, y) : 1e9;
    const tree = () => [x, y, 0.7 + rnd() * 0.6, rnd() * Math.PI * 2];
    if (sdf < 6) { if (sdf > -14 && r < 0.6) out.papyrus.push(tree()); continue; }
    const forest = Math.max(0, fbm(x / 380, y / 380, 4, 77)), clump = Math.max(0, fbm(x / 85, y / 85, 3, 78));
    const savanna = smooth(320, 800, d);
    let density = (0.06 + forest * 0.75 + clump * 0.35 + smooth(90, 10, sdf) * 0.6) * (1 - savanna * 0.6) * smooth(wallAt + 10, wallAt + 40, d);
    if (r > density) continue;
    const kind = sdf < 90 && pick < 0.7 ? 'broadleaf'
      : savanna > 0.5 ? (pick < 0.62 ? 'acacia' : pick < 0.82 ? 'shrub' : 'broadleaf')
      : fbm(x / 150, y / 150, 2, 91) > 0.3 ? 'eucalyptus'
      : pick < 0.35 ? 'acacia' : pick < 0.75 ? 'broadleaf' : 'shrub';
    out[kind].push(tree());
  }
  return out;
}

// Leaf atlas, three cells across: broad leaves, fine acacia foliage, bark.
// Each leaf cell is a dense clump: a shaded core disc (opaque, sampled by the
// crown's inner shell) under several layers of leaves, ragged toward the rim.
const CORE_R = 64; // px radius of the opaque core disc in a 256 px cell
function atlas() {
  const W = 768, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), rnd = mulberry(99);
  const spray = (ox, fine) => {
    const cx = ox + 128, cy = 128;
    g.save(); g.beginPath(); g.rect(ox + 2, 2, 252, 252); g.clip();
    const disc = g.createRadialGradient(cx, cy - 20, 8, cx, cy, CORE_R + 6);
    disc.addColorStop(0, fine ? 'hsl(88,38%,30%)' : 'hsl(98,36%,27%)'); disc.addColorStop(1, fine ? 'hsl(92,40%,19%)' : 'hsl(104,38%,16%)');
    g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, CORE_R + 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(78,58,38,0.95)';
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, rr = 70 + rnd() * 48; g.lineWidth = fine ? 1.2 : 2;
      g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a + 0.5) * rr * 0.5, cy + Math.sin(a + 0.5) * rr * 0.5, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.stroke();
    }
    // Inner leaves first (darker, in shade), outer and upper ones brighter on top.
    for (let i = 0, n = fine ? 2600 : 900; i < n; i++) {
      const t = i / n, a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.5 + t * 0.3) * 118, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const light = 0.3 + t * 0.45 + rnd() * 0.3 - rr / 118 * 0.1 + (cy - y) / 420;
      g.fillStyle = `hsl(${85 + rnd() * 28}, ${35 + rnd() * 25}%, ${Math.round(14 + light * 28)}%)`;
      g.save(); g.translate(x, y); g.rotate(a + (rnd() - 0.5) * 1.6);
      g.beginPath(); g.ellipse(0, 0, fine ? 3.5 + rnd() * 3.5 : 9 + rnd() * 9, fine ? 1.5 + rnd() : 4 + rnd() * 3.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.restore();
  };
  spray(0, false); spray(256, true);
  g.fillStyle = '#8a8178'; g.fillRect(512, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,30,22' : '210,200,185'},${0.15 + rnd() * 0.3})`; g.fillRect(512 + rnd() * 256, rnd() * 256, 1 + rnd() * 3, 4 + rnd() * 14); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Geometry pieces. Every piece is non-indexed with position, normal, uv
// (into the atlas) and color (the species' bark or leaf tint).
const BARK_U = [0.7, 0.97];
function piece(geo, color, uvMap) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, col = new Float32Array(n * 3), uv = g.attributes.uv;
  for (let i = 0; i < n; i++) { col.set(color, i * 3); if (uvMap) uv.setXY(i, ...uvMap(uv.getX(i), uv.getY(i))); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function trunk(h, r0, r1, lean, bark) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 3, true).translate(0, h / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + lean * y * y); }
  g.computeVertexNormals();
  return piece(g, bark, (u, v) => [BARK_U[0] + u * (BARK_U[1] - BARK_U[0]), v]);
}
function limb(from, to, r, bark) {
  const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to), g = new THREE.CylinderGeometry(r * 0.6, r, A.distanceTo(B), 5, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  const m = A.add(B).multiplyScalar(0.5); g.translate(m.x, m.y, m.z);
  return piece(g, bark, (u, v) => [BARK_U[0] + u * (BARK_U[1] - BARK_U[0]), v]);
}
// Leaf cards scattered through an ellipsoid, normals pointing out of it so
// the crown shades as one soft volume. cell 0 = broad leaves, 1 = fine.
// core > 0 also fills the crown with a lumpy closed shell at that fraction of
// the radii, textured from the atlas's opaque core disc, so the canopy reads
// as a solid mass of foliage instead of a see-through cloud of cards. Leaves
// darken toward the inside and underside of the crown (self-shadowing).
function crown([cx, cy, cz], [rx, ry, rz], cards, size, cell, leaf, seed, core = 0) {
  const rnd = mulberry(seed), pos = [], nor = [], uvs = [], col = [], c = new THREE.Vector3(cx, cy, cz), up = new THREE.Vector3(0, 1, 0);
  const u0 = cell / 3 + 0.004, u1 = (cell + 1) / 3 - 0.004, corners = [[-1, -1, u0, 0], [1, -1, u1, 0], [1, 1, u1, 1], [-1, 1, u0, 1]];
  const shade = (q, k) => { const h = (q.y - cy) / ry, out = Math.min(1, Math.hypot((q.x - cx) / rx, h, (q.z - cz) / rz)); return k * (0.6 + 0.25 * out + 0.2 * Math.max(-1, Math.min(1, h))); };
  for (let i = 0; i < cards; i++) {
    const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), f = 0.6 + 0.45 * Math.sqrt(rnd());
    const p = new THREE.Vector3(cx + dir.x * rx * f, cy + dir.y * ry * f, cz + dir.z * rz * f);
    const n = dir.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.9)).normalize();
    const t1 = up.clone().cross(n); if (t1.lengthSq() < 0.01) t1.set(1, 0, 0); t1.normalize();
    const t2 = n.clone().cross(t1), rot = rnd() * Math.PI, a = t1.multiplyScalar(Math.cos(rot)).addScaledVector(t2, Math.sin(rot)), b = n.clone().cross(a).normalize();
    const s = size * (0.75 + rnd() * 0.5);
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [cu, cv, tu, tv] = corners[k], q = p.clone().addScaledVector(a, cu * s).addScaledVector(b, cv * s);
      const sn = q.clone().sub(c).normalize().lerp(up, 0.25).normalize(), v = shade(p, 1);
      pos.push(q.x, q.y, q.z); nor.push(sn.x, sn.y, sn.z); uvs.push(tu, tv); col.push(leaf[0] * v, leaf[1] * v, leaf[2] * v);
    }
  }
  if (core > 0) {
    const shell = new THREE.IcosahedronGeometry(1, 1), sp = shell.attributes.position, d = new THREE.Vector3();
    const uc = (cell + 0.5) / 3, du = CORE_R * 0.6 / 768, dv = CORE_R * 0.6 / 256, lump = seed * 13.1;
    for (let i = 0; i < sp.count; i++) {
      d.set(sp.getX(i), sp.getY(i), sp.getZ(i));
      const k = core * (0.88 + 0.24 * hash2(d.x * 3.1 + d.z * 1.7, d.y * 2.9 + d.z, lump));
      const q = new THREE.Vector3(cx + d.x * rx * k, cy + d.y * ry * k, cz + d.z * rz * k), sn = d.clone().lerp(up, 0.25).normalize(), v = shade(q, 0.8);
      pos.push(q.x, q.y, q.z); nor.push(sn.x, sn.y, sn.z);
      uvs.push(uc + (d.x * 0.7 + d.z * 0.7) * du, 0.5 + d.y * dv); col.push(leaf[0] * v, leaf[1] * v, leaf[2] * v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function merge(parts) {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0), geo = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const arr = new Float32Array(total * size); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  // Wind sway weight, after the RISE sim's trees.js: grows with the square of
  // height, foliage (atlas left of the bark) three times the wood, plus 0.3
  // for the foliage, so a trunk's foot stays put.
  const pos = geo.attributes.position, uv = geo.attributes.uv, sway = new Float32Array(total);
  let h = 0; for (let i = 0; i < total; i++) h = Math.max(h, pos.getY(i));
  for (let i = 0; i < total; i++) { const leaf = uv.getX(i) < BARK_U[0] ? 1 : 0, y = Math.max(0, pos.getY(i)) / h; sway[i] = y * y * (0.7 * leaf + 0.3) + 0.3 * leaf; }
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  return geo;
}

// Every tree bends with the wind (uWind 1 = the RISE sim's default breeze):
// a slow lean of up to 0.2 m by 0.14 m at the top, phase from the tree's
// position, and leaves flutter on top. Shadows keep the still shape.
const swayUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
function addSway(mat) {
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, swayUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway; uniform float uTime, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = 0.0;
        #ifdef USE_INSTANCING
          phase = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.283;
        #endif
        float w = uTime * 1.1 + phase, leaf = step(0.3, aSway); // wood stays below 0.3
        float flutter = sin(uTime * 7.0 + position.x * 3.0 + phase) * 0.03 * leaf;
        transformed += vec3(sin(w) * 0.2 + flutter, 0.0, cos(w * 0.8) * 0.14) * aSway * uWind;`);
  };
  mat.customProgramCacheKey = () => 'savanna-sway';
  return mat;
}

function speciesGeometry(kind) {
  const bark = [0.42, 0.36, 0.3];
  switch (kind) {
    case 'acacia': { // flat umbrella crown on a leaning, forked trunk
      const leaf = [0.95, 0.98, 0.78];
      return merge([trunk(4.4, 0.28, 0.14, 0.45, bark),
        limb([0.4, 4.0, 0], [2.4, 5.5, 1.1], 0.11, bark), limb([0.4, 4.0, 0], [-1.9, 5.4, -1.3], 0.11, bark), limb([0.4, 4.2, 0], [1.2, 5.7, -2.1], 0.09, bark), limb([0.4, 4.1, 0], [-0.8, 5.6, 2.2], 0.09, bark),
        crown([0.5, 5.9, 0], [4.6, 0.85, 4.2], 46, 1.6, 1, leaf, 1, 0.7), crown([-2.0, 5.5, 1.2], [2.7, 0.65, 2.5], 20, 1.3, 1, leaf, 2, 0.7), crown([2.5, 5.4, -1.4], [2.7, 0.6, 2.7], 20, 1.3, 1, leaf, 3, 0.7),
        crown([-0.6, 6.25, -1.6], [2.4, 0.5, 2.2], 14, 1.2, 1, leaf, 12, 0.65)]);
    }
    case 'broadleaf': { // rounded crown of several lobes
      const leaf = [0.66, 0.8, 0.58];
      return merge([trunk(4.2, 0.4, 0.22, 0.2, bark), limb([0, 3.6, 0], [1.7, 5.4, 0.9], 0.15, bark), limb([0, 3.6, 0], [-1.6, 5.5, -0.9], 0.15, bark), limb([0, 3.8, 0], [0.4, 5.6, -1.8], 0.13, bark),
        crown([0, 6.6, 0], [3.5, 2.9, 3.5], 54, 1.6, 0, leaf, 4, 0.72), crown([1.8, 5.4, 1.0], [2.5, 2.2, 2.5], 26, 1.4, 0, leaf, 5, 0.7),
        crown([-1.7, 5.6, -1.0], [2.4, 2.1, 2.4], 26, 1.4, 0, leaf, 6, 0.7), crown([0.2, 8.5, -0.3], [2.0, 1.7, 2.0], 18, 1.3, 0, leaf, 7, 0.7),
        crown([0.5, 5.7, -2.0], [2.1, 1.9, 2.0], 18, 1.3, 0, leaf, 13, 0.7), crown([-0.9, 7.7, 1.5], [1.9, 1.6, 1.9], 14, 1.2, 0, leaf, 14, 0.7)]);
    }
    case 'eucalyptus': { // tall pale trunk with a narrow crown
      const leaf = [0.72, 0.8, 0.66];
      return merge([trunk(15, 0.34, 0.12, 0.4, [0.62, 0.6, 0.55]), limb([0.15, 10.5, 0], [-0.6, 12.2, 0.5], 0.1, [0.62, 0.6, 0.55]),
        crown([0.3, 16.5, 0], [2.3, 4.8, 2.3], 40, 1.4, 1, leaf, 8, 0.68), crown([-0.6, 11.8, 0.5], [1.6, 2.8, 1.6], 18, 1.2, 1, leaf, 9, 0.65),
        crown([0.9, 14.0, -0.6], [1.5, 2.4, 1.5], 14, 1.2, 1, leaf, 15, 0.65)]);
    }
    case 'shrub': {
      const leaf = [0.62, 0.72, 0.5];
      return merge([crown([0, 1.0, 0], [1.8, 1.05, 1.8], 22, 1.0, 0, leaf, 10, 0.75), crown([1.0, 0.8, 0.5], [1.15, 0.75, 1.15], 11, 0.85, 0, leaf, 11, 0.72),
        crown([-0.9, 0.75, -0.6], [1.1, 0.7, 1.1], 10, 0.8, 0, leaf, 16, 0.72)]);
    }
    default: { // papyrus: a clump of thin stems, each topped by a tuft
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, r = 0.4 + (i % 3) * 0.3, h = 2.6 + (i % 4) * 0.5;
        parts.push(piece(new THREE.CylinderGeometry(0.025, 0.04, h, 3, 1, true).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r), [0.45, 0.6, 0.3], (u, v) => [0.1, 0.5]));
        parts.push(crown([Math.cos(a) * r, h + 0.1, Math.sin(a) * r], [0.5, 0.15, 0.5], 2, 0.45, 1, [0.8, 1, 0.65], 20 + i));
      }
      return merge(parts);
    }
  }
}

// Adds the plan's trees to world (instanced, one mesh per species) and
// returns how many were placed. Trees within shadowRange m of the road cast
// shadows; only that band is drawn into the shadow map.
export function buildSavanna(world, plan, terrain, { shadowRange = 160 } = {}) {
  const map = atlas(), mat = addSway(new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }));
  const start = performance.now(), tick = () => { swayUniforms.uTime.value = (performance.now() - start) / 1000; };
  const rnd = mulberry(7), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  let total = 0;
  for (const kind of SPECIES) {
    const geo = speciesGeometry(kind), all = plan[kind];
    for (const near of [true, false]) {
      const list = all.filter(([x, y]) => (terrain.dist(x, y) < shadowRange) === near);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, y, s, rot], i) => {
        const h = kind === 'papyrus' && terrain.lakeLevel !== null ? Math.max(terrain.height(x, y), terrain.lakeLevel) : terrain.height(x, y);
        m.compose(p.set(x, h - 0.2, -y), q.setFromAxisAngle(up, rot), sc.set(s, s * (0.85 + rnd() * 0.3), s));
        mesh.setMatrixAt(i, m);
        const v = 0.82 + rnd() * 0.36, warm = rnd();
        mesh.setColorAt(i, tint.setRGB(v * (0.95 + warm * 0.15), v, v * (0.8 + (1 - warm) * 0.2)));
      });
      mesh.castShadow = near && kind !== 'papyrus'; mesh.receiveShadow = true;
      mesh.name = `savanna-${kind}-${near ? 'near' : 'far'}`; mesh.onBeforeRender = tick;
      world.add(mesh); total += list.length;
    }
  }
  return total;
}
