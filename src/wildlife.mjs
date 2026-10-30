// Wildlife for a circuit with terrain and a lake (the RISE Motordrome), after
// the RISE sim's js/animals.js (the Akagera species, herds back from the
// track in glades the driver can see into, each animal wandering, stopping to
// graze and walking on). Our own WebGL code: each species is one instanced
// mesh of simple shapes; the legs swing, the heads dip, trunks and tails sway
// and the coats are patterned in a patched MeshStandardMaterial.
// Physics (x, y) maps to world (x, h, -y); an animal's local +z is forward.
import * as THREE from '../vendor/three.module.js';

const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// herds, animals per herd, share of young, the herd's radius (m) and how far
// its edge sits beyond the barrier (m); hippos live in the lake.
export const ANIMALS = {
  giraffe: { herds: 4, size: [4, 6], young: 0.3, radius: 14, gap: [8, 70], sight: 5 },
  elephant: { herds: 3, size: [4, 6], young: 0.35, radius: 14, gap: [10, 70], sight: 3 },
  zebra: { herds: 3, size: [6, 9], young: 0.15, radius: 8, gap: [5, 35], sight: 1.4 },
  impala: { herds: 2, size: [8, 12], young: 0.2, radius: 8, gap: [5, 35], sight: 1 },
  hippo: { herds: 2, size: [3, 5], young: 0.2, radius: 8, gap: [8, 120], water: true },
};
// Land animals stay 20 m back from the shore; hippos 7-40 m out on the water.
const onLand = (terrain, x, y) => !terrain.lake || terrain.lake(x, y) > 20;
const inWater = (terrain, x, y) => { const l = terrain.lake ? terrain.lake(x, y) : 1e9; return l < -7 && l > -40; };

// Herd sites: { kind: [{ x, y, r, water, views: [[x, y], ...]}] } in physics
// metres, and glade(x, y): true where trees would hide a herd (its range and
// a 14 m wide view corridor from the track). terrain = { height(x, y),
// dist(x, y) coarse distance to the centreline, lake(x, y) signed distance
// from the shore or null }. Each herd lies wholly beyond the barriers, away
// from the start straight, on gentle ground, where it is seen ahead of the car.
export function wildlifePlan(track, terrain, { minX, maxX, minY, maxY }, { tries = 1500 } = {}) {
  const rnd = mulberry(1994), wallAt = track.wallOffset, pts = [];
  for (let s = 0; s < track.length; s += 15) {
    const [x, y] = track.point(s), [x2, y2] = track.point(s + 1), l = Math.hypot(x2 - x, y2 - y) || 1;
    pts.push({ x, y, h: terrain.height(x, y), tx: (x2 - x) / l, ty: (y2 - y) / l });
  }
  const straight = s => { s = ((s % track.length) + track.length) % track.length; return s > track.length - 320 || s < 420; };
  // Track points that see (x, y) ahead, 25-170 m out within 35 degrees of
  // the way the car is going, over the ground in between (eye 1.5 m up).
  const views = (x, y, tall) => {
    const out = [], target = terrain.height(x, y) + tall * 0.7;
    for (const p of pts) {
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d < 25 || d > 170 || (dx * p.tx + dy * p.ty) / d < 0.82) continue;
      let seen = true;
      for (let t = 0.15; t < 0.95 && seen; t += 0.1) seen = terrain.height(p.x + dx * t, p.y + dy * t) < p.h + 1.5 + (target - p.h - 1.5) * t - 0.3;
      if (seen) out.push(p);
    }
    return out;
  };
  const herds = {}, taken = [];
  for (const [kind, cfg] of Object.entries(ANIMALS)) {
    herds[kind] = [];
    const lo = wallAt + cfg.radius + cfg.gap[0], hi = wallAt + cfg.radius + cfg.gap[1];
    for (let h = 0; h < cfg.herds; h++) {
      let best = null;
      for (let k = 0; k < tries; k++) {
        const x = minX - hi + rnd() * (maxX - minX + 2 * hi), y = minY - hi + rnd() * (maxY - minY + 2 * hi);
        const coarse = terrain.dist(x, y);
        if (coarse < lo - 30 || coarse > hi + 30) continue;
        if (cfg.water ? !inWater(terrain, x, y) : !onLand(terrain, x, y)) continue;
        if (taken.some(t => Math.hypot(t.x - x, t.y - y) < (t.kind === kind ? 260 : 110))) continue;
        const d = Math.abs(track.offset(x, y)), s = track.progress(x, y);
        if (d < lo || d > hi || straight(s)) continue;
        let score;
        if (cfg.water) score = 200 - d;
        else {
          const h0 = terrain.height(x, y);
          if ([[20, 0], [-20, 0], [0, 20], [0, -20]].some(([a, b]) => Math.abs(terrain.height(x + a, y + b) - h0) > 6)) continue;
          const seen = views(x, y, cfg.sight);
          if (seen.length < 2) continue;
          score = seen.length + (hi - d) * 0.3 + rnd();
          if (!best || score > best.score) {
            const far = seen.reduce((a, p) => Math.hypot(p.x - x, p.y - y) > Math.hypot(a.x - x, a.y - y) ? p : a);
            best = { kind, x, y, r: cfg.radius, water: false, score, views: [track.point(s), [far.x, far.y]] };
          }
          continue;
        }
        if (!best || score > best.score) best = { kind, x, y, r: cfg.radius, water: true, score, views: [] };
      }
      if (best) { herds[kind].push(best); taken.push(best); }
    }
  }
  const land = taken.filter(g => !g.water);
  const corridor = (x, y, g, [vx, vy]) => {
    const ax = g.x - vx, ay = g.y - vy, t = clamp(((x - vx) * ax + (y - vy) * ay) / (ax * ax + ay * ay), 0, 1);
    return Math.hypot(x - vx - ax * t, y - vy - ay * t) < 7;
  };
  const glade = (x, y) => land.some(g => Math.hypot(x - g.x, y - g.y) < g.r + 12 || g.views.some(v => corridor(x, y, g, v)));
  return { herds, glade };
}

// ---------- shapes ----------
// Every part is non-indexed with position, normal, color, aPat (coat
// pattern: 1 giraffe patches, 2 wrinkled grey skin, 3 zebra stripes, 4 zebra
// leg rings, 5 impala belly, 6 hippo belly) and aRig (leg pair 1 or 2, hip
// height, 1 if it pitches with the head, sideways sway).
function part(geo, color, { pat = 0, leg = [0, 0], head = 0, sway = 0 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new THREE.Color(color);
  const col = new Float32Array(n * 3), pa = new Float32Array(n), rig = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); pa[i] = pat; rig.set([leg[0], leg[1], head, sway], i * 4); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('aPat', new THREE.BufferAttribute(pa, 1)); out.setAttribute('aRig', new THREE.BufferAttribute(rig, 4));
  return out;
}
const blob = (rx, ry, rz, x, y, z, tilt = 0, seg = 12) => {
  const g = new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.7)).scale(rx, ry, rz);
  if (tilt) g.rotateX(tilt);
  return g.translate(x, y, z);
};
// Tapered limb from a (radius r0) to b (radius r1).
const limb = (a, b, r0, r1, seg = 8) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), g = new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  const m = A.add(B).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
};
// Four legs; the diagonal pairs (front left with rear right) swing together.
function legs(P, { x, front, rear, hipF, hipR, r0, r1, knee = 0.5, color, lower = color, pat = 0, lowerPat = pat, hoof = 0x1a1612, hoofR = r1 * 1.15 }) {
  for (const [sx, z, hip, pair] of [[1, front, hipF, 1], [-1, rear, hipR, 1], [-1, front, hipF, 2], [1, rear, hipR, 2]]) {
    const k = hip * knee, mid = (r0 + r1) / 2, rig = { leg: [pair, hip] };
    P.push(part(limb([sx * x, hip + 0.05, z], [sx * x, k, z], r0, mid), color, { pat, ...rig }));
    P.push(part(limb([sx * x, k, z], [sx * x, 0.04, z], mid, r1), lower, { pat: lowerPat, ...rig }));
    P.push(part(blob(hoofR, 0.05, hoofR, sx * x, 0.05, z, 0, 8), hoof, rig));
  }
}
function merge(parts) {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0), geo = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['aPat', 1], ['aRig', 4]]) {
    const arr = new Float32Array(total * size); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return geo;
}

// Each species: geometry, the neck's pivot (y, z), how far the head dips to
// graze (rad), sway amplitude (m), stride (m), walking speed (m/s), how much
// it grazes when standing (0-1) and the belly line (m) for two-tone coats.
function species(kind) {
  const P = [];
  switch (kind) {
    case 'giraffe': {
      const tan = 0xc99a52, head = { pat: 1, head: 1 };
      legs(P, { x: 0.22, front: 0.55, rear: -0.6, hipF: 2.05, hipR: 1.85, r0: 0.09, r1: 0.05, color: tan, pat: 1, lower: 0xe6d6b0, lowerPat: 0 });
      P.push(part(blob(0.36, 0.42, 0.85, 0, 2.05, 0, -0.12), tan, { pat: 1 }));
      P.push(part(limb([0, 2.25, 0.55], [0, 4.2, 1.25], 0.18, 0.09), tan, head));
      P.push(part(limb([0, 2.38, 0.4], [0, 4.14, 1.06], 0.05, 0.035, 6), 0x6b4a2a, { head: 1 })); // mane
      P.push(part(blob(0.11, 0.13, 0.3, 0, 4.3, 1.42, 0.35), tan, head));
      for (const s of [1, -1]) {
        P.push(part(limb([s * 0.05, 4.4, 1.3], [s * 0.065, 4.56, 1.27], 0.025, 0.02, 6), 0x3a2a1c, { head: 1 })); // ossicones
        P.push(part(blob(0.09, 0.03, 0.04, s * 0.13, 4.39, 1.33), tan, { head: 1 }));
      }
      P.push(part(limb([0, 2.15, -0.82], [0, 1.25, -0.9], 0.025, 0.02, 6), tan, { sway: 1 }));
      P.push(part(blob(0.05, 0.12, 0.05, 0, 1.2, -0.9, 0, 6), 0x2a1e14, { sway: 1 }));
      return { geo: merge(P), pivot: [2.25, 0.55], graze: 0.35, sway: 0.12, stride: 2.6, speed: 1.1, grazer: 0.5, belly: 0 };
    }
    case 'elephant': {
      const grey = 0xa29b93, skin = { pat: 2 };
      legs(P, { x: 0.55, front: 0.85, rear: -0.85, hipF: 1.65, hipR: 1.6, r0: 0.3, r1: 0.26, knee: 0.45, color: grey, pat: 2, hoof: 0xb8b0a0, hoofR: 0.29 });
      P.push(part(blob(0.95, 1.05, 1.55, 0, 2.0, 0), grey, skin));
      P.push(part(blob(0.62, 0.68, 0.6, 0, 2.55, 1.55), grey, { pat: 2, head: 1 }));
      for (const s of [1, -1]) {
        P.push(part(blob(0.07, 0.62, 0.5, s * 0.62, 2.5, 1.25), 0x958e87, { pat: 2, head: 1 })); // ears
        P.push(part(limb([s * 0.2, 2.15, 1.95], [s * 0.26, 1.72, 2.5], 0.065, 0.025), 0xeee6d2, { head: 1 })); // tusks
      }
      // trunk in three sections, the tip swinging most
      P.push(part(limb([0, 2.4, 2.0], [0, 1.65, 2.32], 0.21, 0.16), grey, { pat: 2, head: 1, sway: 0.3 }));
      P.push(part(limb([0, 1.65, 2.32], [0, 0.95, 2.36], 0.16, 0.12), grey, { pat: 2, head: 1, sway: 0.65 }));
      P.push(part(limb([0, 0.95, 2.36], [0, 0.42, 2.24], 0.12, 0.09), grey, { pat: 2, head: 1, sway: 1 }));
      P.push(part(limb([0, 2.3, -1.5], [0, 1.3, -1.62], 0.04, 0.03, 6), grey, { sway: 1 }));
      return { geo: merge(P), pivot: [2.35, 1.15], graze: 0.12, sway: 0.22, stride: 2.0, speed: 1.0, grazer: 1, belly: 0 };
    }
    case 'zebra': case 'impala': {
      const impala = kind === 'impala', k = impala ? 0.8 : 1, S = v => v * k;
      const body = impala ? 0xa5622c : 0xf2efe6, pat = impala ? 5 : 3;
      legs(P, { x: S(0.14), front: S(0.5), rear: S(-0.5), hipF: S(0.98), hipR: S(0.95), r0: S(0.065), r1: S(0.035), color: body, pat, lower: impala ? 0x8a4f24 : body, lowerPat: impala ? 0 : 4 });
      P.push(part(blob(S(0.27), S(0.32), S(0.72), 0, S(1.0), 0), body, { pat }));
      P.push(part(limb([0, S(1.05), S(0.45)], [0, S(1.52), S(0.83)], S(0.14), S(0.09)), body, { pat, head: 1 }));
      P.push(part(blob(S(0.09), S(0.11), S(0.27), 0, S(1.5), S(1.02), 0.75), body, { pat, head: 1 }));
      P.push(part(blob(S(0.07), S(0.07), S(0.07), 0, S(1.36), S(1.2)), impala ? 0xe8e2d6 : 0x151515, { head: 1 })); // muzzle
      for (const s of [1, -1]) {
        P.push(part(blob(S(0.03), S(0.09), S(0.02), s * S(0.07), S(1.66), S(0.94), 0, 6), body, { head: 1 })); // ears
        if (impala) P.push(part(limb([s * S(0.04), S(1.6), S(1.0)], [s * S(0.09), S(1.95), S(0.86)], S(0.022), S(0.01), 5), 0x2a2018, { head: 1 })); // horns
      }
      if (!impala) P.push(part(limb([0, S(1.26), S(0.38)], [0, S(1.68), S(0.74)], S(0.03), S(0.025), 5), 0x151515, { head: 1 })); // mane
      P.push(part(limb([0, S(1.1), S(-0.7)], [0, S(0.62), S(-0.78)], S(0.025), S(0.02), 5), impala ? 0x2a2018 : body, { pat, sway: 1 }));
      return { geo: merge(P), pivot: [S(1.05), S(0.45)], graze: 1.7, sway: 0.06, stride: S(1.5), speed: impala ? 1.3 : 1.2, grazer: 1, belly: S(0.92) };
    }
    default: { // hippo
      const skin = 0x7c6b6e, pat = { pat: 6 };
      legs(P, { x: 0.45, front: 0.8, rear: -0.8, hipF: 0.55, hipR: 0.55, r0: 0.22, r1: 0.2, color: skin, pat: 6 });
      P.push(part(blob(0.85, 0.7, 1.55, 0, 0.82, 0), skin, pat));
      P.push(part(blob(0.55, 0.45, 0.6, 0, 1.0, 1.45), skin, { pat: 6, head: 1 }));
      P.push(part(blob(0.5, 0.34, 0.36, 0, 0.88, 1.92), skin, { pat: 6, head: 1 }));
      for (const s of [1, -1]) {
        P.push(part(blob(0.07, 0.08, 0.06, s * 0.27, 1.43, 1.25, 0, 6), skin, { head: 1 })); // ears
        P.push(part(blob(0.09, 0.07, 0.09, s * 0.22, 1.36, 1.55, 0, 6), skin, { head: 1 })); // eyes
      }
      return { geo: merge(P), pivot: [1.0, 1.0], graze: 0.15, sway: 0, stride: 1.4, speed: 0.35, grazer: 0.4, belly: 0.55 };
    }
  }
}

// ---------- material: motion and coats ----------
// Vertex: legs swing about the hip (diagonal pairs in opposite phase), the
// neck pitches about its pivot to graze with a slow nod, trunks and tails
// sway. Runs before the instance matrix, so it also drives the shadow.
const MOTION = `
  vec3 p = transformed; float walk = aState.x, phase = aState.z;
  if (aRig.x > 0.5) {
    float a = sin(uTime * uWalk.x + phase + aRig.x * 3.14159) * 0.38 * walk, below = max(aRig.y - p.y, 0.0);
    p.z += below * sin(a); p.y += below * (1.0 - cos(a)) * 0.6;
  }
  float ang = (aState.y * uWalk.y + sin(uTime * 0.9 + phase * 1.7) * 0.05) * aRig.z, c = cos(ang), s = sin(ang);
  vec2 d = vec2(p.y - uPivot.x, p.z - uPivot.y);
  p.y = d.x * c - d.y * s + uPivot.x; p.z = d.x * s + d.y * c + uPivot.y;
  p.x += aRig.w * sin(uTime * 1.6 + phase * 2.3) * uWalk.z;
  transformed = p;`;
const HEAD = 'attribute vec4 aRig;\nattribute vec4 aState;\nuniform float uTime;\nuniform vec2 uPivot;\nuniform vec3 uWalk;\n';
function rig(shader, u, coat) {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = HEAD + (coat ? 'attribute float aPat;\nvarying float vPat;\nvarying vec3 vLocal;\n' : '')
    + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (coat ? 'vPat = aPat; vLocal = position;\n' : '') + MOTION);
  if (!coat) return;
  shader.fragmentShader = `uniform float uBelly;\nvarying float vPat;\nvarying vec3 vLocal;
vec3 hash3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
vec2 cells(vec3 p) { vec3 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z), r = o + hash3(i + o) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return sqrt(vec2(d1, d2)); }
` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 q = vLocal, col = diffuseColor.rgb; int k = int(vPat + 0.5);
    float grain = 0.94 + 0.12 * fract(sin(dot(floor(q * 18.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    if (k == 1) { vec2 c = cells(q * vec3(6.5, 4.5, 6.5)); col = mix(col * 1.15, vec3(0.16, 0.07, 0.025), smoothstep(0.05, 0.12, c.y - c.x)); }
    else if (k == 2) col *= grain;
    else if (k == 3) col = mix(col, vec3(0.02), smoothstep(0.05, 0.25, sin(q.z * 24.0 + q.y * 9.0 + sin(q.y * 7.0) * 1.6)));
    else if (k == 4) col = mix(col, vec3(0.02), smoothstep(0.0, 0.3, sin(q.y * 48.0)));
    else if (k == 5) col = mix(col, vec3(0.85, 0.82, 0.76), smoothstep(uBelly + 0.02, uBelly - 0.06, q.y));
    else if (k == 6) col = mix(col * grain, vec3(0.5, 0.3, 0.3), smoothstep(uBelly + 0.08, uBelly - 0.15, q.y));
    diffuseColor.rgb = col; }`);
}

// Adds the plan's herds to world and returns { counts, update(dt) }: call
// update every frame to move them. terrain as for wildlifePlan, plus
// lakeLevel for the hippos.
export function buildWildlife(world, plan, terrain) {
  const rnd = mulberry(2030), time = { value: 0 }, groups = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (const [kind, cfg] of Object.entries(ANIMALS)) {
    const herds = plan.herds[kind] ?? [];
    if (!herds.length) continue;
    const sp = species(kind), ok = cfg.water ? (x, y) => inWater(terrain, x, y) : (x, y) => onLand(terrain, x, y);
    const list = [];
    for (const herd of herds) for (let k = 0, n = cfg.size[0] + Math.floor(rnd() * (cfg.size[1] - cfg.size[0] + 1)); k < n; k++) {
      let x = herd.x, y = herd.y;
      for (let t = 0; t < 20; t++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * herd.r * 0.8, tx = herd.x + Math.cos(a) * r, ty = herd.y + Math.sin(a) * r;
        if (ok(tx, ty)) { x = tx; y = ty; break; }
      }
      const young = rnd() < cfg.young;
      list.push({ x, y, herd, yaw: rnd() * Math.PI * 2, speed: 0, pace: 0.8 + rnd() * 0.4, target: null, timer: rnd() * 8, graze: rnd(),
        scale: young ? 0.55 + rnd() * 0.1 : 0.88 + rnd() * 0.22, bob: rnd() * 6.28, h: null });
    }
    const state = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
    list.forEach((a, i) => { state.array[i * 4 + 2] = a.bob; });
    sp.geo.setAttribute('aState', state);
    const u = { uTime: time, uPivot: { value: new THREE.Vector2(...sp.pivot) }, uWalk: { value: new THREE.Vector3(2 * Math.PI * sp.speed / sp.stride, sp.graze, sp.sway) }, uBelly: { value: sp.belly } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    mat.onBeforeCompile = shader => rig(shader, u, true);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = shader => rig(shader, u, false);
    const mesh = new THREE.InstancedMesh(sp.geo, mat, list.length);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = `wildlife-${kind}`;
    world.add(mesh);
    groups.push({ kind, cfg, sp, list, mesh, state, ok });
  }
  const place = (g, a, i) => {
    if (a.h === null || a.speed > 0.01) a.h = g.cfg.water ? null : terrain.height(a.x, a.y) - 0.03;
    const h = g.cfg.water ? terrain.lakeLevel - 1.12 * a.scale + Math.sin(time.value * 0.9 + a.bob) * 0.04 : a.h;
    g.mesh.setMatrixAt(i, m.compose(pos.set(a.x, h, -a.y), q.setFromAxisAngle(up, a.yaw), scl.setScalar(a.scale)));
  };
  // Anywhere near home: the herd's range lies wholly beyond the barriers.
  const valid = (g, a, x, y) => Math.hypot(x - a.herd.x, y - a.herd.y) <= a.herd.r * 1.15 && g.ok(x, y);
  const update = dt => {
    dt = Math.min(dt, 0.1); time.value += dt;
    for (const g of groups) {
      const { sp, list } = g;
      list.forEach((a, i) => {
        a.timer -= dt;
        if (a.timer <= 0) {
          if (a.target) { a.target = null; a.timer = 5 + rnd() * 12; }
          else { // a new spot in the herd's range
            const ang = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * a.herd.r, tx = a.herd.x + Math.cos(ang) * r, ty = a.herd.y + Math.sin(ang) * r;
            if (valid(g, a, tx, ty)) { a.target = { x: tx, y: ty }; a.timer = 40; } else a.timer = 1;
          }
        }
        let want = 0;
        if (a.target) {
          const dx = a.target.x - a.x, dy = a.target.y - a.y;
          if (Math.hypot(dx, dy) < 1.2) { a.target = null; a.timer = 5 + rnd() * 12; }
          else { // yaw 0 faces world +z = physics -y
            let turn = Math.atan2(dx, -dy) - a.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            a.yaw += clamp(turn, -0.7 * dt, 0.7 * dt);
            want = Math.abs(turn) < 1.2 ? sp.speed * a.pace * (a.scale < 0.7 ? 1.15 : 1) : 0.15;
          }
        }
        a.speed += (want - a.speed) * Math.min(1, dt * 1.5);
        if (a.speed > 0.01) {
          const nx = a.x + Math.sin(a.yaw) * a.speed * dt, ny = a.y - Math.cos(a.yaw) * a.speed * dt;
          if (valid(g, a, nx, ny)) { a.x = nx; a.y = ny; } else { a.target = null; a.timer = 1 + rnd() * 3; }
        }
        // heads down to graze while standing
        a.graze += ((a.target ? 0 : sp.grazer) - a.graze) * Math.min(1, dt * 0.8);
        g.state.array[i * 4] = clamp(a.speed / (sp.speed * a.scale + 0.01), 0, 1.2);
        g.state.array[i * 4 + 1] = a.graze;
        place(g, a, i);
      });
      g.mesh.instanceMatrix.needsUpdate = true; g.state.needsUpdate = true;
    }
  };
  update(0);
  return { counts: Object.fromEntries(groups.map(g => [g.kind, g.list.length])), update };
}
