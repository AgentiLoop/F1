// Cockpit interior finish for the f222 model: a clear-coated 2x2 twill carbon weave on
// the tub, seat and steering column, and suede headrest padding around the driver's head
// (the model paints those surfaces with the livery). Textures are generated as data, so
// they work in node tests as well as the browser.
import * as THREE from './vendor/three.module.js';

// Parts of the model's cockpit node that are bare carbon: tub interior, seat, column.
export const CARBON_PARTS = ['Object_58', 'Object_98', 'Object_5'];
// One weave tile (8 tows each way, 3 mm tows) is this many metres across.
export const WEAVE_TILE = 0.024;
// One suede nap tile (128 texels) is this many metres across.
export const NAP_TILE = 0.1;
// Bodywork triangles around the cockpit opening that are headrest padding on a real car
// (model space, metres: nose toward -x, opening x -0.65..-0.05, rim top at |z| 0.25).
export const isHeadrest = c => c.y > 0.6 && c.y < 0.9 && (
  (c.x > -0.62 && c.x < -0.02 && Math.abs(c.z) > 0.13 && Math.abs(c.z) < 0.245) ||
  (c.x > -0.13 && c.x < -0.02 && Math.abs(c.z) <= 0.13));

// Move the triangles of mesh whose world-space centroid passes test into a new mesh
// (with its own copy of the vertices they use) beside it; returns it, or null if none match.
export function splitTriangles(mesh, test, name) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry, p = g.getAttribute('position'), index = g.index;
  const keep = [], moved = [], v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    c.set(0, 0, 0); tri.forEach(i => c.add(v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)));
    (test(c.divideScalar(3)) ? moved : keep).push(...tri);
  }
  if (!moved.length) return null;
  // The new mesh keeps only the vertices its triangles use.
  const used = [...new Set(moved)], remap = new Map(used.map((i, k) => [i, k]));
  const part = new THREE.Mesh(new THREE.BufferGeometry(), mesh.material);
  for (const [k, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(used.length * a.itemSize), get = ['getX', 'getY', 'getZ', 'getW'];
    used.forEach((i, n) => { for (let d = 0; d < a.itemSize; d++) arr[n * a.itemSize + d] = a[get[d]](i); });
    part.geometry.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
  }
  part.geometry.setIndex(moved.map(i => remap.get(i))); g.setIndex(keep);
  part.name = name; part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale);
  mesh.parent.add(part);
  return part;
}

// Box-projected texture coordinates in metres / tile, from world positions (matrix):
// each vertex projects along the axis its normal is closest to.
export function addBoxUV(geometry, matrix, tile = WEAVE_TILE) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), v = new THREE.Vector3(), w = new THREE.Vector3();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix); w.fromBufferAttribute(n, i).applyMatrix3(normalMatrix);
    const ax = Math.abs(w.x), ay = Math.abs(w.y), az = Math.abs(w.z);
    const [a, b] = ax >= ay && ax >= az ? [v.z, v.y] : ay >= az ? [v.x, v.z] : [v.x, v.y];
    uv[2 * i] = a / tile; uv[2 * i + 1] = b / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const texture = (data, size, srgb) => {
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
};
// Tangent-space normal map from a wrapping height field.
function normalMap(h, size, strength) {
  const data = new Uint8Array(size * size * 4), at = (x, y) => h[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), o = 4 * (y * size + x);
    data[o] = 128 + 127 * -dx / l; data[o + 1] = 128 + 127 * -dy / l; data[o + 2] = 128 + 127 / l; data[o + 3] = 255;
  }
  return data;
}
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// 2x2 twill carbon weave: { map, normalMap, height, size }. Tows running along u catch
// more light than those along v, giving the checker sheen of real carbon.
export function carbonWeave(size = 256, tows = 8) {
  const tw = size / tows, height = new Float32Array(size * size), map = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = Math.floor(x / tw), j = Math.floor(y / tw), fu = (x % tw + 0.5) / tw, fv = (y % tw + 0.5) / tw;
    const alongU = ((i - j) % 4 + 4) % 4 < 2;
    const across = alongU ? fv : fu, along = alongU ? fu : fv;
    const h = Math.sqrt(Math.sin(Math.PI * across)) * (0.7 + 0.3 * Math.sin(Math.PI * along));
    // Individual fibre streaks along the tow.
    const fibre = 0.85 + 0.15 * hash(Math.floor(across * 24) + (alongU ? 1000 * j : 1000 * i + 500));
    const tone = (alongU ? 52 : 26) * (0.55 + 0.45 * h) * fibre, o = 4 * (y * size + x);
    height[y * size + x] = h;
    map[o] = tone; map[o + 1] = tone * 1.03; map[o + 2] = tone * 1.1; map[o + 3] = 255;
  }
  return { map: texture(map, size, true), normalMap: texture(normalMap(height, size, 1.5), size, false), height, size };
}

// Fine suede nap for the padding: a wrapping noise height field as a normal map.
export function suedeNap(size = 128) {
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = hash(i * 0.731);
  return texture(normalMap(h, size, 0.6), size, false);
}

let shared = null;
// Materials named for buildModelCar's material table (one set shared by every car).
export function cockpitMaterials() {
  if (shared) return shared;
  const weave = carbonWeave(), nap = suedeNap();
  shared = {
    'cockpit-carbon': new THREE.MeshPhysicalMaterial({ name: 'cockpit-carbon', color: 0xffffff, map: weave.map,
      normalMap: weave.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0.15, roughness: 0.38,
      clearcoat: 1, clearcoatRoughness: 0.06 }),
    'cockpit-padding': new THREE.MeshPhysicalMaterial({ name: 'cockpit-padding', color: 0x16171a, roughness: 0.95,
      normalMap: nap, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 1, sheenRoughness: 0.55, sheenColor: 0x44474d }),
  };
  return shared;
}
