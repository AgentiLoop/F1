// Three.js circuit scenery for the stadium test track used by the physics
// surface function. Physics (x, y) maps to world (x, 0, -y); y is up.
import * as THREE from '../vendor/three.module.js';
import { stadiumPitLane } from './track.mjs';
import { buildSavanna, savannaPlan } from './savanna.mjs';
import { buildRiseStands } from './stands.mjs';
import { DEFAULT_SCENERY, waterField } from './scenery.mjs';
import { buildWildlife, wildlifePlan } from './wildlife.mjs';
import { buildLake } from './lake.mjs';
import { buildSky } from './sky.mjs';
import { structuresPlan, buildStructures } from './structures.mjs';
import { lakesidePlan, buildLakeside } from './lakeside.mjs';

function texture(size, draw, repeatX = 1, repeatY = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function noise(g, s, base, spread, count) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = (Math.random() - 0.5) * spread;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
// Photo-scanned race-track asphalt (Poly Haven, CC0; models/CREDITS.md) for a
// ribbon `width` metres across with v = s / vScale, at 2.5 m per tile.
function asphaltMaterial(width, vScale = 30) {
  const loader = new THREE.TextureLoader(), tile = 2.5;
  const [map, normalMap, roughnessMap] = ['diff', 'nor_gl', 'rough'].map(m => {
    const t = loader.load(new URL(`../models/asphalt_track_${m}_1k.jpg`, import.meta.url).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(width / tile, vScale / tile); t.anisotropy = 8;
    if (m === 'diff') t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map, normalMap, roughnessMap, roughness: 1 });
}

// Centerline samples (counter-clockwise from the start line) with left normals.
export function centerline(halfStraight, radius, step = 2) {
  const pts = [];
  const push = (x, y, dx, dy) => pts.push({ x, y, nx: -dy, ny: dx });
  for (let x = -halfStraight; x < halfStraight; x += step) push(x, -radius, 1, 0);
  const n = Math.ceil(Math.PI * radius / step);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + Math.PI * i / n; push(halfStraight + radius * Math.cos(a), radius * Math.sin(a), -Math.sin(a), Math.cos(a)); }
  for (let x = halfStraight; x > -halfStraight; x -= step) push(x, radius, -1, 0);
  for (let i = 0; i < n; i++) { const a = Math.PI / 2 + Math.PI * i / n; push(-halfStraight + radius * Math.cos(a), radius * Math.sin(a), -Math.sin(a), Math.cos(a)); }
  pts.push({ ...pts[0] });
  let s = 0;
  pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.s = s; });
  return pts;
}

// Strip between left offsets a and b; vertical when y1 is given (walls).
// Heights are above the ground at each point (p.h(left offset), else 0).
function ribbon(pts, a, b, y0, material, vScale, y1) {
  const pos = [], uv = [], idx = [], H = (p, o) => p.h ? p.h(o) : 0;
  pts.forEach((p, i) => {
    if (y1 === undefined) pos.push(p.x + p.nx * a, y0 + H(p, a), -(p.y + p.ny * a), p.x + p.nx * b, y0 + H(p, b), -(p.y + p.ny * b));
    else { const g = H(p, a); pos.push(p.x + p.nx * a, y0 + g, -(p.y + p.ny * a), p.x + p.nx * a, y1 + g, -(p.y + p.ny * a)); }
    uv.push(0, p.s / vScale, 1, p.s / vScale);
    if (i) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

// boxColors: one paint colour per pit box (car index order).
export function buildWorld({ halfStraight, radius, roadWidth, boxColors = [] }) {
  const world = new THREE.Group();
  const pts = centerline(halfStraight, radius);
  const half = roadWidth / 2, pit = stadiumPitLane(halfStraight, radius, roadWidth);
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });

  // Sky dome with a horizon gradient.
  const sky = new THREE.SphereGeometry(1800, 32, 16), col = [];
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const t = Math.max(0, sky.attributes.position.getY(i) / 1800);
    const c = new THREE.Color(0xdfe9f1).lerp(new THREE.Color(0x3d78b8), Math.pow(t, 0.6)); col.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  world.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

  const grass = texture(256, (g, s) => {
    noise(g, s, '#3f6b2e', 0.25, 9000);
    for (let i = 0; i < s; i += 64) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, i, s, 32); }
  }, 300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; world.add(ground);

  const kerb = texture(64, (g, s) => { g.fillStyle = '#d8dad6'; g.fillRect(0, 0, s, s); g.fillStyle = '#c3302b'; g.fillRect(0, 0, s, s / 2); });
  const wall = texture(128, (g, s) => {
    g.fillStyle = '#c9ccc8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#13263a'; g.fillRect(0, 0, s, s * 0.55);
    g.fillStyle = '#6fffc3'; g.fillRect(0, s * 0.55, s, s * 0.05);
  });
  const runoff = texture(256, (g, s) => noise(g, s, '#8b8170', 0.3, 20000), 4, 1);
  const road = asphaltMaterial(roadWidth);
  world.add(ribbon(pts, -half, half, 0, road, 30));
  for (const s of [-1, 1]) {
    world.add(ribbon(pts, s * half, s * (half + 1.2), 0.012, std({ map: kerb, roughness: 0.7 }), 4));
    world.add(ribbon(pts, s * (half - 0.45), s * (half - 0.2), 0.008, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
    world.add(ribbon(pts, s * (half + 1.2), s * (half + 8), 0.004, std({ map: runoff, roughness: 1 }), 20));
    const w = ribbon(pts, s * (half + 12), 0, 0, std({ map: wall, roughness: 0.8 }), 6, 1.1);
    w.castShadow = true; world.add(w);
  }
  // Pit lane (track.mjs layout): asphalt apron on the inside from the entry to
  // the exit, a solid white line along the circuit edge, speed-limit lines,
  // painted boxes in each car's colour and a garage block behind the wall.
  const along = (a, b) => pts.filter(p => p.s >= a && p.s <= b);
  world.add(ribbon(along(pit.entry, pit.exit), pit.inner, pit.outer, 0.006, asphaltMaterial(Math.abs(pit.outer - pit.inner)), 30));
  world.add(ribbon(along(pit.entry, pit.exit), pit.inner, pit.inner + 0.25, 0.009, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
  const paint = (s, offset, length, width, color, y = 0.01) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(length, width), std({ color, roughness: 0.6 }));
    m.rotation.x = -Math.PI / 2; m.position.set(s - halfStraight, y, radius + offset); world.add(m); m.receiveShadow = true;
  };
  for (const s of [pit.limitStart, pit.limitEnd]) paint(s, -(pit.inner + pit.outer) / 2, 0.4, pit.outer - pit.inner, 0xf2f2ee);
  for (let i = 0; i < Math.max(boxColors.length, 5); i++) {
    const s = pit.boxStart + pit.boxSpacing * i;
    paint(s, pit.boxOffset, 7, 3, 0xf2f2ee); paint(s, pit.boxOffset, 6.6, 2.6, boxColors[i] ?? 0x3a4450, 0.012);
  }
  const garageLength = pit.boxSpacing * 4 + 60; // from 30 m before the first box to 30 m past the fifth
  const garage = new THREE.Mesh(new THREE.BoxGeometry(garageLength, 6, 7), std({ color: 0xd9dcd6, roughness: 0.7 }));
  garage.position.set(pit.boxStart - 30 + garageLength / 2 - halfStraight, 3, radius - (half + 12 + 4.5)); garage.castShadow = garage.receiveShadow = true; world.add(garage);
  // Start/finish: chequered strip, gantry with lights.
  const chequer = texture(128, (g, s) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#eee'; g.fillRect(i * s / 8, j * s / 8, s / 8, s / 8); } }, 1, 7.5);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.6, roadWidth), new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.6 }));
  line.rotation.x = -Math.PI / 2; line.position.set(0.8, 0.014, radius); line.receiveShadow = true; world.add(line);
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.7, roughness: 0.4 });
  for (const z of [radius - half - 2, radius + half + 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); post.position.set(-6, 3.5, z); post.castShadow = true; world.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, roadWidth + 4.5), steel); beam.position.set(-6, 7, radius); beam.castShadow = true; world.add(beam);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0.6 }));
    l.rotation.y = -Math.PI / 2; l.position.set(-6.41, 7, radius - 2 + i); world.add(l);
  }
  // Grandstands outside the main straight: seated crowd on the treads/risers,
  // concrete end walls, back wall, roof columns so nothing floats.
  const crowd = texture(512, (g, s) => {
    g.fillStyle = '#2a3440'; g.fillRect(0, 0, s, s);
    const seat = s / 16;
    for (let i = 0; i < 16; i++) {
      const x = i * seat;
      g.fillStyle = '#1d5f8c'; g.fillRect(x + 2, s * 0.55, seat - 4, s * 0.45);
      if (Math.random() < 0.12) continue;
      g.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${30 + Math.random() * 40}%)`;
      g.fillRect(x + seat * 0.18, s * 0.38, seat * 0.64, s * 0.62);
      g.fillStyle = `hsl(${20 + Math.random() * 15},${30 + Math.random() * 30}%,${35 + Math.random() * 40}%)`;
      g.beginPath(); g.arc(x + seat / 2, s * 0.26, seat * 0.26, 0, Math.PI * 2); g.fill();
    }
  }, 110 / 8, 1);
  const concrete = new THREE.MeshStandardMaterial({ map: texture(128, (g, s) => noise(g, s, '#a7aaa6', 0.18, 3000), 4, 2), roughness: 0.95 });
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const stepMats = [concrete, concrete, crowdMat, concrete, concrete, crowdMat];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.5, side: THREE.DoubleSide });
  const z0 = radius + half + 18, zFront = z0 - 1, zBack = z0 + 15, roofY = 14;
  const endShape = new THREE.Shape();
  [[zFront, 0], [zFront, 1.4], [zBack, 10.4], [zBack + 0.6, roofY], [zBack + 0.6, 0]]
    .forEach(([z, y], i) => i ? endShape.lineTo(-z, y) : endShape.moveTo(-z, y));
  const endGeo = new THREE.ExtrudeGeometry(endShape, { depth: 0.6, bevelEnabled: false });
  const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; world.add(mesh); return mesh; };
  for (const x of [-140, 0, 140]) {
    for (let r = 0; r < 8; r++) add(new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 2), stepMats)).position.set(x, 0.6 + r * 1.2, z0 + r * 2);
    for (const ex of [x - 55.6, x + 55]) { const e = add(new THREE.Mesh(endGeo, concrete)); e.rotation.y = Math.PI / 2; e.position.x = ex; }
    add(new THREE.Mesh(new THREE.BoxGeometry(111.2, roofY, 0.6), concrete)).position.set(x, roofY / 2, zBack + 0.3);
    for (let i = 0; i < 7; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.35, roofY, 0.35), steel)).position.set(x - 54.4 + i * 18.13, roofY / 2, zFront - 0.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(114, 0.4, 20), roofMat)).position.set(x, roofY + 0.2, radius + half + 25);
  }
  // Catch fence above both walls: alpha-tested diamond mesh plus steel posts.
  const meshTex = texture(64, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#b9c0c4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  }, 20, 1);
  const fenceMat = new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  const postSpots = [];
  for (const s of [-1, 1]) {
    world.add(ribbon(pts, s * (half + 12), 0, 1.1, fenceMat, 0.16, 4.2));
    pts.forEach((p, i) => { if (i % 4 === 0) postSpots.push([p.x + p.nx * s * (half + 12), p.y + p.ny * s * (half + 12)]); });
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), steel, postSpots.length);
  postSpots.forEach(([x, y], i) => posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.1, -y)));
  world.add(posts);

  // AgentiLoop Racing branding: trackside hoardings, gantry, grandstand fascias, infield.
  const logo = (w, h, bg = true, repeat = 1) => {
    const t = texture(1, () => {}, repeat, 1);
    const cv = t.image; cv.width = w; cv.height = h; drawLogo(cv.getContext('2d'), w, h, bg); t.needsUpdate = true;
    return t;
  };
  const logoMat = new THREE.MeshStandardMaterial({ map: logo(1024, 128), roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.08 });
  logoMat.emissiveMap = logoMat.map;
  const boardBack = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.8 });
  const boardMats = [boardBack, boardBack, boardBack, boardBack, logoMat, boardBack];
  const boardSpots = [];
  // (none on the inside along the pit lane, which runs beside the inner wall)
  for (const s of [-1, 1]) pts.forEach((p, i) => { if (i % 18 === 9 && !(s > 0 && p.s > pit.entry && p.s < pit.exit)) boardSpots.push([p, s]); });
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 1, 0.12), boardMats, boardSpots.length);
  const dummy = new THREE.Object3D();
  boardSpots.forEach(([p, s], i) => {
    const off = s * (half + 10.5);
    dummy.position.set(p.x + p.nx * off, 0.75, -(p.y + p.ny * off));
    dummy.lookAt(p.x, 0.75, -p.y); dummy.updateMatrix(); boards.setMatrixAt(i, dummy.matrix);
  });
  boards.castShadow = true; world.add(boards);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth + 4.5, (roadWidth + 4.5) / 8), logoMat);
    panel.rotation.y = -side * Math.PI / 2; panel.position.set(-6 + side * 0.42, 8.6, radius); world.add(panel);
  }
  const fasciaMat = new THREE.MeshStandardMaterial({ map: logo(1024, 128, true, 4), roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.08 });
  fasciaMat.emissiveMap = fasciaMat.map;
  for (const x of [-140, 0, 140]) {
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(114, 3.5), fasciaMat);
    fascia.rotation.y = Math.PI; fascia.position.set(x, 13.4, radius + half + 14.9); world.add(fascia);
  }
  const infield = new THREE.Mesh(new THREE.PlaneGeometry(160, 20),
    new THREE.MeshStandardMaterial({ map: logo(2048, 256, false), transparent: true, depthWrite: false, roughness: 0.9 }));
  infield.rotation.x = -Math.PI / 2; infield.position.y = 0.02; world.add(infield);

  // Distant wooded hills so the horizon is not a flat edge.
  const hillGeo = new THREE.BufferGeometry(), hp = [], hc = [], hi = [], A = 160, R = 7;
  const forest = new THREE.Color(0x2c4a2a), meadow = new THREE.Color(0x5d7a3e);
  for (let a = 0; a <= A; a++) for (let r = 0; r < R; r++) {
    const th = a / A * Math.PI * 2, rr = 680 + r * 70;
    const h = (38 + 26 * Math.sin(th * 3 + 1) + 18 * Math.sin(th * 7 + 2) + 9 * Math.sin(th * 17)) * Math.pow(r / (R - 1), 0.7);
    hp.push(Math.cos(th) * rr, h - 1, Math.sin(th) * rr);
    const c = meadow.clone().lerp(forest, Math.min(1, r / 2 + 0.2 * Math.sin(th * 23))); hc.push(c.r, c.g, c.b);
    if (a && r) { const k = a * R + r, j = k - R; hi.push(j - 1, k - 1, j, j, k - 1, k); }
  }
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
  hillGeo.setIndex(hi); hillGeo.computeVertexNormals();
  world.add(new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));

  // Trees: two species (conifer, broadleaf) built from jittered low-poly parts, planted in clusters.
  const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const spots = [];
  const clear = (x, y) => {
    const d = Math.abs(Math.hypot(x - Math.max(-halfStraight, Math.min(halfStraight, x)), y) - radius);
    return d > half + 20 && !(y < -radius - half - 8 && y > -radius - 62 && Math.abs(x) < 215) && !(Math.abs(x) < 90 && Math.abs(y) < 16);
  };
  while (spots.length < 420) {
    const cx = (rng() - 0.5) * 1100, cy = (rng() - 0.5) * 760, n = 3 + Math.floor(rng() * 9);
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 40, y = cy + (rng() - 0.5) * 40;
      if (clear(x, y)) spots.push([x, y, 0.75 + rng() * 0.6, rng() * Math.PI * 2, rng()]);
    }
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const species = [treeGeometry('conifer'), treeGeometry('broadleaf')].map((geo, k) => {
    const list = spots.filter(t => (t[4] < 0.45) === (k === 0));
    const mesh = new THREE.InstancedMesh(geo, treeMat, list.length);
    list.forEach(([x, y, sc, rot, v], i) => {
      dummy.position.set(x, 0, -y); dummy.rotation.set(0, rot, 0); dummy.scale.set(sc, sc * (0.85 + v * 0.3), sc);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      const tint = 0.8 + rng() * 0.35; mesh.setColorAt(i, new THREE.Color(tint * (0.95 + rng() * 0.15), tint, tint * (0.85 + rng() * 0.15)));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  });
  world.add(...species);
  return world;
}

// Scenery for a real circuit (circuit.mjs track): road, white edge lines,
// kerbs only where the track flags them, runoff, walls and catch fence at
// wallOffset (left out where another part of the circuit runs closer), a
// start/finish line and light gantry at s = 0, a grandstand beside it,
// hoardings, trees off the circuit and a hill ring sized to the layout (with
// elevation: everything on the ground's height, and terrain with the lake
// instead of the hill ring and flat field, buildTerrain). scenery
// (scenery.mjs): the ground's colours, the trees and the sea, if any.
export function buildCircuitWorld(track, { boxColors = [], scenery = DEFAULT_SCENERY } = {}) {
  const world = new THREE.Group(), half = track.roadWidth / 2, wallAt = track.wallOffset;
  const { x: X, y: Y, s: S, heading: H, kerb } = track.samples, n = X.length;
  // Ground height (circuit.mjs elevation; offsets there are + right, here + left).
  const ground = (s, left = 0) => track.elevation(s, -left);
  const pts = Array.from({ length: n + 1 }, (_, k) => { const i = k % n; return { x: X[i], y: Y[i], nx: -Math.sin(H[i]), ny: Math.cos(H[i]), s: k < n ? S[i] : track.length, i, h: o => ground(S[i], o) }; });
  // Consecutive runs of samples meeting a predicate (each run shares its end point).
  const runs = keep => { const out = []; let cur = null; for (const p of pts) { if (keep(p)) (cur ??= (out.push([]), out.at(-1))).push(p); else cur = null; } return out.filter(r => r.length > 1); };
  const std = (o) => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...o });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, Y[i]); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, extent = Math.hypot(maxX - minX, maxY - minY) / 2;

  const skyR = extent + 1500, sky = new THREE.SphereGeometry(skyR, 32, 16), col = [];
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const t = Math.max(0, sky.attributes.position.getY(i) / skyR);
    const c = new THREE.Color(0xdfe9f1).lerp(new THREE.Color(0x3d78b8), Math.pow(t, 0.6)); col.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyMesh.position.set(cx, 0, -cy);
  // With the lake: the RISE sim's day sky, sun disc and clouds (sky.mjs).
  if (track.lakeLevel !== null) { sky.dispose(); skyMesh.material.dispose(); world.add(buildSky(skyR, cx, -cy)); } else world.add(skyMesh);
  const size = 2 * extent + 1200;
  const grass = texture(256, (g, s) => {
    noise(g, s, '#3f6b2e', 0.25, 9000);
    for (let i = 0; i < s; i += 64) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, i, s, 32); }
  }, size / 8, size / 8);
  // With elevation: terrain shaped around the road and the lake beside it
  // (terrainHeight); otherwise a flat field.
  const terrainHeight = track.hasElevation ? buildTerrain(world, track, { cx, cy, extent, minX, maxX, minY, maxY }, scenery) : () => 0;
  if (!track.hasElevation) {
    const field = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.set(cx, -0.03, -cy); field.receiveShadow = true; world.add(field);
  }
  // A flat mark lying on the road surface at lap progress s, `off` m to the
  // right, `lift` m above it (+x along the track, +z to the right).
  const basis = new THREE.Matrix4(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  const onRoad = (mesh, s, off, lift) => {
    const h = track.heading(s), [x, y] = track.point(s, off), e = track.elevation(s, off), g = new THREE.Group();
    ax.set(Math.cos(h), (track.elevation(s + 1, off) - track.elevation(s - 1, off)) / 2, -Math.sin(h)).normalize();
    az.set(Math.sin(h), track.elevation(s, off + 0.5) - track.elevation(s, off - 0.5), Math.cos(h)).normalize();
    ay.crossVectors(az, ax).normalize(); az.crossVectors(ax, ay);
    g.quaternion.setFromRotationMatrix(basis.makeBasis(ax, ay, az)); g.position.set(x, e, -y).addScaledVector(ay, lift);
    mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true; g.add(mesh); world.add(g);
  };
  // Barriers reach below ground on hills so the terrain never shows under them.
  const footing = track.hasElevation ? -0.6 : 0;

  const kerbTex = texture(64, (g, s) => { g.fillStyle = '#d8dad6'; g.fillRect(0, 0, s, s); g.fillStyle = '#c3302b'; g.fillRect(0, 0, s, s / 2); });
  const wallTex = texture(128, (g, s) => {
    g.fillStyle = '#c9ccc8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#13263a'; g.fillRect(0, 0, s, s * 0.55);
    g.fillStyle = '#6fffc3'; g.fillRect(0, s * 0.55, s, s * 0.05);
  });
  const runoffTex = texture(256, (g, s) => noise(g, s, '#8b8170', 0.3, 20000), 4, 1);
  // RISE Motordrome (RISE js/trackmesh.js): run-off painted in 1.3 m bands
  // from the kerb out (olive, yellow, terracotta, green, blue) then sand, and
  // TecPro red/white blocks (1.5 m) on the outside walls of tight corners.
  const rise = track.lakeLevel !== null;
  const riseRunoffTex = rise && texture(256, (g, s) => {
    noise(g, s, '#9a8d75', 0.3, 20000);
    ['#4d4a24', '#c79a10', '#801c14', '#0a5445', '#00529a'].forEach((c, k) => { g.fillStyle = c; g.fillRect(s * k * 1.3 / 6.8, 0, s * 1.3 / 6.8 + 1, s); });
  }, 1, 4);
  const tecproTex = rise && texture(64, (g, s) => { g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, s, s); g.fillStyle = '#8c0a0a'; g.fillRect(0, 0, s, s / 2); });
  // Curvature over ±8 m (+ left), so a corner's outside is the side where side × k < 0.
  const bend = i => { let k = 0; for (let d = -4; d <= 4; d++) k += track.samples.curvature[(i + d + n) % n]; return k / 9; };
  const meshTex = texture(64, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#b9c0c4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
  }, 20, 1);
  const fenceMat = new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.7, roughness: 0.4 });
  world.add(ribbon(pts, -half, half, 0, asphaltMaterial(track.roadWidth), 30));
  const postSpots = [];
  for (const side of [-1, 1]) {
    world.add(ribbon(pts, side * (half - 0.45), side * (half - 0.2), 0.008, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
    for (const r of runs(p => kerb[p.i])) world.add(ribbon(r, side * half, side * (half + 1.2), 0.012, std({ map: kerbTex, roughness: 0.7 }), 4));
    const runoff = ribbon(pts, side * (half + 1.2), side * (half + 8), 0.004, std({ map: rise ? riseRunoffTex : runoffTex, roughness: rise ? 0.8 : 1 }), 20);
    if (rise) runoff.name = 'rise-runoff';
    world.add(runoff);
    // Barrier where its line is still nearest this part of the circuit.
    const clear = p => Math.abs(track.offset(p.x + p.nx * side * wallAt, p.y + p.ny * side * wallAt)) > wallAt - 1;
    for (const r of runs(clear)) {
      const w = ribbon(r, side * wallAt, 0, footing, std({ map: wallTex, roughness: 0.8 }), 6, 1.1); w.castShadow = true; world.add(w);
      world.add(ribbon(r, side * wallAt, 0, 1.1, fenceMat, 0.16, 4.2));
      r.forEach((p, k) => { if (k % 4 === 0) postSpots.push([p.x + p.nx * side * wallAt, p.y + p.ny * side * wallAt, p.h(side * wallAt)]); });
    }
    // TecPro facing just in front of the wall (no gaps where it starts and stops).
    if (rise) for (const r of runs(p => clear(p) && side * bend(p.i) < -1 / 70)) {
      const t = ribbon(r, side * (wallAt - 0.06), 0, footing, std({ map: tecproTex, roughness: 0.85 }), 3, 1.05);
      t.name = 'tecpro'; t.castShadow = true; world.add(t);
    }
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), steel, postSpots.length);
  postSpots.forEach(([x, y, h], i) => posts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, h + 2.1, -y)));
  world.add(posts);

  // Start/finish at s = 0 in a local frame: +x along the track, +z to the right
  // (standing on the lower of the gantry's two feet).
  const start = new THREE.Group(); start.position.set(X[0], Math.min(ground(0, half + 2), ground(0, -half - 2)), -Y[0]); start.rotation.y = H[0]; world.add(start);
  const chequer = texture(128, (g, s) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#eee'; g.fillRect(i * s / 8, j * s / 8, s / 8, s / 8); } }, 1, track.roadWidth / 2);
  onRoad(new THREE.Mesh(new THREE.PlaneGeometry(1.6, track.roadWidth), new THREE.MeshStandardMaterial({ map: chequer, roughness: 0.6 })), 0, 0, 0.014);
  for (const z of [-half - 2, half + 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); post.position.set(-6, 3.5, z); post.castShadow = true; start.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, track.roadWidth + 4.5), steel); beam.position.set(-6, 7, 0); beam.castShadow = true; start.add(beam);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0.6 }));
    l.rotation.y = -Math.PI / 2; l.position.set(-6.41, 7, -2 + i); start.add(l);
  }
  // Grandstand on whichever side of the straight before the line has room.
  const crowd = texture(512, (g, s) => {
    g.fillStyle = '#2a3440'; g.fillRect(0, 0, s, s);
    const seat = s / 16;
    for (let i = 0; i < 16; i++) {
      const x = i * seat;
      g.fillStyle = '#1d5f8c'; g.fillRect(x + 2, s * 0.55, seat - 4, s * 0.45);
      if (Math.random() < 0.12) continue;
      g.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${30 + Math.random() * 40}%)`;
      g.fillRect(x + seat * 0.18, s * 0.38, seat * 0.64, s * 0.62);
      g.fillStyle = `hsl(${20 + Math.random() * 15},${30 + Math.random() * 30}%,${35 + Math.random() * 40}%)`;
      g.beginPath(); g.arc(x + seat / 2, s * 0.26, seat * 0.26, 0, Math.PI * 2); g.fill();
    }
  }, 110 / 8, 1);
  const concrete = new THREE.MeshStandardMaterial({ map: texture(128, (g, s) => noise(g, s, '#a7aaa6', 0.18, 3000), 4, 2), roughness: 0.95 });
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const stepMats = [concrete, concrete, crowdMat, concrete, concrete, crowdMat];
  const room = side => [-120, -60, 0].every(d => { const [x, y] = track.point(d, side * (wallAt + 20)); return Math.abs(track.offset(x, y)) > wallAt + 10; });
  // Across the straight from the pit lane where there is room for it.
  const pit = track.pit, standSide = [pit ? pit.side : -1, pit ? -pit.side : 1].find(room) ?? 0;
  if (standSide && !track.hasElevation) {
    const z0 = wallAt + 6, stand = new THREE.Group(); world.add(stand);
    // Pitched to the straight's grade over its length (s = -120 to 0).
    stand.position.set(X[0], ground(0, -standSide * (z0 + 8)) - 0.3, -Y[0]);
    stand.rotation.set(0, H[0], Math.atan((ground(0, -standSide * (z0 + 8)) - ground(-120, -standSide * (z0 + 8))) / 120));
    for (let r = 0; r < 8; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 2), stepMats); step.castShadow = step.receiveShadow = true;
      step.position.set(-60, 0.6 + r * 1.2, standSide * (z0 + r * 2)); stand.add(step);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(111.2, 14, 0.6), concrete); back.position.set(-60, 7, standSide * (z0 + 16)); back.castShadow = true; stand.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(114, 0.4, 20), std({ color: 0xe6e9ec, roughness: 0.5 })); roof.position.set(-60, 14.2, standSide * (z0 + 7)); roof.castShadow = true; stand.add(roof);
    for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, 14, 0.35), steel); c.position.set(-114.4 + i * 18.13, 7, standSide * (z0 - 1.6)); stand.add(c); }
  }

  // Pit lane (circuit.mjs layout; pit-frame offsets are negative towards the
  // pits, centreline offset = side × that): asphalt from the road edge out to
  // the apron's far side between entry and exit, a white line along the fast
  // lane's inner edge, the speed-limit lines, the box marks (the field's
  // boxes, the player's first) and a garage behind the wall at each box.
  if (pit) {
    const strip = (a, b) => Array.from({ length: Math.round((b - a) / 2) + 1 }, (_, k) => {
      const s = a + (b - a) * k / Math.round((b - a) / 2), [x, y] = track.point(s), h = track.heading(s);
      return { x, y, nx: -Math.sin(h), ny: Math.cos(h), s: s - a, h: o => ground(s, o) };
    });
    // Ribbon offsets are positive to the left: centreline offset −(side × f).
    const r = f => -pit.side * f;
    world.add(ribbon(strip(pit.entry, pit.exit), r(-half), r(-pit.outer), 0.006, asphaltMaterial(Math.abs(pit.outer - half)), 30));
    world.add(ribbon(strip(pit.limitStart, pit.limitEnd), r(-pit.inner), r(-pit.inner - 0.25), 0.009, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
    const flat = (s, f, length, width, color, y = 0.01) => onRoad(new THREE.Mesh(new THREE.PlaneGeometry(length, width), std({ color, roughness: 0.6 })), s, pit.side * f, y);
    for (const s of [pit.limitStart, pit.limitEnd]) flat(s, -(pit.inner + pit.outer) / 2, 0.4, pit.outer - pit.inner, 0xf2f2ee);
    const garageAt = -(wallAt + 4.5), concreteGarage = std({ color: 0xd9dcd6, roughness: 0.7 });
    for (let i = 0; i < Math.max(boxColors.length, 5); i++) {
      const s = pit.boxStart + pit.boxSpacing * i;
      flat(s, pit.boxOffset, 7, 3, 0xf2f2ee); flat(s, pit.boxOffset, 6.6, 2.6, boxColors[i] ?? 0x3a4450, 0.012);
      const [x, y] = track.point(s, pit.side * garageAt);
      if (track.hasElevation || standSide === -pit.side || Math.abs(track.offset(x, y)) < wallAt + 3) continue;
      const g = new THREE.Mesh(new THREE.BoxGeometry(pit.boxSpacing - 0.5, 6, 7), concreteGarage);
      g.position.set(x, track.elevation(s, pit.side * garageAt) + 2.8, -y); g.rotation.y = track.heading(s); g.castShadow = g.receiveShadow = true; world.add(g);
    }
  }

  // Hoardings every ~36 m both sides, facing the track (none along the pit lane).
  const logo = (w, h) => { const t = texture(1, () => {}); const cv = t.image; cv.width = w; cv.height = h; drawLogo(cv.getContext('2d'), w, h, true); t.needsUpdate = true; return t; };
  const logoMat = new THREE.MeshStandardMaterial({ map: logo(1024, 128), roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0.08 });
  logoMat.emissiveMap = logoMat.map;
  // With terrain: the RISE sim's membrane-roofed grandstands across from the
  // pits and its pit building (with our branding) instead of the garages.
  if (track.hasElevation) buildRiseStands(world, track, { ground: terrainHeight, standSide, pitBoxes: pit && standSide !== -pit.side ? Math.max(boxColors.length, 5) : 0, logoMat });
  // AgentiLoop Racing panels on both faces of the start-light gantry, as on the stadium track.
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(track.roadWidth + 4.5, (track.roadWidth + 4.5) / 8), logoMat);
    panel.rotation.y = -side * Math.PI / 2; panel.position.set(-6 + side * 0.42, 8.6, 0); start.add(panel);
  }
  const boardBack = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.8 });
  const boardSpots = [];
  for (const side of [-1, 1]) pts.forEach((p, k) => {
    if (k % 18 !== 9 || k === n) return;
    const off = side * (half + 10.5);
    const s = p.s > track.length / 2 ? p.s - track.length : p.s;
    if (pit && Math.sign(off) === pit.side && s > pit.entry - 10 && s < pit.exit + 10) return;
    if (Math.abs(track.offset(p.x + p.nx * off, p.y + p.ny * off)) > half + 10) boardSpots.push([p, off]);
  });
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 1, 0.12), [boardBack, boardBack, boardBack, boardBack, logoMat, boardBack], boardSpots.length);
  const dummy = new THREE.Object3D();
  boardSpots.forEach(([p, off], i) => {
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    // Keep the face toward the road, but pitch its eight-metre span to the ground.
    az.set(-p.nx * Math.sign(off), 0, p.ny * Math.sign(off));
    ax.set(az.z, 0, -az.x);
    ax.y = (track.heightAt(x + ax.x * 4, y - ax.z * 4) - track.heightAt(x - ax.x * 4, y + ax.z * 4)) / 8;
    ax.normalize(); ay.crossVectors(az, ax).normalize();
    dummy.position.set(x, track.heightAt(x, y) + 0.75, -y);
    dummy.quaternion.setFromRotationMatrix(basis.makeBasis(ax, ay, az));
    dummy.updateMatrix(); boards.setMatrixAt(i, dummy.matrix);
  });
  boards.castShadow = true; world.add(boards);

  // Hill ring beyond the circuit (the terrain has its own hills).
  const hillGeo = new THREE.BufferGeometry(), hp = [], hc = [], hi = [], A = 160, R = 7, r0 = extent + 450;
  const forest = new THREE.Color(0x2c4a2a), meadow = new THREE.Color(0x5d7a3e);
  for (let a = 0; a <= A; a++) for (let r = 0; r < R; r++) {
    const th = a / A * Math.PI * 2, rr = r0 + r * 90;
    const h = (45 + 30 * Math.sin(th * 3 + 1) + 20 * Math.sin(th * 7 + 2) + 10 * Math.sin(th * 17)) * Math.pow(r / (R - 1), 0.7);
    hp.push(cx + Math.cos(th) * rr, h - 1, -cy + Math.sin(th) * rr);
    const c = meadow.clone().lerp(forest, Math.min(1, r / 2 + 0.2 * Math.sin(th * 23))); hc.push(c.r, c.g, c.b);
    if (a && r) { const k = a * R + r, j = k - R; hi.push(j - 1, k - 1, j, j, k - 1, k); }
  }
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3));
  hillGeo.setIndex(hi); hillGeo.computeVertexNormals();
  if (!track.hasElevation) world.add(new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));

  // Beside the lake (the RISE Motordrome): East African vegetation
  // (savanna.mjs); otherwise scenery.clusters tree clusters of the circuit's
  // kinds anywhere at least 20 m clear of the road and off the beach, on the
  // terrain when there is one.
  if (track.lakeLevel !== null) {
    const terrain = { height: terrainHeight, dist: terrainHeight.dist, lake: terrainHeight.lake, lakeLevel: track.lakeLevel };
    const box = { minX, maxX, minY, maxY }, plan = savannaPlan(track, terrain, box);
    // With the lake: the RISE sim's wildlife in glades kept clear of trees.
    const herds = track.lakeLevel !== null ? wildlifePlan(track, terrain, box) : null;
    if (herds) for (const k in plan) plan[k] = plan[k].filter(([x, y]) => !herds.glade(x, y));
    // With the lake: the RISE sim's footbridges, floodlights, paddock and villages, trees kept out of them.
    const builds = track.lakeLevel !== null ? structuresPlan(track, terrain) : null;
    if (builds) { for (const k in plan) plan[k] = plan[k].filter(([x, y]) => builds.clear(x, y)); buildStructures(world, track, builds, { ground: terrainHeight, bannerMat: logoMat }); }
    // With the lake: the RISE sim's hospitality pods and jetties on the shore (lakeside.mjs).
    const shore = track.lakeLevel !== null ? lakesidePlan(terrain) : null;
    if (shore) { for (const k in plan) plan[k] = plan[k].filter(([x, y]) => shore.clear(x, y)); buildLakeside(world, shore, terrain); }
    const wildlife = herds ? buildWildlife(world, herds, terrain) : null;
    world.userData = { center: [cx, cy], extent, trees: buildSavanna(world, plan, terrain), wildlife: wildlife?.counts, update: wildlife?.update };
    return world;
  }
  const rng = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const beach = terrainHeight.sea ?? (() => -Infinity), shore = terrainHeight.water ?? (() => Infinity);
  // Town blocks (scenery.buildings): flat-roofed boxes of the given heights
  // facing the nearest road, from `near` m (default 4) out to `far` m beyond
  // the barriers, off the beach, standing on their lowest ground.
  const blocks = [];
  if (scenery.buildings) {
    const { count, near: from = 4, far, low, high } = scenery.buildings;
    for (let tries = 0; blocks.length < count && tries < count * 30; tries++) {
      const x = cx + (rng() - 0.5) * (maxX - minX + 2 * far), y = cy + (rng() - 0.5) * (maxY - minY + 2 * far);
      const w = 12 + rng() * 18, d = 10 + rng() * 14, r = Math.hypot(w, d) / 2, o = Math.abs(track.offset(x, y));
      if (o < wallAt + from + r || o > wallAt + far || beach(x, y) > -r - 10 || shore(x, y) < r + 6 || blocks.some(b => Math.hypot(b.x - x, b.y - y) < b.r + r + 3)) continue;
      const near = track.progress(x, y), hd = track.heading(near), sp = near > track.length / 2 ? near - track.length : near;
      // Not over the grandstand and garages (the straight before the line, the pit lane).
      if ((sp > -140 && sp < 20) || (pit && sp > pit.entry - 20 && sp < pit.exit + 20)) continue;
      let base = Infinity;
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) base = Math.min(base, terrainHeight(x + u * r * 0.7, y + v * r * 0.7));
      blocks.push({ x, y, r, w, d, hd, base, h: low + Math.pow(rng(), 1.6) * (high - low), tone: rng() });
    }
    const facade = texture(128, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#5b6670';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(i * s / 4 + s / 16, j * s / 4 + s / 12, s / 8, s / 7);
    });
    const town = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 }), Math.max(1, blocks.length));
    const shades = [0xe9dcc3, 0xf1e6d2, 0xd9b48f, 0xe6c9a8, 0xf4f1ea, 0xc9a98a, 0xe8d6b0];
    blocks.forEach((b, i) => {
      dummy.position.set(b.x, b.base - 3, -b.y); dummy.rotation.set(0, b.hd, 0); dummy.scale.set(b.w, b.h + 3, b.d);
      dummy.updateMatrix(); town.setMatrixAt(i, dummy.matrix); town.setColorAt(i, new THREE.Color(shades[Math.floor(b.tone * shades.length)]));
    });
    town.count = blocks.length; town.castShadow = town.receiveShadow = true; town.userData.kind = 'buildings'; world.add(town);
  }
  const spots = [];
  for (let tries = 0; spots.length < scenery.clusters * 3 && tries < scenery.clusters * 2; tries++) {
    const tx = cx + (rng() - 0.5) * (maxX - minX + 300), ty = cy + (rng() - 0.5) * (maxY - minY + 300), m = 3 + Math.floor(rng() * 9);
    for (let i = 0; i < m; i++) {
      const x = tx + (rng() - 0.5) * 40, y = ty + (rng() - 0.5) * 40;
      if (Math.abs(track.offset(x, y)) > half + 20 && beach(x, y) < -40 && shore(x, y) > 5 && !blocks.some(b => Math.hypot(b.x - x, b.y - y) < b.r + 4)) spots.push([x, y, 0.75 + rng() * 0.6, rng() * Math.PI * 2, rng()]);
    }
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  // Each spot's kind from its random draw t[4] against the cumulative weights.
  const kinds = ['conifer', 'broadleaf', 'palm'], weight = kinds.map(k => scenery.trees[k] ?? 0), sum = weight.reduce((a, b) => a + b, 0) || 1;
  const kindOf = v => { let acc = 0; for (let k = 0; k < kinds.length; k++) if (v < (acc += weight[k] / sum)) return k; return kinds.length - 1; };
  world.add(...kinds.map((kind, k) => [treeGeometry(kind), spots.filter(t => kindOf(t[4]) === k)]).filter(([, list]) => list.length).map(([geo, list]) => {
    const mesh = new THREE.InstancedMesh(geo, treeMat, list.length);
    list.forEach(([x, y, sc, rot, v], i) => {
      dummy.position.set(x, terrainHeight(x, y) - 0.2, -y); dummy.rotation.set(0, rot, 0); dummy.scale.set(sc, sc * (0.85 + v * 0.3), sc);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      const tint = 0.8 + rng() * 0.35; mesh.setColorAt(i, new THREE.Color(tint * (0.95 + rng() * 0.15), tint, tint * (0.85 + rng() * 0.15)));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }));
  world.userData = { center: [cx, cy], extent };
  return world;
}

// Terrain for a circuit with elevation, after the RISE Motordrome sim's: the
// ground follows the road out past the barriers, eases into rolling country
// that rises to hills towards the horizon, and dips into the lake. The lake
// outline is that sim's (js/terrain.js LAKE_BLOBS: discs [x, z, radius] in
// world metres, x east, z south, joined by a smooth union) with a ragged
// shore of our own; its banks ease down to the water over about 140 m.
const LAKE_BLOBS = [
  [-470, -60, 125], [-560, -40, 150], [-780, -100, 300], [-1100, 200, 420], [-1250, -350, 380],
  [-900, 520, 230], [-1500, 100, 500], [-650, -300, 150], [-1700, -600, 520], [-1450, 700, 380],
];
// Signed distance (m) from the lake shore at world (x, z), negative on the water.
export function lakeSdf(x, z) {
  let res = 1e9;
  for (const [bx, bz, r] of LAKE_BLOBS) {
    const d = Math.hypot(x - bx, z - bz) - r, h = Math.max(0, Math.min(1, 0.5 + 0.5 * (d - res) / 90));
    res = d + (res - d) * h - 90 * h * (1 - h);
  }
  return res + 30 * Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011 - 0.4) + 15 * Math.sin((x - z) * 0.027);
}
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Adds the terrain (and the lake, when the track has one, or the real sea
// of scenery.sea (coast.mjs), 3 m below the circuit's lowest point, with a
// beach) to world and returns the ground height at physics (x, y).
function buildTerrain(world, track, { cx, cy, extent, minX, maxX, minY, maxY }, scenery = DEFAULT_SCENERY) {
  const wallAt = track.wallOffset, lake = track.lakeLevel, { x: X, y: Y, s: S } = track.samples, n = X.length;
  const R = extent + 1400, sea = scenery.sea ? waterField(scenery.sea) : null;
  let seaLevel = null, seaSide = null;
  if (sea) {
    seaLevel = Infinity; for (let k = 0; k < n; k++) seaLevel = Math.min(seaLevel, track.elevation(S[k])); seaLevel -= 3;
    // How far (m) a point is out to sea from the shore (negative inland):
    // exact from 220 m inland to 60 m out, elsewhere from a 40 m grid
    // (within 57 m of the truth, so it only sets how deep the sea floor is).
    const G = 40, gx = cx - R - G, gy = cy - R - G, GN = Math.ceil((2 * R + 2 * G) / G) + 1, coarse = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) coarse[j * GN + i] = -sea.sd(gx + i * G, gy + j * G, Infinity);
    seaSide = (x, y) => {
      const u = Math.min(GN - 1.001, Math.max(0, (x - gx) / G)), v = Math.min(GN - 1.001, Math.max(0, (y - gy) / G)), i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * GN + i;
      const o = (coarse[k] * (1 - a) + coarse[k + 1] * a) * (1 - b) + (coarse[k + GN] * (1 - a) + coarse[k + GN + 1] * a) * b;
      return o > -220 && o < 60 ? -sea.sd(x, y, Infinity) : o;
    };
  }
  const water = lake ?? seaLevel;
  // Coarse fields every 25 m out to 900 m beyond the circuit: the nearest
  // centreline sample (of every 5th), the distance to it and the road height
  // there (blurred, so there is no seam where the nearest part changes).
  const C = 25, x0 = minX - 900, y0 = minY - 900, NX = Math.ceil((maxX - minX + 1800) / C) + 1, NY = Math.ceil((maxY - minY + 1800) / C) + 1;
  const near = new Int32Array(NX * NY), dist = new Float32Array(NX * NY), base = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = x0 + i * C, y = y0 + j * C; let bd = Infinity, bk = 0;
    for (let k = 0; k < n; k += 5) { const d = (X[k] - x) ** 2 + (Y[k] - y) ** 2; if (d < bd) { bd = d; bk = k; } }
    near[j * NX + i] = bk; dist[j * NX + i] = Math.sqrt(bd); base[j * NX + i] = track.elevation(S[bk]);
  }
  for (let pass = 0; pass < 6; pass++) {
    const b = base.slice(), at = (i, j) => b[Math.min(NY - 1, Math.max(0, j)) * NX + Math.min(NX - 1, Math.max(0, i))];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) base[j * NX + i] = 0.5 * at(i, j) + 0.125 * (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1));
  }
  const cellUV = (x, y) => [Math.min(NX - 1.001, Math.max(0, (x - x0) / C)), Math.min(NY - 1.001, Math.max(0, (y - y0) / C))];
  const bilinear = (f, x, y) => {
    const [u, v] = cellUV(x, y), i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * NX + i;
    return (f[k] * (1 - a) + f[k + 1] * a) * (1 - b) + (f[k + NX] * (1 - a) + f[k + NX + 1] * a) * b;
  };
  // Away from the road: the road's height fading out over 150-700 m, rolling
  // ground, hills rising towards the horizon, and the lake.
  const far = (x, y) => {
    const d = bilinear(dist, x, y), r = Math.hypot(x - cx, y - cy), th = Math.atan2(y - cy, x - cx);
    let h = bilinear(base, x, y) * (1 - smooth(150, 700, d))
      + (3 * Math.sin(x * 0.011 + 0.7) * Math.cos(y * 0.013) + 1.5 * Math.sin(x * 0.029 + y * 0.021)) * smooth(40, 200, d)
      + Math.max(0, 45 + 30 * Math.sin(th * 3 + 1) + 20 * Math.sin(th * 7 + 2) + 10 * Math.sin(th * 17)) * smooth(extent * 0.9, extent + 1100, r);
    if (lake !== null) {
      const sdf = lakeSdf(x, -y);
      h += (lake + 1.4 + Math.max(0, sdf) * 0.06 - h) * smooth(140, 0, sdf) * 0.85;
      if (sdf < 0) h = Math.min(h, lake - 0.6 + Math.max(sdf * 0.05, -8));
    }
    if (sea) {
      const o = seaSide(x, y);
      h += (seaLevel + 1.2 + Math.max(0, -o) * 0.02 - h) * smooth(-160, 0, o);
      if (o > 0) h = Math.min(h, seaLevel - 0.6 - Math.min(o * 0.05, 10));
    }
    return h;
  };
  // Near the road: 0.25 m under the road surface and its verges (circuit.mjs
  // elevation at the nearest centreline point, found around the coarse one),
  // blending into the far ground 4-150 m beyond the barriers. Also returns
  // the distance d to the centreline (Infinity beyond 160 m past the barriers).
  const land = (x, y) => {
    const [u, v] = cellUV(x, y);
    if (bilinear(dist, x, y) > wallAt + 160) return { h: far(x, y), d: Infinity };
    const i0 = near[Math.round(v) * NX + Math.round(u)];
    let best = null;
    for (let k = i0 - 40; k <= i0 + 40; k++) {
      const i = (k + n) % n, j = (i + 1) % n, dx = X[j] - X[i], dy = Y[j] - Y[i];
      const f = Math.max(0, Math.min(1, ((x - X[i]) * dx + (y - Y[i]) * dy) / (dx * dx + dy * dy))), d = Math.hypot(x - X[i] - dx * f, y - Y[i] - dy * f);
      if (!best || d < best.d) best = { d, s: S[i] + (S[i + 1] - S[i]) * f, right: dx * (y - Y[i]) - dy * (x - X[i]) < 0 };
    }
    const w = smooth(wallAt + 4, wallAt + 150, best.d), road = track.elevation(best.s, best.right ? best.d : -best.d) - 0.25;
    return { h: w >= 1 ? far(x, y) : road + (far(x, y) - road) * w, d: best.d };
  };
  // Real water (scenery.water, water.mjs): each polygon's surface 0.6 m below
  // the lowest ground on its shore; the ground dips under it and its banks
  // ease down to the shore over 40 m, never within 2 m of the barriers and
  // fully from 14 m beyond them, so the road and its verges keep their heights.
  const wf = waterField(scenery.water);
  const levels = wf.list.map(p => { let lo = Infinity; for (const r of p.rings) for (const [x, y] of r) lo = Math.min(lo, land(x, y).h); return lo - 0.6; });
  const height = (x, y) => {
    let { h, d } = land(x, y);
    for (let k = 0; k < wf.list.length; k++) {
      const p = wf.list[k], [x0, y0, x1, y1] = p.box;
      if (x < x0 - 40 || x > x1 + 40 || y < y0 - 40 || y > y1 + 40) continue;
      const sd = wf.sdOf(p, x, y);
      if (sd >= 40) continue;
      const target = sd < 0 ? levels[k] - 0.5 - Math.min(-sd * 0.06, 4) : levels[k] + 0.6 + sd * 0.05;
      if (target < h) h += (target - h) * smooth(wallAt + 2, wallAt + 14, d) * (sd < 0 ? 1 : smooth(40, 0, sd));
    }
    // The same for the sea (Port Hercule, Yas Marina, the Corniche come
    // right up to the barriers): quays drop to it over 40 m.
    const o = seaSide ? seaSide(x, y) : -Infinity;
    if (o > -40) {
      const target = o > 0 ? seaLevel - 0.6 - Math.min(o * 0.05, 10) : seaLevel + 1.2 - o * 0.05;
      if (target < h) h += (target - h) * smooth(wallAt + 2, wallAt + 14, d) * (o > 0 ? 1 : smooth(-40, 0, o));
    }
    return h;
  };
  // Grid: 6 m spacing over the circuit and 200 m around it, each step 12%
  // longer beyond, out to 1400 m past the circuit's extent.
  const axis = (lo, hi, from, to) => {
    const v = []; for (let a = lo; a <= hi; a += 6) v.push(a);
    for (let a = lo, st = 6; a > from;) { st *= 1.12; a = Math.max(a - st, from); v.unshift(a); }
    for (let a = v.at(-1), st = 6; a < to;) { st *= 1.12; a = Math.min(a + st, to); v.push(a); }
    return v;
  };
  const ax = axis(minX - 200, maxX + 200, cx - R, cx + R), ay = axis(minY - 200, maxY + 200, cy - R, cy + R);
  const W = ax.length, N = W * ay.length, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), idx = [];
  ay.forEach((y, j) => ax.forEach((x, i) => {
    const k = j * W + i; pos.set([x, height(x, y), -y], k * 3); uv.set([x / 6, y / 6], k * 2);
    if (i && j) idx.push(k - W - 1, k - W, k - 1, k - W, k, k - 1);
  }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // Colours (scenery.ground): grass patched with dry grass, bare soil where
  // the ground is steep (red laterite by the lake), sand along the shore and
  // mud under the water.
  const { ground: tone } = scenery;
  const grass = new THREE.Color(tone.grass), dry = new THREE.Color(tone.dry), laterite = new THREE.Color(lake !== null ? 0xa4532e : tone.soil), sand = new THREE.Color(0xb9a57a), mud = new THREE.Color(0x5b5040);
  const col = new Float32Array(N * 3), c = new THREE.Color(), nrm = geo.attributes.normal;
  for (let k = 0; k < N; k++) {
    const x = pos[3 * k], h = pos[3 * k + 1], z = pos[3 * k + 2];
    c.copy(grass).lerp(dry, smooth(-0.2, 0.8, Math.sin(x * 0.0041 + 1.7) * Math.cos(z * 0.0053 - 0.6) + 0.3 * Math.sin((x + z) * 0.017)));
    c.lerp(laterite, smooth(0.06, 0.2, 1 - nrm.getY(k)));
    if (water !== null) c.lerp(sand, smooth(water + 3.5, water + 1, h)).lerp(mud, smooth(water, water - 1.5, h));
    if (wf.list.length) { const sd = wf.sd(x, -z, 8); if (sd < 8) c.lerp(sand, smooth(6, 1, sd) * 0.7).lerp(mud, smooth(0, -2, sd)); }
    col.set([c.r, c.g, c.b], 3 * k);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = texture(256, (g, s) => noise(g, s, '#d4d4d4', 0.45, 14000));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: detail, vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true; world.add(ground);
  // The real water's surfaces, islands cut out.
  const pondMat = new THREE.MeshStandardMaterial({ color: 0x2c5a6c, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.9 });
  wf.list.forEach((p, k) => {
    const shape = new THREE.Shape(p.rings[0].map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes = p.rings.slice(1).map(r => new THREE.Path(r.map(([x, y]) => new THREE.Vector2(x, y))));
    const pond = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), pondMat);
    pond.position.y = levels[k]; pond.receiveShadow = true; pond.userData.kind = 'water'; world.add(pond);
  });
  // Water over the lake's extent (the ground rises above it everywhere else):
  // the RISE sim's reflective lake and papyrus islands (lake.mjs).
  if (lake !== null) world.add(buildLake(LAKE_BLOBS, lake, lakeSdf));
  if (sea) {
    // The sea over its polygons (islands cut out); inland the ground stays
    // above it, and by the road the quays hide its edge.
    const seaMat = new THREE.MeshStandardMaterial({ color: 0x1f5b78, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.92 });
    for (const p of sea.list) {
      const shape = new THREE.Shape(p.rings[0].map(([x, y]) => new THREE.Vector2(x, y)));
      shape.holes = p.rings.slice(1).map(r => new THREE.Path(r.map(([x, y]) => new THREE.Vector2(x, y))));
      const seaMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), seaMat);
      seaMesh.position.y = seaLevel; seaMesh.userData.kind = 'sea'; world.add(seaMesh);
    }
  }
  // For the vegetation: coarse distance to the centreline, and the shore.
  height.dist = (x, y) => bilinear(dist, x, y);
  height.lake = lake !== null ? (x, y) => lakeSdf(x, -y) : null;
  height.sea = seaSide;
  height.water = wf.list.length ? wf.sd : null;
  return height;
}

// "AgentiLoop Racing" wordmark with a two-ring loop mark; transparent background when bg is false.
export function drawLogo(g, w, h, bg = true) {
  g.clearRect(0, 0, w, h);
  if (bg) {
    const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#13263a'); grad.addColorStop(1, '#08111b');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6fffc3'; g.fillRect(0, h * 0.9, w, h * 0.04);
  }
  g.font = `italic 800 ${h * 0.5}px system-ui, sans-serif`;
  const word = g.measureText('AgentiLoop').width;
  g.font = `italic 600 ${h * 0.3}px system-ui, sans-serif`;
  const racing = g.measureText('RACING').width + h * 0.3;
  const total = h * 1.25 + word + h * 0.25 + racing;
  let x = (w - total) / 2;
  const cy = h * 0.47, r = h * 0.2;
  const accent = g.createLinearGradient(x, 0, x + h * 1.1, 0); accent.addColorStop(0, '#6fffc3'); accent.addColorStop(1, '#3aa0ff');
  g.lineWidth = h * 0.09; g.strokeStyle = accent;
  g.beginPath(); g.arc(x + r + h * 0.05, cy, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x + r * 2.6 + h * 0.05, cy, r, 0, Math.PI * 2); g.stroke();
  x += h * 1.25;
  g.fillStyle = bg ? '#f2f7fb' : 'rgba(245,250,255,0.82)'; g.textBaseline = 'middle';
  g.font = `italic 800 ${h * 0.5}px system-ui, sans-serif`; g.fillText('AgentiLoop', x, cy);
  x += word + h * 0.25;
  g.fillStyle = bg ? '#6fffc3' : 'rgba(111,255,195,0.85)';
  g.font = `italic 600 ${h * 0.3}px system-ui, sans-serif`;
  if ('letterSpacing' in g) g.letterSpacing = `${h * 0.06}px`;
  g.fillText('RACING', x, cy + h * 0.04);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

// Deterministic per-position hash so seam vertices of a primitive stay welded after jitter.
const hash = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };

// One tree as a non-indexed geometry with baked vertex colors (darker toward the crown base).
function treeGeometry(kind) {
  const parts = [];
  const add = (geo, color, center, crown, jitter) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = hash(x, y, z) - 0.5;
      if (jitter) { const k = 1 + n * jitter; p.setXYZ(i, center.x + (x - center.x) * k, y + n * jitter * 0.6, center.z + (z - center.z) * k); }
    }
    geo.computeVertexNormals();
    const g = geo.toNonIndexed(), q = g.attributes.position, nr = g.attributes.normal, col = [];
    for (let i = 0; i < q.count; i++) {
      const y = q.getY(i);
      let shade = 1;
      if (crown) {
        shade = 0.5 + 0.55 * Math.min(1, Math.max(0, (y - crown[0]) / (crown[1] - crown[0])));
        const rx = q.getX(i) - center.x, ry = y - center.y, rz = q.getZ(i) - center.z, l = Math.hypot(rx, ry, rz) || 1;
        nr.setXYZ(i, nr.getX(i) * 0.4 + rx / l * 0.6, nr.getY(i) * 0.4 + ry / l * 0.6, nr.getZ(i) * 0.4 + rz / l * 0.6);
      }
      const v = 0.92 + 0.16 * hash(q.getX(i) * 3, y * 3, q.getZ(i) * 3);
      col.push(color.r * shade * v, color.g * shade * v, color.b * shade * v);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(g);
  };
  const bark = new THREE.Color(0x4a3527);
  if (kind === 'conifer') {
    add(new THREE.CylinderGeometry(0.16, 0.3, 4, 7).translate(0, 2, 0), bark);
    const green = new THREE.Color(0x1f4a2b), top = 12.5;
    for (let i = 0; i < 5; i++) {
      const r = 2.7 * (1 - i * 0.17), y = 2.6 + i * 1.75;
      add(new THREE.ConeGeometry(r, 3.4 - i * 0.2, 11, 2).translate(0, y + 1.6, 0), green, new THREE.Vector3(0, 7, 0), [2.2, top], 0.35);
    }
  } else if (kind === 'palm') {
    // Slender, slightly leaning trunk with a crown of drooping fronds.
    const trunk = new THREE.Color(0x7a6448), frond = new THREE.Color(0x4f7a2a), lean = 0.5;
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.2 - i * 0.02, 0.24 - i * 0.02, 2.6, 7).translate(lean * (i + 0.5) / 4, 1.3 + i * 2.5, 0), trunk);
    const top = new THREE.Vector3(lean, 10.2, 0);
    for (let f = 0; f < 9; f++) {
      const geo = new THREE.BoxGeometry(4.2, 0.08, 0.9, 4, 1, 1), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 2.1; p.setXYZ(i, x, p.getY(i) - 0.12 * x * x, p.getZ(i) * (1 - x / 5)); }
      add(geo.rotateZ(0.25).rotateY(f / 9 * Math.PI * 2 + (f % 2) * 0.3).translate(top.x, top.y, top.z), frond, top, [8, 10.5]);
    }
  } else {
    add(new THREE.CylinderGeometry(0.22, 0.38, 4.2, 7).translate(0, 2.1, 0), bark);
    add(new THREE.CylinderGeometry(0.08, 0.16, 2.4, 5).rotateZ(0.7).translate(0.7, 4.2, 0), bark);
    add(new THREE.CylinderGeometry(0.08, 0.16, 2.2, 5).rotateZ(-0.6).rotateY(2).translate(-0.4, 4.0, 0.5), bark);
    const leaf = new THREE.Color(0x3d6a2c), c = new THREE.Vector3(0, 6.6, 0);
    const blobs = [[0, 6.8, 0, 2.6], [1.6, 6.0, 0.4, 1.9], [-1.5, 6.2, -0.5, 2.0], [0.3, 6.1, 1.6, 1.8], [-0.4, 5.9, -1.6, 1.8], [0.2, 8.4, 0.1, 1.8], [1.1, 7.7, -1.0, 1.5]];
    for (const [x, y, z, r] of blobs) add(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), leaf, c, [4.2, 9.8], 0.45);
  }
  // Merge parts.
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o);
    o += g.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
