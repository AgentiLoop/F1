// Procedural 3D open-wheel car (2022-era layout) built from the physics config,
// so wheelbase, track and wheel radius always match the simulated car.
// Local frame: +x forward, +y up, +z right (physics y-left maps to -z).
// Proportions are illustrative, not a CAD model of any real car.
import * as THREE from './vendor/three.module.js';

const hasDOM = typeof document !== 'undefined';

// Superellipse loft along x. Station: [x, halfWidth, bottom, top, exponent, zCenter].
export function loft(stations, segments = 40) {
  const pos = [], idx = [], ring = segments + 1;
  stations.forEach(([x, w, yb, yt, n = 2.5, zc = 0]) => {
    const cy = (yb + yt) / 2, h = (yt - yb) / 2, e = 2 / n;
    for (let j = 0; j <= segments; j++) {
      const t = (j / segments) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      pos.push(x, cy + h * Math.sign(s) * Math.abs(s) ** e, zc + w * Math.sign(c) * Math.abs(c) ** e);
    }
  });
  // Winding depends on whether stations run toward +x or -x.
  const forward = stations[stations.length - 1][0] > stations[0][0];
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < segments; j++) {
    const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
    forward ? idx.push(a, c, b, b, c, d) : idx.push(a, b, c, b, d, c);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  // Weld the seam normals so the side of the body shows no shading line.
  const nrm = body.attributes.normal;
  for (let i = 0; i < stations.length; i++) {
    const a = i * ring, b = a + segments, v = new THREE.Vector3(
      nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z); nrm.setXYZ(b, v.x, v.y, v.z);
  }
  // Flat end caps with their own vertices.
  const capPos = [], capIdx = [];
  for (const [i, first] of [[0, true], [stations.length - 1, false]]) {
    const base = capPos.length / 3, [x, , yb, yt, , zc = 0] = stations[i];
    capPos.push(x, (yb + yt) / 2, zc);
    for (let j = 0; j <= segments; j++) capPos.push(pos[(i * ring + j) * 3], pos[(i * ring + j) * 3 + 1], pos[(i * ring + j) * 3 + 2]);
    for (let j = 1; j <= segments; j++) first === forward ? capIdx.push(base, base + j, base + j + 1) : capIdx.push(base, base + j + 1, base + j);
  }
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  caps.setIndex(capIdx);
  caps.computeVertexNormals();
  return [body, caps];
}

// Inverted (downforce) NACA 4-digit section, leading edge at origin pointing +x,
// extruded across the span along z and centred.
export function wingElement(chord, span, thickness = 0.1, camber = 0.06) {
  const n = 24, upper = [], lower = [], p = 0.4;
  for (let i = 0; i <= n; i++) {
    const b = (1 - Math.cos(Math.PI * i / n)) / 2;
    const yt = 5 * thickness * (0.2969 * Math.sqrt(b) - 0.126 * b - 0.3516 * b * b + 0.2843 * b ** 3 - 0.1036 * b ** 4);
    const yc = camber * (b < p ? (2 * p * b - b * b) / (p * p) : (1 - 2 * p + 2 * p * b - b * b) / ((1 - p) ** 2));
    upper.push([-b * chord, -(yc + yt) * chord]); lower.push([-b * chord, -(yc - yt) * chord]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(...upper[n]);
  for (let i = n - 1; i >= 0; i--) shape.lineTo(...upper[i]);
  for (let i = 1; i <= n; i++) shape.lineTo(...lower[i]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: span, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -span / 2);
  return g;
}

// Flat plate from a side-profile polygon [[x, y], ...], centred on z.
function plate(points, thickness) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return g;
}

function canvasTexture(size, draw, repeat = 1) {
  if (!hasDOM) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function materials() {
  const weave = canvasTexture(64, (g, s) => {
    for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) {
      const v = ((x + y) / 8) % 2 ? 34 : 22;
      const grad = g.createLinearGradient(x, y, x + 8, y + 8);
      grad.addColorStop(0, `rgb(${v},${v + 2},${v + 5})`); grad.addColorStop(1, `rgb(${v + 12},${v + 14},${v + 18})`);
      g.fillStyle = grad; g.fillRect(x, y, 8, 8);
    }
  }, 6);
  const cover = canvasTexture(256, (g, s) => {
    const c = s / 2;
    g.fillStyle = '#16191d'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#39e0ae'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c * 0.86, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#2b3138';
    for (let i = 0; i < 5; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI * 2 / 5); g.fillRect(-9, c * 0.2, 18, c * 0.6); g.restore(); }
    g.fillStyle = '#e9f0f6'; g.fillRect(c - 6, c * 0.18, 12, c * 0.66);
  });
  const paint = (color) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
  return {
    paint: paint(0x0d2340), accent: paint(0x39e0ae), white: paint(0xe9f0f6),
    carbon: new THREE.MeshPhysicalMaterial({ color: weave ? 0xffffff : 0x1a1c20, map: weave, metalness: 0.25, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.93, side: THREE.DoubleSide }),
    black: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.55, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 1, roughness: 0.28 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x24282d, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
    cover: new THREE.MeshPhysicalMaterial({ color: cover ? 0xffffff : 0x16191d, map: cover, metalness: 0.3, roughness: 0.3, clearcoat: 1, side: THREE.DoubleSide }),
    soft: new THREE.MeshStandardMaterial({ color: 0xe0262b, roughness: 0.6, side: THREE.DoubleSide }),
    plank: new THREE.MeshStandardMaterial({ color: 0x8b6a3e, roughness: 0.8 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xf2bf5e, roughness: 0.25, clearcoat: 1 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: 0.9, roughness: 0.05, clearcoat: 1 }),
    light: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 2 }),
  };
}

export function buildF1Car(config) {
  const M = materials();
  const car = new THREE.Group(); car.name = 'f1-car';
  const add = (geometry, material, parent = car) => {
    const m = new THREE.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const addLoft = (stations, material, segments) => loft(stations, segments).forEach(g => add(g, material));
  const F = config.wheelbase * (1 - config.frontWeight), R = -config.wheelbase * config.frontWeight;
  const T = config.track / 2, rad = config.wheelRadius;

  // Survival cell and nose.
  addLoft([
    [F + 1.11, 0.05, 0.10, 0.19, 2.2], [F + 0.86, 0.09, 0.11, 0.27, 2.4], [F + 0.46, 0.14, 0.13, 0.39, 2.6],
    [F, 0.19, 0.15, 0.50, 2.8], [F - 0.54, 0.25, 0.14, 0.60, 3], [0.85, 0.32, 0.10, 0.66, 3.2],
    [0.30, 0.40, 0.06, 0.66, 3.4], [-0.30, 0.42, 0.05, 0.62, 3.4], [-0.75, 0.38, 0.05, 0.56, 3],
  ], M.paint, 48);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12).rotateZ(Math.PI / 2).translate(F + 1.115, 0.145, 0), M.accent);
  // Sidepods with undercut and coke-bottle taper, mirrored.
  for (const s of [-1, 1]) {
    addLoft([
      [0.62, 0.10, 0.20, 0.50, 4, s * 0.56], [0.45, 0.20, 0.13, 0.56, 4, s * 0.62], [0.0, 0.25, 0.10, 0.56, 3.6, s * 0.62],
      [-0.55, 0.24, 0.09, 0.50, 3.2, s * 0.56], [-1.05, 0.18, 0.09, 0.38, 3, s * 0.45], [-1.45, 0.11, 0.10, 0.27, 2.8, s * 0.33],
      [-1.80, 0.05, 0.11, 0.18, 2.5, s * 0.22],
    ], M.paint);
    const inlet = add(new THREE.CircleGeometry(1, 32), M.black);
    inlet.scale.set(0.085, 0.13, 1); inlet.rotation.y = Math.PI / 2; inlet.position.set(0.625, 0.35, s * 0.56);
    // Accent stripe along the sidepod shoulder.
    add(new THREE.BoxGeometry(1.1, 0.02, 0.05), M.accent).position.set(-0.1, 0.565, s * 0.6);
    // Mirror on a stalk.
    add(new THREE.BoxGeometry(0.05, 0.06, 0.13), M.paint).position.set(0.22, 0.76, s * 0.52);
    add(new THREE.BoxGeometry(0.03, 0.02, 0.16), M.carbon).position.set(0.22, 0.72, s * 0.42);
    add(new THREE.PlaneGeometry(0.11, 0.045).rotateY(-Math.PI / 2), M.visor).position.set(0.194, 0.76, s * 0.52);
  }
  // Engine cover, airbox and fin.
  addLoft([
    [-0.33, 0.12, 0.76, 0.93, 2.4], [-0.62, 0.17, 0.62, 0.93, 2.6], [-1.0, 0.27, 0.30, 0.84, 2.8],
    [-1.45, 0.22, 0.20, 0.64, 2.8], [-1.9, 0.12, 0.20, 0.47, 2.6], [-2.22, 0.05, 0.25, 0.37, 2.2],
  ], M.paint);
  const intake = add(new THREE.CircleGeometry(1, 32), M.black);
  intake.scale.set(0.09, 0.065, 1); intake.rotation.y = Math.PI / 2; intake.position.set(-0.325, 0.845, 0);
  add(plate([[-0.7, 0.93], [-1.55, 0.72], [-2.02, 0.62], [-2.02, 0.5], [-1.1, 0.76]], 0.008), M.accent);
  add(new THREE.BoxGeometry(0.1, 0.02, 0.09), M.black).position.set(-0.45, 0.945, 0); // T-camera
  // Cockpit, driver and halo.
  const opening = add(new THREE.CircleGeometry(1, 40), M.black);
  opening.scale.set(0.42, 0.25, 1); opening.rotation.x = -Math.PI / 2; opening.position.set(-0.08, 0.668, 0);
  const helmet = add(new THREE.SphereGeometry(0.125, 32, 20), M.helmet); helmet.scale.set(1.1, 1, 0.95); helmet.position.set(-0.24, 0.73, 0);
  const visor = add(new THREE.SphereGeometry(0.127, 32, 12, -0.9, 1.8, 1.2, 0.45), M.visor);
  visor.scale.set(1.1, 1, 0.95); visor.rotation.y = Math.PI / 2; visor.position.copy(helmet.position);
  add(new THREE.BoxGeometry(0.22, 0.09, 0.5), M.black).position.set(-0.42, 0.66, 0); // headrest
  const halo = new THREE.CatmullRomCurve3([[-0.56, 0.62, -0.3], [-0.48, 0.86, -0.3], [-0.05, 0.9, -0.27], [0.22, 0.88, -0.1],
    [0.25, 0.88, 0], [0.22, 0.88, 0.1], [-0.05, 0.9, 0.27], [-0.48, 0.86, 0.3], [-0.56, 0.62, 0.3]].map(p => new THREE.Vector3(...p)));
  add(new THREE.TubeGeometry(halo, 64, 0.024, 12), M.paint);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.25, 0.88, 0), new THREE.Vector3(0.36, 0.8, 0),
    new THREE.Vector3(0.46, 0.67, 0)]), 16, 0.022, 10), M.paint);

  // Floor, plank and diffuser.
  const half = [[F - 0.79, 0.3], [0.75, 0.8], [0.55, 0.95], [R + 0.56, 0.95], [R + 0.40, 0.95], [R + 0.36, 0.56], [R - 0.4, 0.52]];
  const outline = [...half, ...half.slice().reverse().map(([x, z]) => [x, -z])];
  const floor = add(new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z))),
    { depth: 0.02, bevelEnabled: false }).rotateX(Math.PI / 2), M.carbon);
  floor.position.y = 0.055;
  add(new THREE.BoxGeometry(2.6, 0.012, 0.3), M.plank).position.set(-0.3, 0.03, 0);
  const rise = Math.atan2(0.28, 0.8);
  const roof = add(new THREE.BoxGeometry(Math.hypot(0.8, 0.28), 0.012, 1.0), M.carbon);
  roof.rotation.z = -rise; roof.position.set(R - 0.03, 0.18, 0);
  for (const z of [-0.5, -0.17, 0, 0.17, 0.5]) add(plate([[R + 0.37, 0.04], [R - 0.43, 0.04], [R - 0.43, 0.34], [R + 0.37, 0.05]], 0.01), M.carbon).position.z = z;

  // Front wing: four-element cascade, endplates.
  const fw = [[0.30, F + 1.14, 0.075, 4, 1.96], [0.20, F + 0.92, 0.12, 14], [0.16, F + 0.76, 0.17, 24], [0.13, F + 0.64, 0.22, 34]];
  fw.forEach(([chord, x, y, deg, span], i) => {
    const parts = span ? [[0, span]] : [[-0.615, 0.73], [0.615, 0.73]];
    for (const [z, w] of parts) {
      const m = add(wingElement(chord, w), i === 3 ? M.accent : M.carbon);
      m.rotation.z = -deg * Math.PI / 180; m.position.set(x, y, z);
    }
  });
  for (const s of [-1, 1]) add(plate([[F + 1.16, 0.05], [F + 0.5, 0.05], [F + 0.45, 0.33], [F + 0.68, 0.34], [F + 1.06, 0.16], [F + 1.16, 0.12]], 0.015), M.accent).position.z = s * 0.985;

  // Rear wing: main plane + DRS flap, endplates, swan-neck pylons, beam wing, rain light.
  for (const [chord, x, y, deg, span, mat] of [[0.32, R - 0.39, 0.72, 10, 1.0, M.carbon], [0.20, R - 0.61, 0.82, 35, 1.0, M.accent],
    [0.18, R - 0.39, 0.36, 8, 0.84, M.carbon], [0.14, R - 0.54, 0.42, 22, 0.84, M.carbon]]) {
    const m = add(wingElement(chord, span), mat); m.rotation.z = -deg * Math.PI / 180; m.position.set(x, y, 0);
  }
  for (const s of [-1, 1]) {
    add(plate([[R - 0.34, 0.40], [R - 0.36, 0.95], [R - 0.80, 0.95], [R - 0.82, 0.68], [R - 0.62, 0.40]], 0.014), M.paint).position.z = s * 0.505;
    add(plate([[R - 0.45, 0.30], [R - 0.62, 0.30], [R - 0.62, 0.86], [R - 0.52, 0.86]], 0.012), M.carbon).position.z = s * 0.05;
  }
  add(new THREE.BoxGeometry(0.03, 0.06, 0.1), M.light).position.set(R - 0.64, 0.33, 0);

  // Wheels, uprights and wishbones.
  const wheels = [];
  const positions = [[F, -T], [F, T], [R, -T], [R, T]]; // FL, FR, RL, RR (left = -z)
  positions.forEach(([x, z], i) => {
    const front = i < 2, side = Math.sign(z), W = (front ? 0.305 : 0.395) / 2;
    const pivot = new THREE.Group(); pivot.position.set(x, rad, z); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const profile = [[0.226, -W * 0.82], [rad - 0.05, -W], [rad - 0.02, -W * 0.97], [rad - 0.006, -W * 0.88], [rad, -W * 0.72],
      [rad, W * 0.72], [rad - 0.006, W * 0.88], [rad - 0.02, W * 0.97], [rad - 0.05, W], [0.226, W * 0.82]];
    add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 64).rotateX(Math.PI / 2), M.rubber, spin);
    for (const f of [-1, 1]) add(new THREE.RingGeometry(0.268, 0.282, 64).translate(0, 0, f * W * 0.99), M.soft, spin);
    add(new THREE.CylinderGeometry(0.228, 0.228, W * 1.65, 48, 1, true).rotateX(Math.PI / 2), M.rim, spin);
    const cover = add(new THREE.CircleGeometry(0.226, 48), M.cover, spin);
    cover.position.z = side * W * 0.8; if (side < 0) cover.rotation.y = Math.PI;
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 16).rotateX(Math.PI / 2).translate(0, 0, side * W * 0.83), M.accent, spin);
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24).rotateX(Math.PI / 2).translate(0, 0, -side * (W * 0.55)), M.carbon, pivot);
    const inZ = front ? 0.17 : 0.12, outZ = Math.abs(z) - W * 0.6;
    const arms = [
      [[x + 0.28, 0.42, inZ], [x, 0.47, outZ]], [[x - 0.30, 0.45, inZ + 0.03], [x, 0.47, outZ]],
      [[x + 0.32, 0.2, inZ - 0.02], [x, 0.17, outZ]], [[x - 0.35, 0.18, inZ + 0.03], [x, 0.17, outZ]],
      [[x, 0.19, outZ - 0.02], [x - 0.15, 0.55, inZ - 0.02]], [[x + 0.1, 0.3, inZ], [x + 0.1, 0.3, outZ]],
    ];
    for (const [a, b] of arms) {
      const A = new THREE.Vector3(a[0], a[1], side * a[2]), B = new THREE.Vector3(b[0], b[1], side * b[2]);
      const m = add(new THREE.CylinderGeometry(0.014, 0.014, A.distanceTo(B), 8), M.carbon);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    }
    wheels.push({ pivot, spin, front });
  });
  // Sprung body: everything but the wheel assemblies, so it can roll, pitch
  // and heave about the ground-level origin while the tires stay planted.
  const body = new THREE.Group(); body.name = 'sprung-body';
  const pivots = new Set(wheels.map(w => w.pivot));
  car.children.filter(o => !pivots.has(o)).forEach(o => body.add(o));
  car.add(body);
  return { group: car, body, wheels, driver: [helmet, visor] };
}
