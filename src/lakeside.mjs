// Lakeside hospitality pods for a circuit with the RISE Motordrome's lake,
// after the RISE sim's js/scenery.js buildLakeside: round thatched pods on
// raised decks along the shore between the esses and the water, each with a
// 34 m plank jetty out over the lake. Their placement (rays from the
// lakeside lobe's centre, at least 25 m from the road, 26 m apart, radius from
// mulberry seed 7), except that on our steeper banks a pod stands on the
// waterline itself (its deck on piles at the sim's 1.2 m over the water, its
// back set into the bank, which may rise at most 4 m under it) so its jetty
// starts over the water (theirs: 14 m out from the shore, up to 16 m up).
// Our own WebGL code (instanced meshes and a canvas thatch instead of the
// sim's node shaders); no night glow, as our game has no night.
// Physics (x, y) maps to world (x, h, -y); the sim's world (x, z) is ours.
import * as THREE from '../vendor/three.module.js';

const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const JETTY = 34;

// terrain: { height(x, y), dist(x, y), lake(x, y), lakeLevel } in physics x / y.
// Returns { pods: [{ x, y, r, jx, jy }], clear(x, y) }: (jx, jy) is the unit
// direction of the jetty into the lake; clear is false where a tree would stand in a pod.
export function lakesidePlan(terrain) {
  const pods = [], rand = mulberry(7), cx = -560, cy = 40, lake = terrain.lakeLevel;
  for (let a = -2.4; a < 1.6; a += 0.075) {
    // the sim's ray in its world (x, z), z = -y, from the water to the first dry ground
    const r = 5 + rand() * 2.5, dx = Math.cos(a), dy = -Math.sin(a), wet = (x, y) => terrain.height(x, y) <= lake + 0.3;
    if (!wet(cx + dx * 60, cy + dy * 60)) continue;
    let at = null;
    for (let d = 62; d < 480 && !at; d += 2) { const x = cx + dx * d, y = cy + dy * d; if (!wet(x, y)) at = { x, y }; }
    if (!at || terrain.dist(at.x, at.y) < 25) continue;
    if (terrain.height(at.x + dx * r, at.y + dy * r) > lake + 4) continue;
    if (pods.some(p => Math.hypot(p.x - at.x, p.y - at.y) < 26)) continue;
    pods.push({ ...at, r, jx: -dx, jy: -dy });
  }
  const clear = (x, y) => !pods.some(p => Math.hypot(x - p.x, y - p.y) < p.r + 7 || jettyDist(p, x, y) < 4);
  return { pods, clear };
}

// Distance from (x, y) to the jetty's centre line.
function jettyDist(p, x, y) {
  const dx = x - p.x, dy = y - p.y, t = Math.max(p.r, Math.min(p.r + JETTY, dx * p.jx + dy * p.jy));
  return Math.hypot(dx - p.jx * t, dy - p.jy * t);
}

export function buildLakeside(world, plan, terrain) {
  const n = plan.pods.length;
  if (!n) return 0;
  const lake = terrain.lakeLevel;
  const thatch = document.createElement('canvas'); thatch.width = 256; thatch.height = 64;
  const g = thatch.getContext('2d'), rnd = mulberry(91);
  g.fillStyle = '#735229'; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 900; i++) { const v = 0.6 + rnd() * 0.55; g.fillStyle = `rgb(${115 * v | 0},${82 * v | 0},${43 * v | 0})`; g.fillRect(rnd() * 256, rnd() * 64, 1 + rnd(), 6 + rnd() * 14); }
  const map = new THREE.CanvasTexture(thatch); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(6, 1);
  const parts = [
    [new THREE.CylinderGeometry(1, 1, 1, 28), new THREE.MeshStandardMaterial({ color: 0xb89a74, roughness: 0.8 })],
    [new THREE.CylinderGeometry(1, 1.05, 1, 28), new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.85 })],
    [new THREE.ConeGeometry(1, 1, 28, 1), new THREE.MeshStandardMaterial({ map, roughness: 1 })],
    [new THREE.BoxGeometry(2.2, 0.3, 1), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 })],
  ];
  const meshes = parts.map(([geo, mat], k) => {
    const im = new THREE.InstancedMesh(geo, mat, n); im.name = ['lakeside-decks', 'lakeside-pods', 'lakeside-roofs', 'lakeside-jetties'][k];
    im.castShadow = im.receiveShadow = true; world.add(im); return im;
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  plan.pods.forEach((p, i) => {
    // deck 1.2 m over the water, reaching 4.8 m down into the lake bed and the bank
    const base = lake + 1.2;
    meshes[0].setMatrixAt(i, m.compose(v.set(p.x, base - 2.4, -p.y), q.identity(), s.set(p.r + 3, 4.8, p.r + 3)));
    meshes[1].setMatrixAt(i, m.compose(v.set(p.x, base + 1.6, -p.y), q, s.set(p.r, 3.2, p.r)));
    meshes[2].setMatrixAt(i, m.compose(v.set(p.x, base + 3.2 + p.r * 0.45, -p.y), q, s.set(p.r * 1.3, p.r * 0.9, p.r * 1.3)));
    // the jetty's length along its local z, pointing (jx, jy): world (jx, -jy)
    const d = p.r + JETTY / 2;
    q.setFromAxisAngle(up, Math.atan2(p.jx, -p.jy));
    meshes[3].setMatrixAt(i, m.compose(v.set(p.x + p.jx * d, lake + 0.7, -(p.y + p.jy * d)), q, s.set(1, 1, JETTY)));
  });
  return n;
}
