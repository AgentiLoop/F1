import * as THREE from '../vendor/three.module.js';

// Rubber laid down along the racing line and the painted grid slots, after
// the RISE Motordrome sim's js/trackmesh.js road material: the asphalt darkens
// by 30% times its patchy skid noise (0.5-1.5, so 15-45%) on the line,
// fading out between 0.3 and 1.9 m from it (its lower roughness there is left
// out); behind the
// start line each grid slot has a white line across the front of the car's
// half of the road and two short lines back from its ends.
export const RUBBER_HALF = 1.9;
const STEP = 2, COLS = 9, REPEAT = 256; // m between cross-sections, columns across, m per texture repeat

// Mesh: cross-sections every STEP m centred on the racing line (track.lineOffset,
// + right), just above the road (track.elevation), u across, v along the lap.
export function rubberGeometry(track) {
  const n = Math.round(track.length / STEP), pos = [], uv = [], idx = [];
  for (let r = 0; r <= n; r++) {
    const s = r * track.length / n, line = track.lineOffset(s);
    for (let c = 0; c < COLS; c++) {
      const u = c / (COLS - 1), d = line + (u - 0.5) * 2 * RUBBER_HALF, [x, y] = track.point(s, d);
      pos.push(x, track.elevation(s, d) + 0.006, -y); uv.push(u, s / REPEAT);
      if (r && c) { const k = r * COLS + c; idx.push(k - COLS - 1, k - COLS, k - 1, k - COLS, k, k - 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// How dark the rubber is at u across (0-1) and v metres along: RISE's
// 0.3 × (skid + 0.5) inside smoothstep(1.9, 0.3, |d|).
export function rubberDarkness(u, v) {
  const d = Math.abs((u - 0.5) * 2 * RUBBER_HALF), t = Math.max(0, Math.min(1, (RUBBER_HALF - d) / (RUBBER_HALF - 0.3)));
  const skid = 0.5 + 0.25 * Math.sin(v * 0.08 * 2.1 + 1.3) * Math.cos(v * 0.08 * 0.7) + 0.2 * Math.sin(v * 0.53 + d * 0.9) + 0.05 * Math.sin(v * 2.7 + d * 4.1);
  return t * t * (3 - 2 * t) * 0.3 * (Math.max(0, Math.min(1, skid)) + 0.5);
}

function rubberTexture() {
  const w = 32, h = 1024, data = new Uint8Array(4 * w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = Math.round(255 * rubberDarkness((i + 0.5) / w, (j + 0.5) / h * REPEAT)), k = 4 * (j * w + i);
    data[k] = data[k + 1] = data[k + 2] = a; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h);
  t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// Grid slot marks for `slots` cars at race.mjs's grid (slot k at s = -0.8 - 8k,
// k = 0 on the centreline, odd k 2.6 m left, even k 2.6 m right): a 3.6 m
// line across 2.6 m ahead of the car's centre and 1.4 m side lines back from
// its ends; the pole slot's front is the start line, so it has the side lines only.
export function gridMarks(slots, spacing = 8) {
  const out = [];
  for (let k = 0; k < slots; k++) {
    const s = -0.8 - spacing * k, lane = k === 0 ? 0 : (k % 2 ? -1 : 1) * 2.6, front = k === 0 ? -0.8 : s + 2.6;
    if (k) out.push({ s0: front - 0.11, s1: front + 0.11, d0: lane - 1.8, d1: lane + 1.8 });
    for (const e of [-1.8, 1.8]) out.push({ s0: front - 1.4, s1: front, d0: lane + e - 0.08, d1: lane + e + 0.08 });
  }
  return out;
}

// glow(material): the circuit's night floodlight glow for the grid paint.
export function buildTrackPaint(track, { slots = 0, glow = m => m } = {}) {
  const group = new THREE.Group();
  // Unlit black, so it only darkens (a lit overlay's own sheen brightened the road).
  const rubber = new THREE.Mesh(rubberGeometry(track), new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: rubberTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  rubber.name = 'rubber'; rubber.renderOrder = 1; group.add(rubber);
  if (slots) {
    const pos = [], idx = [], wrap = s => ((s % track.length) + track.length) % track.length;
    for (const m of gridMarks(slots)) {
      const b = pos.length / 3;
      for (const s of [m.s0, m.s1]) for (const d of [m.d0, m.d1]) { const [x, y] = track.point(wrap(s), d); pos.push(x, track.elevation(wrap(s), d) + 0.012, -y); }
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const marks = new THREE.Mesh(g, glow(new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    marks.name = 'grid-marks'; marks.receiveShadow = true; group.add(marks);
  }
  return group;
}
