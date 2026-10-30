// Three.js circuit scenery for the stadium test track used by the physics
// surface function. Physics (x, y) maps to world (x, 0, -y); y is up.
import * as THREE from '../vendor/three.module.js';
import { stadiumPitLane } from './track.mjs';
import { buildSavanna, savannaPlan } from './savanna.mjs';
import { buildRiseStands, riseStandsClear, riseStandPlan } from './stands.mjs';
import { DEFAULT_SCENERY, waterField, terrainField, landcoverField } from './scenery.mjs';
import { buildWildlife, wildlifePlan } from './wildlife.mjs';
import { buildLake } from './lake.mjs';
import { buildSky, nightGlow } from './sky.mjs';
import { structuresPlan, buildStructures } from './structures.mjs';
import { lakesidePlan, buildLakeside } from './lakeside.mjs';
import { buildTrackPaint, mowMaterial, MOW_PERIOD } from './trackpaint.mjs';

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
  world.add(...plantTrees(spots, () => 0, rng));
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
  // Its night race: the floodlit road, kerbs, run-off and walls give off their
  // own colour (RISE: albedo x flood 0.34 x k, halved like our other glows).
  const flood = (mat, k = 1) => rise ? nightGlow(mat, mat.map ? 0xffffff : mat.color, 0.17 * k, { useMap: !!mat.map }) : mat;
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
  world.add(ribbon(pts, -half, half, 0, flood(asphaltMaterial(track.roadWidth), 1.1), 30));
  // The RISE sim's rubbered racing line and painted grid slots (trackpaint.mjs).
  world.add(buildTrackPaint(track, { slots: boxColors.length, glow: m => flood(m, 1.1) }));
  // The RISE sim's mowing stripes on the verge from the run-off to the wall,
  // just over the ground (terrain sits 0.25 m under the road's level).
  const postSpots = [], mowMat = mowMaterial(), mowLift = track.hasElevation ? -0.1 : -0.02;
  for (const side of [-1, 1]) {
    world.add(ribbon(pts, side * (half - 0.45), side * (half - 0.2), 0.008, flood(std({ color: 0xf2f2ee, roughness: 0.6 }), 1.1), 10));
    for (const r of runs(p => kerb[p.i])) world.add(ribbon(r, side * half, side * (half + 1.2), 0.012, flood(std({ map: kerbTex, roughness: 0.7 })), 4));
    const runoff = ribbon(pts, side * (half + 1.2), side * (half + 8), 0.004, flood(std({ map: rise ? riseRunoffTex : runoffTex, roughness: rise ? 0.8 : 1 })), 20);
    if (rise) runoff.name = 'rise-runoff';
    world.add(runoff);
    // Barrier where its line is still nearest this part of the circuit.
    const clear = p => Math.abs(track.offset(p.x + p.nx * side * wallAt, p.y + p.ny * side * wallAt)) > wallAt - 1;
    for (const r of runs(clear)) {
      const w = ribbon(r, side * wallAt, 0, footing, flood(std({ map: wallTex, roughness: 0.8 }), 0.8), 6, 1.1); w.castShadow = true; world.add(w);
      world.add(ribbon(r, side * wallAt, 0, 1.1, fenceMat, 0.16, 4.2));
      const mow = ribbon(r, side * (half + 8), side * wallAt, mowLift, mowMat, MOW_PERIOD); mow.name = 'mowing'; mow.renderOrder = 1; world.add(mow);
      r.forEach((p, k) => { if (k % 4 === 0) postSpots.push([p.x + p.nx * side * wallAt, p.y + p.ny * side * wallAt, p.h(side * wallAt)]); });
    }
    // TecPro facing just in front of the wall (no gaps where it starts and stops).
    if (rise) for (const r of runs(p => clear(p) && side * bend(p.i) < -1 / 70)) {
      const t = ribbon(r, side * (wallAt - 0.06), 0, footing, flood(std({ map: tecproTex, roughness: 0.85 }), 0.8), 3, 1.05);
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
    // Each layer is only mm above the one below, so depth offsets (asphalt,
    // then lines, then box paint) keep them from flickering at a distance.
    // Units only: a slope factor pulls them through a car's low parts when
    // the ground is seen at a grazing angle (from the cockpit).
    const r = f => -pit.side * f, layer = (mat, k) => Object.assign(mat, { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4 * k });
    world.add(ribbon(strip(pit.entry, pit.exit), r(-half), r(-pit.outer), 0.006, layer(flood(asphaltMaterial(Math.abs(pit.outer - half)), 1.1), 1), 30));
    world.add(ribbon(strip(pit.limitStart, pit.limitEnd), r(-pit.inner), r(-pit.inner - 0.25), 0.009, layer(std({ color: 0xf2f2ee, roughness: 0.6 }), 2), 10));
    const flat = (s, f, length, width, color, y = 0.01, k = 2) => onRoad(new THREE.Mesh(new THREE.PlaneGeometry(length, width), layer(std({ color, roughness: 0.6 }), k)), s, pit.side * f, y);
    for (const s of [pit.limitStart, pit.limitEnd]) flat(s, -(pit.inner + pit.outer) / 2, 0.4, pit.outer - pit.inner, 0xf2f2ee);
    const garageAt = -(wallAt + 4.5), concreteGarage = std({ color: 0xd9dcd6, roughness: 0.7 });
    for (let i = 0; i < Math.max(boxColors.length, 5); i++) {
      const s = pit.boxStart + pit.boxSpacing * i;
      flat(s, pit.boxOffset, 7, 3, 0xf2f2ee); flat(s, pit.boxOffset, 6.6, 2.6, boxColors[i] ?? 0x3a4450, 0.012, 3);
      const [x, y] = track.point(s, pit.side * garageAt);
      if (track.hasElevation || standSide === -pit.side || Math.abs(track.offset(x, y)) < wallAt + 3) continue;
      const g = new THREE.Mesh(new THREE.BoxGeometry(pit.boxSpacing - 0.5, 6, 7), concreteGarage);
      g.position.set(x, track.elevation(s, pit.side * garageAt) + 2.8, -y); g.rotation.y = track.heading(s); g.castShadow = g.receiveShadow = true; world.add(g);
    }
  }

  // Whether (x, y) is on the plot of our own grandstand (its roof and a 3 m
  // margin: s = -125 to 5, out to wallAt + 26 on its side) or of our pit lane
  // and garages (entry to exit, out to the garages' back + 3 m), widened by
  // `pad` m all round. With terrain: the RISE grandstands (stands.mjs, roofs
  // and a 3 m margin) and the pit building (out to wallAt + 21, + 3 m).
  const hilly = track.hasElevation, riseClear = new Map();
  const offRise = (x, y, pad) => (riseClear.get(pad) ?? riseClear.set(pad, riseStandsClear(track, standSide, 3 + pad)).get(pad))(x, y);
  const ourPlot = (x, y, pad = 0) => {
    const o = track.offset(x, y), a = Math.abs(o);
    if (a > wallAt + (hilly ? 38 : 26) + pad) return false;
    const near = track.progress(x, y), sp = near > track.length / 2 ? near - track.length : near;
    if (standSide && Math.sign(o) === standSide && (hilly ? !offRise(x, y, pad) : sp > -125 - pad && sp < 5 + pad)) return true;
    return !!pit && Math.sign(o) === -pit.side && sp > pit.entry - 10 - pad && sp < pit.exit + 10 + pad && a < (hilly ? wallAt + 21 : Math.max(pit.outer, wallAt + 8)) + 3 + pad;
  };
  const inside = (ring, x, y) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i][1] > y) !== (ring[j][1] > y) && x < (ring[j][0] - ring[i][0]) * (y - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
    return c;
  };
  // Points inside our grandstand and garages: no building may enclose them.
  const ourProbes = [];
  if (standSide && hilly) for (const { s, front } of riseStandPlan(track, standSide)) for (const d of [-40, 0, 40]) ourProbes.push(track.point(s + d, standSide * (front + 12)));
  else if (standSide) for (let s = -110; s <= -10; s += 20) ourProbes.push(track.point(s, standSide * (wallAt + 14)));
  if (pit) for (let s = pit.entry; s <= pit.exit; s += 20) ourProbes.push(track.point(s, -pit.side * (wallAt + (hilly ? 11 : 4.5))));

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
  // (savanna.mjs); otherwise the real buildings and trees below.
  if (track.lakeLevel !== null) {
    const terrain = { height: terrainHeight, dist: terrainHeight.dist, lake: terrainHeight.lake, lakeLevel: track.lakeLevel };
    const box = { minX, maxX, minY, maxY }, plan = savannaPlan(track, terrain, box);
    // With the lake: the RISE sim's wildlife in glades kept clear of trees.
    const herds = track.lakeLevel !== null ? wildlifePlan(track, terrain, box) : null;
    if (herds) for (const k in plan) plan[k] = plan[k].filter(([x, y]) => !herds.glade(x, y));
    // With the lake: the RISE sim's footbridges, floodlights, paddock and villages, trees kept out of them.
    const builds = track.lakeLevel !== null ? structuresPlan(track, terrain) : null;
    // Its raised billboards carry our logo across a 3.2 : 1 face, lit at night like its sign material (0.55, halved).
    if (builds) {
      const board = texture(1, () => {}), cv = board.image; cv.width = 1024; cv.height = 320;
      const g = cv.getContext('2d'); g.fillStyle = '#0d1a28'; g.fillRect(0, 0, 1024, 320);
      g.save(); g.translate(0, 70); drawLogo(g, 1024, 160, true); g.restore();
      g.fillStyle = '#6fffc3'; g.fillRect(0, 290, 1024, 14); board.needsUpdate = true;
      const billboardMat = nightGlow(new THREE.MeshStandardMaterial({ map: board, roughness: 0.55 }), 0xffffff, 0.28, { day: 0.08, useMap: true });
      for (const k in plan) plan[k] = plan[k].filter(([x, y]) => builds.clear(x, y)); buildStructures(world, track, builds, { ground: terrainHeight, bannerMat: logoMat, billboardMat });
    }
    // With the lake: the RISE sim's hospitality pods and jetties on the shore (lakeside.mjs).
    const shore = track.lakeLevel !== null ? lakesidePlan(terrain) : null;
    if (shore) { for (const k in plan) plan[k] = plan[k].filter(([x, y]) => shore.clear(x, y)); buildLakeside(world, shore, terrain); }
    const wildlife = herds ? buildWildlife(world, herds, terrain) : null;
    world.userData = { center: [cx, cy], extent, trees: buildSavanna(world, plan, terrain, { flood: track.lakeLevel !== null }), wildlife: wildlife?.counts, update: wildlife?.update };
    return world;
  }
  const rng = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const beach = terrainHeight.sea ?? (() => -Infinity), shore = terrainHeight.water ?? (() => Infinity);
  // The real buildings (scenery.buildings, buildings.mjs: OpenStreetMap
  // footprints with their heights), extruded from their lowest ground, flat
  // roofed, with window bays of 3.5 m × 3.2 m floors. Left out where the fit
  // to the globe puts one within 3 m of the barriers (a grandstand is moved
  // back behind them instead), in the sea or water, or on the plot of our own
  // grandstand and garages (ourPlot). The grandstands among them (scenery.stands) are raked
  // instead: their seating rises from 1.5 m over the ground at the side
  // facing the circuit to their full height at the back, rows of spectators
  // 0.8 m deep on top.
  const blocks = [], cell = 40, blockGrid = new Map(), standSet = new Set(scenery.stands ?? []), movedStands = [];
  const fits = r => r.every(([x, y]) => Math.abs(track.offset(x, y)) >= wallAt + 3 && beach(x, y) <= -1 && shore(x, y) >= 1);
  const addBlock = (ring, b, bi, moved = 0) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const gs = ring.map(([x, y]) => terrainHeight(x, y)), base = Math.min(...gs);
    const blk = { ring, box: [x0, y0, x1, y1], base, top: Math.max(base + b[0], Math.max(...gs) + 2.5), moved };
    if (standSet.has(bi)) {
      // Raked by distance from the circuit; seat rows run across ux, uy (away
      // from the nearest point of the centreline).
      const [px, py] = track.point(track.progress(mx, my)), l = Math.hypot(mx - px, my - py) || 1, ux = (mx - px) / l, uy = (my - py) / l;
      const d = ring.map(([x, y]) => Math.abs(track.offset(x, y))), d0 = Math.min(...d), depth = Math.max(...d) - d0, front = Math.max(...gs) + 1.5;
      if (depth > 4 && blk.top > front + 2) Object.assign(blk, { stand: [ux, uy], depth, tops: d.map(v => front + (blk.top - front) * (v - d0) / depth), rows: d.map(v => (v - d0) / 0.8) });
    }
    blocks.push(blk);
    for (let u = Math.floor((x0 - 5) / cell); u <= Math.floor((x1 + 5) / cell); u++) for (let v = Math.floor((y0 - 5) / cell); v <= Math.floor((y1 + 5) / cell); v++) {
      const k = `${u},${v}`; (blockGrid.get(k) ?? blockGrid.set(k, []).get(k)).push(blk);
    }
  };
  // Points every 2 m along a footprint's outline.
  const outline = ring => ring.flatMap(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length], m = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
    return Array.from({ length: m }, (_, k) => [ax + (bx - ax) * k / m, ay + (by - ay) * k / m]);
  });
  (scenery.buildings ?? []).forEach((b, bi) => {
    let ring = Array.from({ length: (b.length - 1) / 2 }, (_, i) => [b[1 + 2 * i], b[2 + 2 * i]]), moved = 0;
    if (!fits(ring)) {
      // A real grandstand nearer the circuit than our barriers (Monza's,
      // Silverstone's): moved straight back until it stands 3.5 m behind
      // them, by at most 12 m, where no other building stands (below).
      if (!standSet.has(bi)) return;
      for (let pass = 0; pass < 3 && !fits(ring); pass++) {
        const cx0 = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy0 = ring.reduce((a, p) => a + p[1], 0) / ring.length;
        const [px, py] = track.point(track.progress(cx0, cy0)), l = Math.hypot(cx0 - px, cy0 - py) || 1;
        const shift = wallAt + 3.5 - Math.min(...ring.map(([x, y]) => Math.abs(track.offset(x, y))));
        if (shift <= 0 || (moved += shift) > 12) return;
        ring = ring.map(([x, y]) => [x + (cx0 - px) / l * shift, y + (cy0 - py) / l * shift]);
      }
      if (!fits(ring)) return;
    }
    // Clear of our own grandstand and pits.
    if (outline(ring).some(([x, y]) => ourPlot(x, y)) || ourProbes.some(([px, py]) => inside(ring, px, py))) return;
    if (moved) movedStands.push([ring, b, bi, moved]); else addBlock(ring, b, bi);
  });

  // Whether (x, y) is within `pad` (up to 5) m of a building.
  const built = (x, y, pad) => (blockGrid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? []).some(({ ring, box: [x0, y0, x1, y1] }) => {
    if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) return false;
    let c = false, d2 = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i], dx = bx - ax, dy = by - ay;
      if ((ay > y) !== (by > y) && x < dx * (y - ay) / (by - ay) + ax) c = !c;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      d2 = Math.min(d2, (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2);
    }
    return c || d2 < pad * pad;
  });
  for (const [ring, b, bi, moved] of movedStands) {
    const near = new Set(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let u = Math.floor(x0 / cell); u <= Math.floor(x1 / cell); u++) for (let v = Math.floor(y0 / cell); v <= Math.floor(y1 / cell); v++) for (const o of blockGrid.get(`${u},${v}`) ?? []) near.add(o);
    if (outline(ring).some(([x, y]) => built(x, y, 0.5)) || [...near].some(o => o.ring.some(([x, y]) => inside(ring, x, y)))) continue;
    addBlock(ring, b, bi, moved);
  }
  if (blocks.length) {
    const facade = texture(64, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#5b6670'; g.fillRect(s * 0.22, s * 0.22, s * 0.56, s * 0.5);
    });
    const shades = [0xe9dcc3, 0xf1e6d2, 0xd9b48f, 0xe6c9a8, 0xf4f1ea, 0xc9a98a, 0xe8d6b0, 0xcfd2d4].map(c => new THREE.Color(c));
    const wp = [], wuv = [], wc = [], rp = [], rc = [], ri = [], sp = [], suv = [], si = [], standGrey = new THREE.Color(0xb9bcb8);
    blocks.forEach((b, k) => {
      const tone = b.stand ? standGrey : shades[(k * 7919) % shades.length], roof = tone.clone().multiplyScalar(0.72), r = b.ring, bottom = b.base - 3, tops = b.tops ?? r.map(() => b.top);
      let u = 0;
      for (let i = 0; i < r.length; i++) {
        const j = (i + 1) % r.length, [ax, ay] = r[i], [bx, by] = r[j], du = Math.hypot(bx - ax, by - ay) / 3.5, fa = (tops[i] - bottom) / 3.2, fb = (tops[j] - bottom) / 3.2;
        // Two triangles, outward faces (the footprint is anticlockwise).
        wp.push(ax, bottom, -ay, bx, bottom, -by, bx, tops[j], -by, ax, bottom, -ay, bx, tops[j], -by, ax, tops[i], -ay);
        wuv.push(u, 0, u + du, 0, u + du, fb, u, 0, u + du, fb, u, fa);
        for (let q = 0; q < 6; q++) wc.push(tone.r, tone.g, tone.b);
        u += du;
      }
      const tris = THREE.ShapeUtils.triangulateShape(r.map(([x, y]) => new THREE.Vector2(x, y)), []);
      if (b.stand) {
        // Seats: 0.5 m wide (16 to a texture's width) along the front, rows up the rake.
        const at = sp.length / 3, [ux, uy] = b.stand;
        r.forEach(([x, y], i) => { sp.push(x, tops[i], -y); suv.push((-x * uy + y * ux) / 8, b.rows[i]); });
        for (const t of tris) si.push(at + t[0], at + t[1], at + t[2]);
        return;
      }
      const at = rp.length / 3;
      for (const [x, y] of r) { rp.push(x, b.top, -y); rc.push(roof.r, roof.g, roof.b); }
      for (const t of tris) ri.push(at + t[0], at + t[1], at + t[2]);
    });
    const walls = new THREE.BufferGeometry();
    walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    walls.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
    walls.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    walls.computeVertexNormals();
    const roofs = new THREE.BufferGeometry();
    roofs.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    roofs.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    roofs.setIndex(ri); roofs.computeVertexNormals();
    const town = new THREE.Group();
    town.add(new THREE.Mesh(walls, new THREE.MeshStandardMaterial({ map: facade, vertexColors: true, roughness: 0.85 })), new THREE.Mesh(roofs, std({ vertexColors: true, roughness: 0.9 })));
    if (si.length) {
      const seats = new THREE.BufferGeometry(), map = crowd.clone(); map.repeat.set(1, 1); map.needsUpdate = true;
      seats.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      seats.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
      seats.setIndex(si); seats.computeVertexNormals();
      town.add(new THREE.Mesh(seats, std({ map, roughness: 0.9 })));
    }
    town.children.forEach(m => { m.castShadow = m.receiveShadow = true; m.userData.kind = 'buildings'; });
    town.userData = { kind: 'buildings', count: blocks.length, blocks, stands: blocks.filter(b => b.stand).length };
    world.add(town);
  }
  // The real roads and streets (scenery.roads, roads.mjs: OpenStreetMap):
  // asphalt ribbons of their width, cut into steps of at most 3 m that lie
  // 0.12 m over the ground mesh's own facets. Left out within 3 m of the
  // barriers (where a street circuit runs on public roads, the circuit is
  // drawn there instead), in the sea or water, and within 1 m of the plot of
  // our own grandstand and pits (ourPlot).
  const roadDist = terrainHeight.dist ?? ((x, y) => Math.abs(track.offset(x, y)));
  const ours = (x, y, w) => roadDist(x, y) <= wallAt + 80 && (Math.abs(track.offset(x, y)) < wallAt + w / 2 + 3 || ourPlot(x, y, w / 2 + 1));
  const onGround = terrainHeight.mesh ?? terrainHeight, laneGrid = new Map(), rp = [], ruv = [], ri = [], mp = [], mi = [];
  let roadKm = 0, markKm = 0;
  // Unit left normal of a run at point k.
  const across = (run, k) => {
    const [px, py] = run[Math.max(0, k - 1)], [qx, qy] = run[Math.min(run.length - 1, k + 1)], l = Math.hypot(qx - px, qy - py) || 1;
    return [-(qy - py) / l, (qx - px) / l];
  };
  for (const [w, ...flat] of scenery.roads ?? []) {
    // Densified path, then its runs of kept points.
    const path = [];
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const [ax, ay, bx, by] = flat.slice(i, i + 4), m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let k = i ? 1 : 0; k <= m; k++) path.push([ax + (bx - ax) * k / m, ay + (by - ay) * k / m]);
    }
    // (Both edges checked too: far from the road the nearest part of the
    // circuit can change across a street's width.)
    const keep = path.map(([x, y], k) => {
      if (ours(x, y, w) || beach(x, y) >= -w / 2 || shore(x, y) <= 0) return false;
      const [nx, ny] = across(path, k);
      return !ourPlot(x + nx * w / 2, y + ny * w / 2, 1) && !ourPlot(x - nx * w / 2, y - ny * w / 2, 1);
    });
    for (let a = 0; a < path.length;) {
      if (!keep[a]) { a++; continue; }
      let b = a; while (b + 1 < path.length && keep[b + 1]) b++;
      if (b > a) {
        const run = path.slice(a, b + 1), at = rp.length / 3;
        run.forEach(([x, y], k) => {
          const [px, py] = run[Math.max(0, k - 1)], [qx, qy] = run[Math.min(run.length - 1, k + 1)], l = Math.hypot(qx - px, qy - py) || 1, nx = -(qy - py) / l * w / 2, ny = (qx - px) / l * w / 2;
          for (const s of [1, -1]) { const vx = x + nx * s, vy = y + ny * s; rp.push(vx, onGround(vx, vy) + 0.12, -vy); ruv.push(vx / 2.5, vy / 2.5); }
          if (k) { const q = at + 2 * k; ri.push(q - 2, q - 1, q, q - 1, q + 1, q); roadKm += Math.hypot(x - run[k - 1][0], y - run[k - 1][1]) / 1000; }
          const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`; (laneGrid.get(key) ?? laneGrid.set(key, []).get(key)).push([x, y, w / 2]);
        });
        // Painted lines: a dashed centre line (4.5 m dashes, 4.5 m gaps) on
        // roads 6 m wide or more, solid edge lines 0.3 m in on roads 8 m or
        // more; 0.12 m wide.
        if (w >= 6) {
          let d = 0;
          for (let k = 1; k < run.length; k++) {
            const [ax, ay] = run[k - 1], [bx, by] = run[k], l = Math.hypot(bx - ax, by - ay);
            const lines = [];
            if (Math.floor((d + l / 2) / 4.5) % 2 === 0) lines.push(0);
            if (w >= 8) lines.push(w / 2 - 0.3, 0.3 - w / 2);
            d += l;
            if (!lines.length) continue;
            const [nax, nay] = across(run, k - 1), [nbx, nby] = across(run, k);
            for (const o of lines) {
              const q = mp.length / 3;
              for (const [x, y, nx, ny] of [[ax, ay, nax, nay], [bx, by, nbx, nby]]) for (const s of [0.06, -0.06]) {
                const vx = x + nx * (o + s), vy = y + ny * (o + s); mp.push(vx, onGround(vx, vy) + 0.14, -vy);
              }
              mi.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
              markKm += l / 1000;
            }
          }
        }
      }
      a = b + 1;
    }
  }
  if (ri.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
    geo.setIndex(ri); geo.computeVertexNormals();
    const mat = asphaltMaterial(1, 1); mat.color.setHex(0xa9a9a9);
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    const streets = new THREE.Mesh(geo, mat); streets.receiveShadow = true;
    streets.userData = { kind: 'roads', km: Math.round(roadKm * 10) / 10 }; world.add(streets);
  }
  if (mi.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    geo.setIndex(mi); geo.computeVertexNormals();
    const mat = std({ color: 0xe8e8e2, roughness: 0.7 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -3; mat.polygonOffsetUnits = -3;
    const paint = new THREE.Mesh(geo, mat); paint.receiveShadow = true;
    paint.userData = { kind: 'markings', km: Math.round(markKm * 10) / 10 }; world.add(paint);
  }
  // Whether (x, y) is within `pad` m of a road's edge (points every 3 m).
  const paved = (x, y, pad) => {
    const u = Math.floor(x / cell), v = Math.floor(y / cell);
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) for (const [px, py, hw] of laneGrid.get(`${u + du},${v + dv}`) ?? []) if ((x - px) ** 2 + (y - py) ** 2 < (hw + pad + 1.5) ** 2) return true;
    return false;
  };
  // The real walls, fences, hedges, guard rails and railway lines
  // (scenery.barriers, barriers.mjs: OpenStreetMap), on the ground mesh in
  // steps of at most 3 m: walls (2 m tall unless mapped) 0.3 m thick, hedges
  // (1.6 m) 1 m thick, guard rails (0.8 m) 0.25 m thick, fences (1.8 m) of
  // see-through mesh, and railway track as a ballast bed with two rails.
  // Left out where the roads are (within 3 m of the barriers, in the sea or
  // water, our grandstand and pits), on the streets and inside buildings.
  const LINE = [{ h: 2, w: 0.3, color: 0xb3ab9c }, { h: 1.8 }, { h: 1.6, w: 1, color: 0x2e5524 }, { h: 0.8, w: 0.25, color: 0xb4babe }, { w: 3 }];
  const sp = [], sc = [], si = [], fp = [], fuv = [], fi = [], bp = [], bi = [], tp = [], ti = [], lineKm = [0, 0, 0, 0, 0];
  // A flat band from a to b m left of a run, `lift` m over the ground mesh.
  const band = (run, a, b, lift, P, I) => run.forEach(([x, y], k) => {
    const [nx, ny] = across(run, k);
    for (const o of [a, b]) P.push(x + nx * o, onGround(x + nx * o, y + ny * o) + lift, -(y + ny * o));
    if (k) { const q = P.length / 3 - 2; I.push(q - 2, q - 1, q, q - 1, q + 1, q); }
  });
  for (const [kind, dm, ...flat] of scenery.barriers ?? []) {
    const { h: h0, w = 0, color } = LINE[kind], h = dm ? dm / 10 : h0, path = [];
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const [ax, ay, bx, by] = flat.slice(i, i + 4), m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let k = i ? 1 : 0; k <= m; k++) path.push([ax + (bx - ax) * k / m, ay + (by - ay) * k / m]);
    }
    const keep = path.map(([x, y]) => !ours(x, y, Math.max(w, 1)) && beach(x, y) < -1 - w / 2 && shore(x, y) > w / 2 && !paved(x, y, -2) && !built(x, y, 0));
    for (let a = 0; a < path.length;) {
      if (!keep[a]) { a++; continue; }
      let b = a; while (b + 1 < path.length && keep[b + 1]) b++;
      const run = path.slice(a, b + 1);
      a = b + 1;
      if (run.length < 2) continue;
      for (let k = 1; k < run.length; k++) lineKm[kind] += Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]) / 1000;
      if (kind === 4) {
        band(run, -1.5, 1.5, 0.1, bp, bi);
        for (const o of [-0.72, 0.72]) band(run, o - 0.04, o + 0.04, 0.28, tp, ti);
      } else if (kind === 1) {
        let u = 0;
        run.forEach(([x, y], k) => {
          if (k) u += Math.hypot(x - run[k - 1][0], y - run[k - 1][1]) / 0.5;
          const g = onGround(x, y); fp.push(x, g - 0.1, -y, x, g + h, -y); fuv.push(u, 0, u, (h + 0.1) / 0.5);
          if (k) { const q = fp.length / 3 - 2; fi.push(q - 2, q - 1, q, q - 1, q + 1, q); }
        });
      } else {
        // Four corners a point (left foot, left top, right top, right foot);
        // the sides and top between points, closed at both ends.
        const c = new THREE.Color(color), at = sp.length / 3;
        run.forEach(([x, y], k) => {
          const [nx, ny] = across(run, k), d = w / 2;
          for (const [s, up] of [[1, false], [1, true], [-1, true], [-1, false]]) {
            const vx = x + nx * d * s, vy = y + ny * d * s, g = onGround(vx, vy);
            sp.push(vx, up ? g + h : g - 0.4, -vy); sc.push(c.r, c.g, c.b);
          }
          if (k) { const q = at + 4 * k, p = q - 4; for (let f = 0; f < 3; f++) si.push(p + f, q + f, q + f + 1, p + f, q + f + 1, p + f + 1); }
        });
        const end = at + 4 * (run.length - 1);
        si.push(at, at + 1, at + 2, at, at + 2, at + 3, end, end + 2, end + 1, end, end + 3, end + 2);
      }
    }
  }
  const lines = new THREE.Group();
  const lineMesh = (P, I, mat, kindName, U, C) => {
    if (!I.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    if (C) geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setIndex(I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.castShadow = kindName !== 'ballast'; m.receiveShadow = true; m.userData.kind = kindName; lines.add(m);
  };
  lineMesh(sp, si, std({ vertexColors: true, roughness: 0.9, flatShading: true }), 'walls', null, sc);
  const chain = texture(64, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#a9b0b3'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
    g.fillStyle = '#6e7478'; g.fillRect(0, 0, 6, s);
  });
  lineMesh(fp, fi, new THREE.MeshStandardMaterial({ map: chain, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.6 }), 'fences', fuv);
  const ballast = std({ map: texture(128, (g, s) => noise(g, s, '#7d7468', 0.35, 6000), 1, 1), roughness: 1 });
  ballast.polygonOffset = true; ballast.polygonOffsetFactor = -3; ballast.polygonOffsetUnits = -3;
  lineMesh(bp, bi, ballast, 'ballast');
  lineMesh(tp, ti, std({ color: 0x8a8d90, metalness: 0.8, roughness: 0.35 }), 'rails');
  if (lines.children.length) {
    lines.userData = { kind: 'barriers', km: Object.fromEntries(['walls', 'fences', 'hedges', 'guardRails', 'railway'].map((k, i) => [k, Math.round(lineKm[i] * 10) / 10])) };
    world.add(lines);
  }
  // The real bridges and viaducts (scenery.bridges, bridges.mjs:
  // OpenStreetMap) in steps of at most 3 m: a concrete deck (roads 1.2 m
  // thick, railways 1.4 m, footbridges 0.5 m) 1 m wider than the way with
  // 1.1 m parapets, asphalt on road decks, ballast and rails on railway
  // ones, and a pier about every 30 m where the deck stands 2.5 m or more
  // over the ground (none on the circuit or a street). The deck clears the
  // ground (or the sea) by 5.5 m a layer for roads and railways, 2.5 m for
  // footbridges, easing down to it over the 40 m at its ends, and the
  // circuit by 6.5 m wherever it crosses it; it falls at most 8% (railways
  // 5%, footbridges 30%) from there. Left out where a bridge runs along the
  // circuit inside its barriers (a street circuit's own bridges).
  const BRIDGE = [{ t: 1.2, c: 5.5, g: 0.08 }, { t: 1.4, c: 5.5, g: 0.05 }, { t: 0.5, c: 2.5, g: 0.3 }];
  const dp = [], di = [], ap = [], auv = [], ai = [], gp = [], gi = [], rp2 = [], ri2 = [], bridgeKm = [0, 0, 0], deckGrid = [];
  let piers = 0;
  const floorAt = (x, y) => Math.max(onGround(x, y), terrainHeight.seaLevel ?? -Infinity);
  const tunnelRanges = scenery.tunnels ?? [];
  const underRoof = (x, y) => {
    if (!tunnelRanges.length || Math.abs(track.offset(x, y)) > wallAt + 3) return false;
    const s = track.progress(x, y);
    return tunnelRanges.some(([a, b]) => (s >= a && s <= b) || (s - track.length >= a && s - track.length <= b));
  };
  // A closed box section from left offset a to b along run, between heights lo[k] and hi[k].
  const slab = (run, lo, hi, a, b) => {
    const at = dp.length / 3;
    run.forEach(([x, y], k) => {
      const [nx, ny] = across(run, k);
      for (const [o, up] of [[b, false], [b, true], [a, true], [a, false]]) dp.push(x + nx * o, up ? hi[k] : lo[k], -(y + ny * o));
      if (k) { const q = at + 4 * k, p = q - 4; for (let f = 0; f < 4; f++) { const f1 = (f + 1) % 4; di.push(p + f, q + f, q + f1, p + f, q + f1, p + f1); } }
    });
    const end = at + 4 * (run.length - 1);
    di.push(at, at + 1, at + 2, at, at + 2, at + 3, end, end + 2, end + 1, end, end + 3, end + 2);
  };
  // A flat band from a to b m left of run at heights z[k] + lift.
  const deckBand = (run, z, a, b, lift, P, I, U) => run.forEach(([x, y], k) => {
    const [nx, ny] = across(run, k);
    for (const o of [a, b]) { P.push(x + nx * o, z[k] + lift, -(y + ny * o)); U?.push((x + nx * o) / 2.5, (y + ny * o) / 2.5); }
    if (k) { const q = P.length / 3 - 2; I.push(q - 2, q - 1, q, q - 1, q + 1, q); }
  });
  for (const [kind, w, layer, ...flat] of scenery.bridges ?? []) {
    const { t, c, g } = BRIDGE[kind], path = [];
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const [ax, ay, bx, by] = flat.slice(i, i + 4), m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let k = i ? 1 : 0; k <= m; k++) path.push([ax + (bx - ax) * k / m, ay + (by - ay) * k / m]);
    }
    // None over the circuit's own tunnels (their roof is drawn instead, below).
    if (path.some(([x, y]) => underRoof(x, y))) continue;
    // Inside the barriers, kept only where it crosses the circuit at 30° or more.
    const keep = path.map(([x, y], k) => {
      if (Math.abs(track.offset(x, y)) > wallAt + w / 2 + 3) return true;
      const [px, py] = path[Math.max(0, k - 1)], [qx, qy] = path[Math.min(path.length - 1, k + 1)], l = Math.hypot(qx - px, qy - py) || 1;
      const gx = track.offset(x + 1, y) - track.offset(x - 1, y), gy = track.offset(x, y + 1) - track.offset(x, y - 1);
      return Math.abs(gx * (qx - px) + gy * (qy - py)) / (Math.hypot(gx, gy) || 1) / l > 0.5;
    });
    for (let a = 0; a < path.length;) {
      if (!keep[a]) { a++; continue; }
      let b = a; while (b + 1 < path.length && keep[b + 1]) b++;
      const run = path.slice(a, b + 1);
      a = b + 1;
      if (run.length < 2) continue;
      const s = [0]; for (let k = 1; k < run.length; k++) s.push(s[k - 1] + Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]));
      const len = s.at(-1), fl = run.map(([x, y]) => floorAt(x, y)), over = run.map(([x, y]) => Math.abs(track.offset(x, y)) < wallAt + 2);
      const z = run.map((_, k) => Math.max(fl[k] + (c + 5 * (layer - 1) + t) * Math.min(1, Math.min(s[k], len - s[k]) / 40), over[k] ? fl[k] + 6.5 + t : -Infinity, fl[k] + 0.3));
      for (let k = 1; k < run.length; k++) z[k] = Math.max(z[k], z[k - 1] - g * (s[k] - s[k - 1]));
      for (let k = run.length - 2; k >= 0; k--) z[k] = Math.max(z[k], z[k + 1] - g * (s[k + 1] - s[k]));
      bridgeKm[kind] += len / 1000;
      const e = w / 2 + 0.5;
      slab(run, z.map(v => v - t), z, -e, e);
      slab(run, z, z.map(v => v + 1.1), e - 0.25, e);
      slab(run, z, z.map(v => v + 1.1), -e, -e + 0.25);
      if (kind === 0) deckBand(run, z, -w / 2, w / 2, 0.03, ap, ai, auv);
      else if (kind === 1) {
        deckBand(run, z, -1.5, 1.5, 0.1, gp, gi);
        for (const o of [-0.72, 0.72]) deckBand(run, z, o - 0.04, o + 0.04, 0.28, rp2, ri2);
      }
      for (let k = 0, next = 15; k < run.length; k++) {
        const [x, y] = run[k];
        deckGrid.push([x, y, e]);
        if (s[k] < next || s[k] > len - 10) continue;
        if (z[k] - t - fl[k] < 2.5 || over[k] || Math.abs(track.offset(x, y)) < wallAt + 1 || paved(x, y, 0)) continue;
        const [nx, ny] = across(run, k), tx = ny, ty = -nx, pw = Math.min(w, 8) * 0.35;
        slab([[x - tx * 0.75, y - ty * 0.75], [x + tx * 0.75, y + ty * 0.75]], [fl[k] - 1, fl[k] - 1], [z[k] - t, z[k] - t], -pw, pw);
        piers++; next = s[k] + 30;
      }
    }
  }
  if (di.length) {
    const spans = new THREE.Group(), add = (P, I, mat, name, U) => {
      if (!I.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (U) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.setIndex(I); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = name === 'decks'; m.receiveShadow = true; m.userData.kind = name; spans.add(m);
    };
    add(dp, di, std({ color: 0xa9a59c, roughness: 0.9, flatShading: true }), 'decks');
    const deckAsphalt = asphaltMaterial(1, 1); deckAsphalt.color.setHex(0xa9a9a9);
    deckAsphalt.polygonOffset = true; deckAsphalt.polygonOffsetFactor = -2; deckAsphalt.polygonOffsetUnits = -2;
    add(ap, ai, deckAsphalt, 'deckRoads', auv);
    add(gp, gi, ballast, 'deckBallast');
    add(rp2, ri2, std({ color: 0x8a8d90, metalness: 0.8, roughness: 0.35 }), 'deckRails');
    spans.userData = { kind: 'bridges', piers, km: Object.fromEntries(['road', 'railway', 'foot'].map((k, i) => [k, Math.round(bridgeKm[i] * 100) / 100])) };
    world.add(spans);
    // Trees keep off them as off the streets.
    for (const [x, y, hw] of deckGrid) { const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`; (laneGrid.get(key) ?? laneGrid.set(key, []).get(key)).push([x, y, hw]); }
  }
  // The circuit's own tunnels and covered stretches (scenery.tunnels,
  // tunnels.mjs: OpenStreetMap; Monaco's tunnel, the pass under Monza's old
  // banking) in steps of at most 2 m: a 1.5 m concrete roof whose underside
  // stands 6.5 m over the highest point across the road, reaching 3 m past
  // the barriers, walls from below the ground up to it just behind them,
  // and a row of lamps either side of the middle every 8 m.
  if (tunnelRanges.length) {
    const tp = [], ti = [], lamps = [], out = wallAt + 3, inn = wallAt + 0.3;
    let tunnelM = 0;
    // A quad strip through the points corner(k, j) (j = 0, 1) along stations k.
    const strip = (m, corner) => {
      const at = tp.length / 3;
      for (let k = 0; k < m; k++) for (let j = 0; j < 2; j++) tp.push(...corner(k, j));
      for (let k = 1; k < m; k++) { const q = at + 2 * k; ti.push(q - 2, q - 1, q, q - 1, q + 1, q); }
    };
    for (const [s0, s1] of tunnelRanges) {
      const m = Math.max(2, Math.ceil((s1 - s0) / 2) + 1), st = Array.from({ length: m }, (_, k) => {
        const s = s0 + (s1 - s0) * k / (m - 1), [x, y] = track.point(s), h = track.heading(s);
        return { s, x, y, nx: -Math.sin(h), ny: Math.cos(h), z: Math.max(ground(s, -half), ground(s, 0), ground(s, half)) + 6.5 };
      });
      tunnelM += s1 - s0;
      const at = (p, o, z) => [p.x + p.nx * o, z, -(p.y + p.ny * o)];
      strip(m, (k, j) => at(st[k], j ? out : -out, st[k].z));
      strip(m, (k, j) => at(st[k], j ? -out : out, st[k].z + 1.5));
      for (const o of [-out, out, -inn, inn]) strip(m, (k, j) => at(st[k], o, Math.abs(o) === out ? st[k].z + 1.5 * j : j ? st[k].z : ground(st[k].s, o) + footing - 0.5));
      for (const p of [st[0], st[m - 1]]) strip(2, (k, j) => at(p, k ? out : -out, p.z + 1.5 * j));
      for (let k = 0; k < m; k += 4) for (const o of [-half * 0.4, half * 0.4]) lamps.push(at(st[k], o, st[k].z - 0.08).concat(st[k].s));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    geo.setIndex(ti); geo.computeVertexNormals();
    const shell = new THREE.Mesh(geo, std({ color: 0x8f8d88, roughness: 0.95 }));
    shell.castShadow = shell.receiveShadow = true; shell.userData.kind = 'tunnelShell';
    const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd98a, emissiveIntensity: 1.4 }), lamps.length);
    lamps.forEach(([x, y, z, s], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, track.heading(s), 0); dummy.updateMatrix(); lampMesh.setMatrixAt(i, dummy.matrix); });
    lampMesh.userData.kind = 'tunnelLamps';
    const tunnels = new THREE.Group(); tunnels.add(shell, lampMesh);
    tunnels.userData = { kind: 'tunnels', ranges: tunnelRanges, m: Math.round(tunnelM), lamps: lamps.length };
    world.add(tunnels);
  }

  // Trees stand at least 20 m clear of the road, 40 m in from the sea, 5 m
  // from the water, 4 m from any building and 2 m from any street, and not
  // on sand, gravel or paved ground (landcover.mjs).
  const onBare = terrainHeight.cover ?? (() => 0);
  const offStands = track.hasElevation ? riseStandsClear(track, standSide) : () => true;
  const clear = (x, y) => Math.abs(track.offset(x, y)) > half + 20 && beach(x, y) < -40 && shore(x, y) > 5 && !built(x, y, 4) && !paved(x, y, 2) && onBare(x, y) < 4 && offStands(x, y);
  // The real woods and trees (scenery.woods, woods.mjs: OpenStreetMap): each
  // wood filled with trees on a jittered 8 m grid, kept 9 m apart on average
  // up to 150 m from the road and thinning to 20 m apart by 600 m, and the
  // mapped single trees and tree rows; at most MAX_TREES of them, nearest the
  // road first. A tree's kind comes from its leaf type (needleleaved:
  // conifer; broadleaved: broadleaf or palm by the circuit's weights; mixed
  // or not mapped: any kind by them), among the kinds the circuit has. Where OSM maps fewer than MIN_REAL
  // trees, scenery.clusters random clusters of the circuit's kinds are added.
  const MAX_TREES = 6000, MIN_REAL = 200, real = [];
  const kinds = ['conifer', 'broadleaf', 'palm'], weight = kinds.map(k => scenery.trees[k] ?? 0), sum = weight.reduce((a, b) => a + b, 0) || 1;
  const kindOf = v => { let acc = 0; for (let k = 0; k < kinds.length; k++) if (v < (acc += weight[k] / sum)) return k; return kinds.length - 1; };
  const leafKind = (leaf, v) => leaf === 2 && weight[0] ? 0 : leaf === 1 && weight[1] + weight[2] ? (v * (weight[1] + weight[2]) < weight[1] ? 1 : 2) : kindOf(v);
  if (scenery.woods) {
    const roadDist = terrainHeight.dist ?? ((x, y) => Math.abs(track.offset(x, y))), g = 8, taken = new Set();
    for (const [leaf, ...flat] of scenery.woods.woods) {
      const rings = flat.map(r => Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i], r[2 * i + 1]]));
      const xs = rings[0].map(p => p[0]), ys = rings[0].map(p => p[1]);
      for (let gx = Math.floor(Math.min(...xs) / g); gx * g <= Math.max(...xs); gx++) for (let gy = Math.floor(Math.min(...ys) / g); gy * g <= Math.max(...ys); gy++) {
        const x = (gx + rng()) * g, y = (gy + rng()) * g, keep = rng(), cellKey = gx * 65536 + gy;
        if (taken.has(cellKey)) continue;
        let inWood = false;
        for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) inWood = !inWood;
        if (!inWood) continue;
        const d = roadDist(x, y), apart = d < 150 ? 9 : Math.min(20, 9 + (d - 150) * 11 / 450);
        if (keep > (g / apart) ** 2 || !clear(x, y)) continue;
        taken.add(cellKey); real.push([x, y, leaf, d]);
      }
    }
    const { trees } = scenery.woods;
    for (let k = 0; k < trees.length; k += 3) if (clear(trees[k], trees[k + 1])) real.push([trees[k], trees[k + 1], trees[k + 2], roadDist(trees[k], trees[k + 1])]);
    real.sort((a, b) => a[3] - b[3]).splice(MAX_TREES);
  }
  const spots = [];
  for (const [x, y, leaf] of real) { const v = rng(); spots.push([x, y, 0.75 + rng() * 0.6, rng() * Math.PI * 2, v, leafKind(leaf, v), true]); }
  if (real.length < MIN_REAL) for (let tries = 0; spots.length < scenery.clusters * 3 && tries < scenery.clusters * 2; tries++) {
    const tx = cx + (rng() - 0.5) * (maxX - minX + 300), ty = cy + (rng() - 0.5) * (maxY - minY + 300), m = 3 + Math.floor(rng() * 9);
    for (let i = 0; i < m; i++) {
      const x = tx + (rng() - 0.5) * 40, y = ty + (rng() - 0.5) * 40;
      if (clear(x, y)) { const v = rng(); spots.push([x, y, 0.75 + rng() * 0.6, rng() * Math.PI * 2, v, kindOf(v)]); }
    }
  }
  world.add(...plantTrees(spots, (x, y) => terrainHeight(x, y) - 0.2, rng, scenery.trees));
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
  // Away from the road: the real ground (scenery.terrain, terrain.mjs) where
  // it is known; otherwise the road's height fading out over 150-700 m,
  // rolling ground and hills rising towards the horizon. Then the lake.
  const real = scenery.terrain ? terrainField(scenery.terrain) : null;
  const far = (x, y) => {
    const d = bilinear(dist, x, y), r = Math.hypot(x - cx, y - cy), th = Math.atan2(y - cy, x - cx);
    let h = real ? real(x, y) : bilinear(base, x, y) * (1 - smooth(150, 700, d))
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
      // (Our sea level is the lowest road − 3 m, not the real one: real
      // low-lying land stays above it.)
      else if (real) h = Math.max(h, seaLevel + 0.6);
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
  // Colours (scenery.ground): grass patched with dry grass, then the real
  // land cover (scenery.landcover, landcover.mjs: farmland in a patchwork of
  // crop, stubble and ploughed tones, mown grass, scrub, sand, gravel, paved
  // ground), bare soil where natural ground is steep (red laterite by the
  // lake), sand along the shore and mud under the water.
  const { ground: tone } = scenery;
  const grass = new THREE.Color(tone.grass), dry = new THREE.Color(tone.dry), laterite = new THREE.Color(lake !== null ? 0xa4532e : tone.soil), sand = new THREE.Color(0xb9a57a), mud = new THREE.Color(0x5b5040);
  const cover = scenery.landcover ? landcoverField(scenery.landcover) : null;
  const covered = new Array(7).fill(0), COVER = [0, 0x8f8b4e, 0x5e8f3e, 0x56633a, 0xd2bf8e, 0x9e988c, 0x5d5e60].map(v => new THREE.Color(v)), crop = new THREE.Color(0x6e8c3a), ploughed = new THREE.Color(0x7a6448), tint = new THREE.Color();
  const col = new Float32Array(N * 3), c = new THREE.Color(), nrm = geo.attributes.normal;
  for (let k = 0; k < N; k++) {
    const x = pos[3 * k], h = pos[3 * k + 1], z = pos[3 * k + 2];
    c.copy(grass).lerp(dry, smooth(-0.2, 0.8, Math.sin(x * 0.0041 + 1.7) * Math.cos(z * 0.0053 - 0.6) + 0.3 * Math.sin((x + z) * 0.017)));
    const kind = cover ? cover(x, -z) : 0;
    covered[kind]++;
    if (kind) {
      tint.copy(COVER[kind]);
      if (kind === 1) { const f = Math.sin(x * 0.021 + 0.4) * Math.cos(z * 0.017 + 1.1) + 0.5 * Math.sin((x - z) * 0.009); tint.lerp(f > 0.4 ? crop : ploughed, f > 0.4 ? 0.8 : smooth(-0.2, -0.8, f) * 0.8); }
      c.lerp(tint, 0.85);
    }
    if (kind < 5) c.lerp(laterite, smooth(0.06, 0.2, 1 - nrm.getY(k)));
    if (water !== null) c.lerp(sand, smooth(water + 3.5, water + 1, h)).lerp(mud, smooth(water, water - 1.5, h));
    if (wf.list.length) { const sd = wf.sd(x, -z, 8); if (sd < 8) c.lerp(sand, smooth(6, 1, sd) * 0.7).lerp(mud, smooth(0, -2, sd)); }
    col.set([c.r, c.g, c.b], 3 * k);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = texture(256, (g, s) => noise(g, s, '#d4d4d4', 0.45, 14000));
  const groundMat = new THREE.MeshStandardMaterial({ map: detail, vertexColors: true, roughness: 1 });
  // RISE's night: floodlight spill on the ground, fading from 5 to 160 m off
  // the centreline (per vertex: emissive x ground colour x spill), and only
  // the band around the circuit catches the light: the ground's colour x
  // 0.06 + 0.9 x smoothstep(320, 50, distance) at night (uNight).
  if (lake !== null) {
    const spill = new Float32Array(N), fade = new Float32Array(N);
    for (let k = 0; k < N; k++) { const d = bilinear(dist, pos[3 * k], -pos[3 * k + 2]); spill[k] = smooth(160, 5, d); fade[k] = 0.06 + 0.9 * smooth(320, 50, d); }
    geo.setAttribute('flood', new THREE.BufferAttribute(spill, 1)); geo.setAttribute('nightFade', new THREE.BufferAttribute(fade, 1));
    nightGlow(groundMat, 0xffffff, 0.17, { useMap: true });
    groundMat.userData.uNight = { value: 0 };
    groundMat.onBeforeCompile = sh => {
      sh.uniforms.uNight = groundMat.userData.uNight;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float flood, nightFade;\nvarying float vFlood, vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlood = flood; vFade = nightFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFlood, vFade;\nuniform float uNight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, vFade, uNight);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb * vFlood;');
    };
  }
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true; ground.userData = { kind: 'ground', covered }; world.add(ground);
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
  height.seaLevel = seaLevel;
  height.water = wf.list.length ? wf.sd : null;
  height.cover = cover;
  // The ground mesh's own height at (x, y): linear over the triangle of its
  // grid cell that holds it (each cell split along its (i, j-1)–(i-1, j)
  // diagonal), so what lies on it follows its facets.
  const cellOf = (v, a) => { let lo = 0, hi = v.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (v[m] <= a) lo = m; else hi = m; } return lo; };
  height.mesh = (x, y) => {
    const i = cellOf(ax, x), j = cellOf(ay, y), fx = Math.max(0, Math.min(1, (x - ax[i]) / (ax[i + 1] - ax[i]))), fy = Math.max(0, Math.min(1, (y - ay[j]) / (ay[j + 1] - ay[j])));
    const hAt = (u, v) => pos[3 * ((j + v) * W + i + u) + 1], a = hAt(0, 0), b = hAt(1, 0), c = hAt(0, 1), d = hAt(1, 1);
    return fx + fy <= 1 ? a + (b - a) * fx + (c - a) * fy : d + (c - d) * (1 - fx) + (b - d) * (1 - fy);
  };
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

// Broadleaf crown lobes [x, y, z, radius] (m, tree base at the origin).
const BROADLEAF_LOBES = [[0, 6.8, 0, 2.6], [1.6, 6.0, 0.4, 1.9], [-1.5, 6.2, -0.5, 2.0], [0.3, 6.1, 1.6, 1.8], [-0.4, 5.9, -1.6, 1.8], [0.2, 8.4, 0.1, 1.8], [1.1, 7.7, -1.0, 1.5],
  [-1.4, 7.6, 1.1, 1.5], [1.5, 7.4, 1.4, 1.3], [-1.2, 8.0, -1.2, 1.3]];

// Instanced trees at spots [x, y, scale, rotation, species pick] on groundAt(x, y):
// per species the solid body and its leaf-card fringe, sharing matrices and tints.
// trees: the kinds' weights; each spot's kind from its random draw t[4] against
// the cumulative weights. Palms have no leaf-card fringe.
function plantTrees(spots, groundAt, rng, trees = { conifer: 0.45, broadleaf: 0.55 }) {
  const dummy = new THREE.Object3D(), bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const fringeMat = new THREE.MeshStandardMaterial({ map: leafCardTexture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const kinds = ['conifer', 'broadleaf', 'palm'], weight = kinds.map(k => trees[k] ?? 0), sum = weight.reduce((a, b) => a + b, 0) || 1;
  const kindOf = v => { let acc = 0; for (let k = 0; k < kinds.length; k++) if (v < (acc += weight[k] / sum)) return k; return kinds.length - 1; };
  return kinds.flatMap((kind, k) => {
    const list = spots.filter(t => (t[5] ?? kindOf(t[4])) === k);
    if (!list.length) return [];
    const body = new THREE.InstancedMesh(treeGeometry(kind), bodyMat, list.length), fringe = kind === 'palm' ? null : new THREE.InstancedMesh(treeFringe(kind), fringeMat, list.length);
    list.forEach(([x, y, sc, rot, v], i) => {
      dummy.position.set(x, groundAt(x, y), -y); dummy.rotation.set(0, rot, 0); dummy.scale.set(sc, sc * (0.85 + v * 0.3), sc);
      dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix); fringe?.setMatrixAt(i, dummy.matrix);
      const tint = 0.8 + rng() * 0.35, c = new THREE.Color(tint * (0.95 + rng() * 0.15), tint, tint * (0.85 + rng() * 0.15));
      body.setColorAt(i, c); fringe?.setColorAt(i, c);
    });
    body.userData = { kind: 'trees', species: kind, real: list.filter(t => t[6]).length };
    const meshes = fringe ? [body, fringe] : [body];
    for (const m of meshes) m.castShadow = m.receiveShadow = true;
    return meshes;
  });
}

// Leaf-card atlas, two cells across on a transparent background: a ragged
// clump of broad leaves (left) and a drooping fir spray (right), drawn pale so
// the cards' vertex colours set the hue.
function leafCardTexture() {
  const t = texture(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const leafy = (l) => `hsl(${80 + rnd() * 30}, ${18 + rnd() * 22}%, ${l}%)`;
    // Broad leaves: twigs, then leaves from the shaded inside out to the ragged, brighter rim.
    const cx = s / 4, cy = s / 2;
    g.strokeStyle = 'rgba(70,55,40,1)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const a = rnd() * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2); g.stroke(); }
    for (let i = 0, n = 420; i < n; i++) {
      const f = i / n, a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6 - f * 0.2) * s * 0.22 * (0.75 + 0.25 * Math.sin(a * 5 + 1)), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      g.fillStyle = leafy(Math.round(58 + f * 30 - (y - cy) / s * 30 + rnd() * 8));
      g.save(); g.translate(x, y); g.rotate(a + (rnd() - 0.5) * 1.4);
      g.beginPath(); g.ellipse(0, 0, 5 + rnd() * 6, 2.5 + rnd() * 2.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // Fir spray: a stem with drooping side shoots, all covered in needles.
    const ox = s * 0.75, top = s * 0.12, bot = s * 0.88;
    for (let i = 0; i < 18; i++) {
      const y0 = top + (bot - top) * i / 18, len = s * 0.2 * (0.45 + 0.55 * Math.sin(Math.PI * (i + 1) / 19));
      for (const side of [-1, 1]) {
        const x1 = ox + side * len, y1 = y0 + len * 0.45;
        for (let k = 0; k < 14; k++) {
          const t = k / 14, px = ox + (x1 - ox) * t, py = y0 + (y1 - y0) * t * t;
          g.strokeStyle = leafy(Math.round(55 + rnd() * 30)); g.lineWidth = 1.6;
          for (const d of [-1, 1]) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + side * 3 + d * 2, py + 5 + rnd() * 3); g.stroke(); }
        }
      }
    }
    g.strokeStyle = 'rgba(80,62,45,1)'; g.lineWidth = 2; g.beginPath(); g.moveTo(ox, top); g.lineTo(ox, bot); g.stroke();
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Alpha-cut leaf cards over a circuit tree's crown (seeded, the same for every
// build of a species): a ragged, see-through fringe of foliage on the outside
// of the solid crown, so its silhouette breaks up into leaves and sprays.
function treeFringe(kind) {
  let seed = kind === 'conifer' ? 31 : 47;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pos = [], nor = [], uvs = [], col = [], up = new THREE.Vector3(0, 1, 0);
  const [u0, u1] = kind === 'conifer' ? [0.51, 0.99] : [0.01, 0.49];
  // A square card of half-size s at p facing n (spun at random in its plane);
  // normals point out of the crown from center so it shades as one volume.
  const card = (p, n, s, center, color, crown) => {
    const t1 = up.clone().cross(n); if (t1.lengthSq() < 0.01) t1.set(1, 0, 0); t1.normalize();
    const t2 = n.clone().cross(t1), rot = rnd() * Math.PI, a = t1.multiplyScalar(Math.cos(rot)).addScaledVector(t2, Math.sin(rot)), b = n.clone().cross(a).normalize();
    const sn = p.clone().sub(center).normalize().lerp(up, 0.25).normalize();
    const shade = (0.5 + 0.55 * Math.min(1, Math.max(0, (p.y - crown[0]) / (crown[1] - crown[0])))) * (0.95 + 0.15 * rnd());
    for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      const q = p.clone().addScaledVector(a, cu * s).addScaledVector(b, cv * s);
      pos.push(q.x, q.y, q.z); nor.push(sn.x, sn.y, sn.z); uvs.push(cu < 0 ? u0 : u1, cv < 0 ? 0.01 : 0.99);
      col.push(color.r * shade, color.g * shade, color.b * shade);
    }
  };
  const jitter = (v, k) => v.add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(k)).normalize();
  if (kind === 'conifer') {
    const green = new THREE.Color(0x1f4a2b).multiplyScalar(2), c = new THREE.Vector3(0, 7, 0);
    for (let i = 0; i < 6; i++) {
      const r = 2.8 * (1 - i * 0.15), h = 3.3 - i * 0.2, y = 2.5 + i * 1.5 + 1.6;
      // Sprays hanging off the tier's rim, and a few more up its slope.
      for (let j = 0, m = 13 - i; j < m; j++) {
        const a = (j + rnd()) / m * Math.PI * 2, rr = r * (0.85 + rnd() * 0.2);
        card(new THREE.Vector3(Math.cos(a) * rr, y - h / 2 + 0.3 + rnd() * 0.3, Math.sin(a) * rr), jitter(new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)), 0.5), 0.55 + r * 0.22, c, green, [2.2, 12.5]);
      }
      for (let j = 0, m = 7 - i; j < m; j++) {
        const a = rnd() * Math.PI * 2, f = 0.35 + rnd() * 0.3;
        card(new THREE.Vector3(Math.cos(a) * r * f * 1.05, y + h / 2 - h * f, Math.sin(a) * r * f * 1.05), jitter(new THREE.Vector3(Math.cos(a), 0.8, Math.sin(a)), 0.5), 0.45 + r * 0.15, c, green, [2.2, 12.5]);
      }
    }
  } else {
    const leaf = new THREE.Color(0x3d6a2c).multiplyScalar(1.5), c = new THREE.Vector3(0, 6.6, 0);
    for (const lobe of BROADLEAF_LOBES) {
      const [x, y, z, r] = lobe;
      for (let k = 0; k < 20; k++) {
        const d = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
        if (d.lengthSq() < 0.01) continue;
        d.normalize();
        const p = new THREE.Vector3(x, y, z).addScaledVector(d, r * (0.95 + rnd() * 0.2));
        if (BROADLEAF_LOBES.some(b => b !== lobe && Math.hypot(p.x - b[0], p.y - b[1], p.z - b[2]) < b[3] * 0.85)) continue;
        card(p, jitter(d.clone(), 0.9), 0.8 + rnd() * 0.6, c, leaf, [4.2, 9.8]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

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
  // Seeded so every build of a species is identical.
  let seed = kind === 'conifer' ? 11 : 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (kind === 'conifer') {
    add(new THREE.CylinderGeometry(0.16, 0.3, 4, 7).translate(0, 2, 0), bark);
    const green = new THREE.Color(0x1f4a2b), top = 12.5, c = new THREE.Vector3(0, 7, 0);
    for (let i = 0; i < 6; i++) {
      const r = 2.8 * (1 - i * 0.15), h = 3.3 - i * 0.2, y = 2.5 + i * 1.5 + 1.6;
      add(new THREE.ConeGeometry(r, h, 13, 2).translate(0, y, 0), green, c, [2.2, top], 0.35);
      // Drooping branch tips around each tier's rim break up the smooth cone edge.
      const tips = 11 - i;
      for (let j = 0; j < tips; j++) {
        const a = (j + rnd() * 0.6) / tips * Math.PI * 2, rr = r * (0.82 + rnd() * 0.18), len = 0.9 + r * 0.25;
        const tip = new THREE.ConeGeometry(0.32 + r * 0.06, len, 4).rotateZ(-Math.PI / 2 - 0.4 - rnd() * 0.25).rotateY(-a)
          .translate(Math.cos(a) * rr, y - h / 2 + 0.35 + rnd() * 0.25, Math.sin(a) * rr);
        add(tip, green, c, [2.2, top], 0);
      }
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
    add(new THREE.CylinderGeometry(0.06, 0.12, 2.0, 5).rotateX(0.75).rotateY(-0.8).translate(0.3, 4.4, -0.7), bark);
    const leaf = new THREE.Color(0x3d6a2c), c = new THREE.Vector3(0, 6.6, 0), blobs = BROADLEAF_LOBES;
    for (const [x, y, z, r] of blobs) add(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), leaf, c, [4.2, 9.8], 0.45);
    // Leaf clusters on the exposed surface of the lobes: a ragged, clumpy outline instead of smooth balls.
    for (const lobe of blobs) {
      const [x, y, z, r] = lobe;
      for (let k = 0; k < 7; k++) {
        const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const px = x + s * Math.cos(t) * r * 1.02, py = y + u * r * 1.02, pz = z + s * Math.sin(t) * r * 1.02;
        if (blobs.some(b => b !== lobe && Math.hypot(px - b[0], py - b[1], pz - b[2]) < b[3] * 0.9)) continue;
        const tr = 0.55 + rnd() * 0.45;
        add(new THREE.IcosahedronGeometry(tr, 0).scale(1 + rnd() * 0.4, 0.7 + rnd() * 0.3, 1 + rnd() * 0.4).rotateY(rnd() * 6.3).translate(px, py, pz), leaf, c, [4.2, 9.8], 0);
      }
    }
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
