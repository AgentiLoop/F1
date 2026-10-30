// Start-straight buildings for a circuit with terrain (the RISE Motordrome),
// after the RISE sim's js/scenery.js: four 30-row grandstands under white
// membrane roofs (rounded ends, scalloped edges, soft pillows) across the
// straight from the pits, and one long pit building with garage doors below a
// glazed band and a roof terrace over the pit lane, bent along the straight.
// Our own WebGL code (canvas textures instead of the sim's WebGPU node
// shaders). Physics (x, y) maps to world (x, h, -y); centreline offsets are
// + to the right of the race direction.
import * as THREE from '../vendor/three.module.js';
import { nightGlow } from './sky.mjs';

const ROWS = 30, TREAD = 0.82, RISE = 0.52, BASE = 2.4, STAND_LEN = 112, DEPTH = ROWS * TREAD, FOOT = 6;
const STAND_CENTRES = [-185, -62, 62, 186];
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// Where the grandstands go: [{ s, front }] on `side` (+1 right of the race
// direction), front edge 6 m behind the barrier; a stand is left out where any
// corner of its footprint comes within 3 m of a barrier.
export function riseStandPlan(track, side) {
  const front = track.wallOffset + 6, clear = track.wallOffset + 3;
  return STAND_CENTRES.map(s => ({ s, front })).filter(({ s }) => [-STAND_LEN / 2, 0, STAND_LEN / 2].every(dz =>
    [front, front + DEPTH + 1.2].every(f => { const [x, y] = track.point(s + dz, side * f); return Math.abs(track.offset(x, y)) > clear; })));
}

// The pit building's extent [s0, s1] in signed lap progress: 60 m before the
// first box to 60 m past the last, kept inside the pit lane.
export function pitBuildingSpan(pit, boxes) {
  return [Math.max(pit.entry + 60, pit.boxStart - 60), Math.min(pit.exit - 30, pit.boxStart + pit.boxSpacing * (boxes - 1) + 60)];
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Spectators for the risers: four bands of 32 seats (0.55 m each), people in
// the sim's shirt colours, about one seat in eight empty.
function crowdTexture() {
  const rnd = mulberry(7);
  return canvasTexture(1024, 256, (g, w, h) => {
    const bh = h / 4, sw = w / 32;
    const shirts = ['#d2ccbd', '#0066b8', '#ebbf0a', '#1a6b33', '#b31f14', '#e8e6e0', '#0a4f8f'];
    for (let b = 0; b < 4; b++) for (let i = 0; i < 32; i++) {
      const x = i * sw, y = b * bh;
      g.fillStyle = '#75331c'; g.fillRect(x, y, sw, bh);
      g.fillStyle = '#5a2614'; g.fillRect(x, y + bh * 0.7, sw, bh * 0.3);
      if (rnd() < 0.12) continue;
      g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
      g.fillRect(x + sw * 0.12, y + bh * 0.42, sw * 0.76, bh * 0.58);
      const k = rnd(); g.fillStyle = `rgb(${Math.round(51 + k * 56)},${Math.round(31 + k * 40)},${Math.round(18 + k * 28)})`;
      g.beginPath(); g.ellipse(x + sw / 2, y + bh * 0.24, sw * 0.22, bh * 0.17, 0, 0, Math.PI * 2); g.fill();
    }
  });
}

// One 14 m bay of the pit building's front, 17 m tall (2 m below ground):
// garage door, then a glazed band split by a floor slab, white elsewhere.
function facadeTextures(height, foot) {
  const H = height + foot, py = m => (H - (m + foot)) / H * 256, px = m => m / 14 * 256;
  const paint = lit => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = lit ? '#000' : '#dbdbd6'; g.fillRect(0, 0, w, 256);
    g.fillStyle = lit ? '#5a5650' : '#292b30'; g.fillRect(px(1.7), py(5.2), px(10.6), py(0) - py(5.2));
    if (!lit) {
      const glass = g.createLinearGradient(0, py(13.2), 0, py(6.4)); glass.addColorStop(0, '#1c2731'); glass.addColorStop(1, '#0a1219');
      g.fillStyle = glass; g.fillRect(0, py(13.2), w, py(10.1) - py(13.2)); g.fillRect(0, py(9.5), w, py(6.4) - py(9.5));
      g.fillStyle = '#dbdbd6'; for (let k = 0; k < 6; k++) g.fillRect(px(k * 14 / 6), py(13.2), 3, py(6.4) - py(13.2));
    }
  });
  return [paint(false), paint(true)];
}

// The sim's membrane roof: len along z, wid across x, `lobes` pillows.
function puffyRoof(len, wid, lobes) {
  const geo = new THREE.PlaneGeometry(1, 1, 80, 24), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5, v = pos.getY(i) + 0.5;
    const ends = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 6)), 0.5);
    const scallop = 1 - 0.13 * Math.pow(Math.abs(Math.sin(u * Math.PI * lobes)), 0.6);
    const dome = (1 - Math.pow(2 * v - 1, 2)) * (1 - Math.pow(2 * u - 1, 8)) * 3.2;
    const pillow = Math.pow(Math.abs(Math.sin(u * Math.PI * lobes * 1.5)) * Math.abs(Math.sin(v * Math.PI * 2)), 0.6) * 1.1;
    pos.setXYZ(i, (v - 0.5) * wid * ends * scallop, dome + pillow - (1 - ends) * 1.5, (u - 0.5) * len);
  }
  geo.computeVertexNormals();
  return geo;
}

// Stand body (stepped profile extruded along z, local x away from the track)
// and the spectators on its risers, facing -x.
function standGeometries() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -FOOT); shape.lineTo(0, BASE);
  for (let r = 0; r < ROWS; r++) { shape.lineTo(r * TREAD, BASE + r * RISE); shape.lineTo((r + 1) * TREAD, BASE + r * RISE); }
  shape.lineTo(DEPTH + 1.2, BASE + ROWS * RISE); shape.lineTo(DEPTH + 1.2, -FOOT); shape.lineTo(0, -FOOT);
  const body = new THREE.ExtrudeGeometry(shape, { depth: STAND_LEN, bevelEnabled: false, steps: 1 });
  body.translate(0, 0, -STAND_LEN / 2);
  const p = [], uv = [], idx = [], rnd = mulberry(3), reps = STAND_LEN / (32 * 0.55), z0 = -STAND_LEN / 2, z1 = STAND_LEN / 2;
  for (let r = 1; r < ROWS; r++) {
    const x = r * TREAD - 0.02, y0 = BASE + (r - 1) * RISE, y1 = y0 + RISE, u = rnd(), b = (r % 4) / 4, k = p.length / 3;
    p.push(x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0);
    uv.push(u, 1 - b - 0.25, u + reps, 1 - b - 0.25, u + reps, 1 - b, u, 1 - b);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const crowd = new THREE.BufferGeometry();
  crowd.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  crowd.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  crowd.setIndex(idx); crowd.computeVertexNormals();
  return { body, crowd };
}

// Adds the grandstands (on `standSide`) and, when `pitBoxes` > 0, the pit
// building to `world`. ground(x, y) is the terrain height; logoMat is the
// branding for the sign on the pit building's roof edge.
export function buildRiseStands(world, track, { ground, standSide, pitBoxes = 0, logoMat = null }) {
  const group = new THREE.Group(); group.name = 'rise-stands'; world.add(group);
  const out = { stands: 0, pitBuilding: null };
  if (standSide) {
    const { body, crowd } = standGeometries();
    const concrete = new THREE.MeshStandardMaterial({ color: 0xa39e94, roughness: 0.9 });
    const crowdMat = nightGlow(new THREE.MeshStandardMaterial({ map: crowdTexture(), roughness: 0.9 }), 0xffffff, 0.22, { useMap: true });
    const roofMat = nightGlow(new THREE.MeshStandardMaterial({ color: 0xebebe6, roughness: 0.65, side: THREE.DoubleSide }), 0xf2edd9, 0.28);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.6, metalness: 0.3 });
    const roof = puffyRoof(STAND_LEN + 6, DEPTH + 9, 6), top = BASE + ROWS * RISE;
    roof.translate(DEPTH / 2 - 1, top + 6.5, 0);
    const column = new THREE.CylinderGeometry(0.35, 0.5, top + 13, 8);
    const up = new THREE.Vector3(0, 1, 0), away = new THREE.Vector3(), along = new THREE.Vector3();
    for (const { s, front } of riseStandPlan(track, standSide)) {
      const h = track.heading(s), [x, y] = track.point(s, standSide * front);
      // local x away from the track, y up, z = x × y
      away.set(Math.sin(h), 0, Math.cos(h)).multiplyScalar(standSide); along.crossVectors(away, up);
      const stand = new THREE.Group();
      // pitched to the ground's fall along its front edge
      const end = k => { const ex = x + along.x * k * STAND_LEN / 2, ey = y - along.z * k * STAND_LEN / 2; return ground(ex, ey); };
      const lo = end(-1), hi = end(1);
      stand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(away, up, along))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(hi - lo, STAND_LEN)));
      stand.position.set(x, (lo + hi) / 2 - 0.2, -y);
      const parts = [new THREE.Mesh(body, concrete), new THREE.Mesh(crowd, crowdMat), new THREE.Mesh(roof, roofMat)];
      for (const z of [-STAND_LEN * 0.36, 0, STAND_LEN * 0.36]) { const c = new THREE.Mesh(column, colMat); c.position.set(DEPTH + 0.6, (top + 13) / 2 - FOOT, z); parts.push(c); }
      for (const m of parts) { m.castShadow = true; m.receiveShadow = true; stand.add(m); }
      group.add(stand); out.stands++;
    }
  }
  const pit = track.pit;
  if (pit && pitBoxes > 0) {
    const [s0, s1] = pitBuildingSpan(pit, pitBoxes), len = s1 - s0, sMid = (s0 + s1) / 2;
    const depth = 20, height = 15, foot = 2, front = track.wallOffset + 1, dir = -pit.side;
    const seg = l => Math.ceil(l / 4);
    // Bend a box laid out in pit-frame metres (x out from the garage line,
    // y up from the ground there, z along the lap) onto the straight.
    const alongPits = geo => {
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const s = sMid + pit.side * pos.getZ(k), [gx, gy] = track.point(s, dir * front), [x, y] = track.point(s, dir * (front + pos.getX(k)));
        pos.setXYZ(k, x, ground(gx, gy) + pos.getY(k), -y);
      }
      geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
      return geo;
    };
    const geo = new THREE.BoxGeometry(depth, height + foot, len, 1, 1, seg(len));
    geo.translate(depth / 2, (height - foot) / 2, 0);
    const [facade, glow] = facadeTextures(height, foot);
    facade.repeat.set(len / 14, 1); glow.repeat.set(len / 14, 1);
    const white = new THREE.MeshStandardMaterial({ color: 0xd6d6d2, roughness: 0.5 });
    const frontMat = nightGlow(new THREE.MeshStandardMaterial({ map: facade, emissiveMap: glow, roughness: 0.4, metalness: 0.15 }), 0xfff4e0, 1, { day: 0.35 });
    // BoxGeometry faces: +x, -x (the front, towards the track), +y, -y, +z, -z
    const building = new THREE.Mesh(alongPits(geo), [white, frontMat, white, white, white, white]);
    building.name = 'pit-building';
    const slabGeo = new THREE.BoxGeometry(depth + 9, 0.8, len + 6, 1, 1, seg(len + 6));
    slabGeo.translate(depth / 2 - 3.5, height + 0.4, 0);
    const slab = new THREE.Mesh(alongPits(slabGeo), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 }));
    for (const m of [building, slab]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
    if (logoMat) {
      const w = 32, hgt = w / 8, y = height + 0.8 + 0.25 + hgt / 2;
      const signGeo = new THREE.PlaneGeometry(w, hgt, 8, 1); signGeo.rotateY(-Math.PI / 2); signGeo.translate(-7.4, y, 0);
      const backGeo = new THREE.BoxGeometry(0.25, hgt + 0.2, w + 0.3, 1, 1, 8); backGeo.translate(-7.25, y, 0);
      const back = new THREE.Mesh(alongPits(backGeo), new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.5, metalness: 0.5 }));
      back.castShadow = true;
      group.add(new THREE.Mesh(alongPits(signGeo), logoMat), back);
    }
    out.pitBuilding = { s0, s1 };
  }
  return out;
}
