import * as THREE from '../vendor/three.module.js';

// Racing-line chevrons painted on the road, after the RISE Motordrome sim's
// js/chevrons.js: one every SPACING metres along the racing line, pointing
// along it. Near the car the colour follows the speed it carries: green,
// keep going; amber, the 60 m before braking must start; red, brake now, on
// to the slowest point of that corner. Beyond 700 m they show the line's usual
// braking zones. Mode 1 shows the whole line, 2 only the red.
export const SPACING = 5;
const NEAR = 700;

// Chevron placements: world position [x, height, -y] and basis (X right, N up,
// T along the line) from the track's racing line and elevation, plus whether
// each one is in a braking zone (the plan slows by over 6 m/s² in the next 10 m).
export function chevronLayout(track, speedAt) {
  const n = Math.floor(track.length / SPACING), out = [];
  const at = (s, d) => { const [x, y] = track.point(s, d); return [x, track.elevation(s, d), -y]; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  for (let k = 0; k < n; k++) {
    const s = k * SPACING, d = track.lineOffset(s), p = at(s, d);
    const T = unit(sub(at(s + 2, track.lineOffset(s + 2)), at(s - 2, track.lineOffset(s - 2))));
    const R = unit(sub(at(s, d + 1), at(s, d - 1)));
    const N = unit(cross(R, T)), X = cross(N, T);
    const v0 = speedAt(s), v1 = speedAt(s + 10);
    out.push({ s, p: [p[0], p[1] + 0.045, p[2]], X, N, T, brake: (v0 * v0 - v1 * v1) / 20 > 6 });
  }
  return out;
}

// Where braking must start for the corners in the next 700 m at speed carV
// (metres ahead of the car), and the corner's slowest point: [from, to], or
// null with nothing to brake for. brakeDist(v, vt): metres to slow v to vt.
export function brakeWindow(carS, carV, speedAt, brakeDist) {
  let from = Infinity, to = Infinity;
  for (let x = 0; x <= NEAR; x += SPACING) {
    const vt = speedAt(carS + x);
    if (carV <= vt + 0.5) continue;
    const start = x - brakeDist(carV, vt);
    if (start < from) { from = start; to = x; }
  }
  if (from === Infinity) return null;
  let vmin = speedAt(carS + to);
  for (let x = to; x <= Math.min(NEAR, to + 150); x += SPACING) { const vt = speedAt(carS + x); if (vt <= vmin) { vmin = vt; to = x; } }
  return [from, to];
}

// The instanced chevrons, in full-strength colours (not tone mapped: the
// RISE sim's 1.8× boost through our ACES curve washes them out to pastel). update(carS, carV) each frame; mode(0|1|2) hides them,
// shows the line or only its braking zones.
export function buildChevrons(track, speedAt, brakeDist) {
  const list = chevronLayout(track, speedAt), n = list.length;
  const shape = new THREE.Shape();
  // 2.2 m wide, arms 0.45 m deep: big enough to read from the cockpit at speed.
  shape.moveTo(-1.1, -0.55); shape.lineTo(0, 0.35); shape.lineTo(1.1, -0.55); shape.lineTo(1.1, -0.1); shape.lineTo(0, 0.8); shape.lineTo(-1.1, -0.1); shape.lineTo(-1.1, -0.55);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(Float32Array.from(list, c => c.s), 1));
  geo.setAttribute('aBrake', new THREE.InstancedBufferAttribute(Float32Array.from(list, c => +c.brake), 1));
  const uniforms = { carS: { value: 0 }, lapLength: { value: track.length }, mode: { value: 1 }, brakeFrom: { value: 1e6 }, brakeTo: { value: 1e6 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `attribute float aS; attribute float aBrake; uniform float carS, lapLength; varying float vRel, vBrake;
      void main() {
        float ahead = mod(aS - carS + lapLength, lapLength);
        vRel = ahead > 0.5 * lapLength ? ahead - lapLength : ahead; vBrake = aBrake;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform float mode, brakeFrom, brakeTo; varying float vRel, vBrake;
      void main() {
        float near = step(vRel, ${NEAR.toFixed(1)});
        float red = max(step(brakeFrom, vRel) * step(vRel, brakeTo) * near, vBrake * (1.0 - near));
        float amber = step(brakeFrom - 60.0, vRel) * step(vRel, brakeFrom) * near;
        vec3 col = mix(mix(vec3(0.04, 1.0, 0.18), vec3(1.0, 0.72, 0.0), amber), vec3(1.0, 0.06, 0.04), red);
        float shown = (smoothstep(-12.0, -6.0, vRel) * (1.0 - smoothstep(700.0, 1100.0, vRel))) * (mode > 1.5 ? red : 1.0);
        if (shown < 0.01) discard;
        gl_FragColor = vec4(col, 0.92 * shown);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4();
  list.forEach((c, k) => {
    m.makeBasis(new THREE.Vector3(...c.X), new THREE.Vector3(...c.N), new THREE.Vector3(...c.T)).setPosition(...c.p);
    mesh.setMatrixAt(k, m);
  });
  mesh.name = 'chevrons'; mesh.frustumCulled = false; mesh.renderOrder = 2;
  return {
    mesh, uniforms,
    mode(k) { uniforms.mode.value = k; mesh.visible = k > 0; },
    update(carS, carV) {
      const w = brakeWindow(carS, carV, speedAt, brakeDist);
      uniforms.carS.value = carS;
      uniforms.brakeFrom.value = w ? w[0] : 1e6; uniforms.brakeTo.value = w ? w[1] : 1e6;
    },
  };
}
