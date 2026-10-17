// Three.js circuit scenery for the stadium test track used by the physics
// surface function. Physics (x, y) maps to world (x, 0, -y); y is up.
import * as THREE from './vendor/three.module.js';

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
function ribbon(pts, a, b, y0, material, vScale, y1) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    if (y1 === undefined) pos.push(p.x + p.nx * a, y0, -(p.y + p.ny * a), p.x + p.nx * b, y0, -(p.y + p.ny * b));
    else pos.push(p.x + p.nx * a, y0, -(p.y + p.ny * a), p.x + p.nx * a, y1, -(p.y + p.ny * a));
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

export function buildWorld({ halfStraight, radius, roadWidth }) {
  const world = new THREE.Group();
  const pts = centerline(halfStraight, radius);
  const half = roadWidth / 2;
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

  const asphalt = texture(512, (g, s) => noise(g, s, '#45494d', 0.35, 60000), 3, 1);
  const kerb = texture(64, (g, s) => { g.fillStyle = '#d8dad6'; g.fillRect(0, 0, s, s); g.fillStyle = '#c3302b'; g.fillRect(0, 0, s, s / 2); });
  const wall = texture(128, (g, s) => {
    g.fillStyle = '#c9ccc8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1d3b6e'; g.fillRect(0, 0, s, s * 0.55);
    g.fillStyle = '#e9f0f6'; g.font = `bold ${s * 0.22}px system-ui`; g.fillText('F1 LAB', s * 0.12, s * 0.38);
  });
  const runoff = texture(256, (g, s) => noise(g, s, '#8b8170', 0.3, 20000), 4, 1);
  const road = std({ map: asphalt, roughness: 0.92 });
  world.add(ribbon(pts, -half, half, 0, road, 30));
  for (const s of [-1, 1]) {
    world.add(ribbon(pts, s * half, s * (half + 1.2), 0.012, std({ map: kerb, roughness: 0.7 }), 4));
    world.add(ribbon(pts, s * (half - 0.45), s * (half - 0.2), 0.008, std({ color: 0xf2f2ee, roughness: 0.6 }), 10));
    world.add(ribbon(pts, s * (half + 1.2), s * (half + 8), 0.004, std({ map: runoff, roughness: 1 }), 20));
    const w = ribbon(pts, s * (half + 12), 0, 0, std({ map: wall, roughness: 0.8 }), 6, 1.1);
    w.castShadow = true; world.add(w);
  }
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
  // Grandstands outside the main straight.
  const stand = texture(256, (g, s) => { noise(g, s, '#2c3846', 0.0, 0); for (let i = 0; i < 2500; i++) { g.fillStyle = `hsl(${Math.random() * 360},45%,${35 + Math.random() * 35}%)`; g.fillRect(Math.random() * s, Math.random() * s, 3, 3); } }, 6, 1);
  for (const x of [-140, 0, 140]) {
    for (let r = 0; r < 8; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(110, 1.2, 2), new THREE.MeshStandardMaterial({ map: stand, roughness: 0.9 }));
      step.position.set(x, 0.6 + r * 1.2, radius + half + 18 + r * 2); step.castShadow = step.receiveShadow = true; world.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(114, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.5 }));
    roof.position.set(x, 14, radius + half + 25); roof.castShadow = true; world.add(roof);
  }
  // Trees for depth and speed cues (instanced).
  const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const spots = [];
  while (spots.length < 220) {
    const x = (rng() - 0.5) * 900, y = (rng() - 0.5) * 520;
    const d = Math.abs(Math.hypot(x - Math.max(-halfStraight, Math.min(halfStraight, x)), y) - radius);
    if (d > half + 22 && !(y < -radius - half - 10 && y > -radius - 60 && Math.abs(x) < 210)) spots.push([x, y, 0.7 + rng() * 0.8]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), new THREE.MeshStandardMaterial({ color: 0x5a4030 }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 7, 8), new THREE.MeshStandardMaterial({ color: 0x2d5a2a, roughness: 0.9 }), spots.length);
  const mtx = new THREE.Matrix4();
  spots.forEach(([x, y, k], i) => {
    trunk.setMatrixAt(i, mtx.compose(new THREE.Vector3(x, 1.5 * k, -y), new THREE.Quaternion(), new THREE.Vector3(k, k, k)));
    crown.setMatrixAt(i, mtx.compose(new THREE.Vector3(x, 6 * k, -y), new THREE.Quaternion(), new THREE.Vector3(k, k, k)));
  });
  trunk.castShadow = crown.castShadow = true; world.add(trunk, crown);
  return world;
}
