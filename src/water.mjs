// The lake, after the RISE Motordrome sim's js/water.js: a planar reflection
// of the scene, broken up by wind ripples, with a Fresnel blend into the deep
// water colour and a sun glint; plus that sim's papyrus islands (lakeIslands in
// js/terrain.js). Their WebGPU/TSL nodes are re-done here for our WebGL
// renderer: a mirror camera with an oblique near plane renders the scene into
// a texture just before the lake is drawn.
import * as THREE from '../vendor/three.module.js';

const NOISE = /* glsl */`
float lakeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lakeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lakeHash(i), lakeHash(i + vec2(1, 0)), u.x), mix(lakeHash(i + vec2(0, 1)), lakeHash(i + vec2(1, 1)), u.x), u.y) * 2.0 - 1.0;
}`;

// Papyrus islands: their placement (seed, counts and sizes) in world (x, z),
// on water between 30 m and 260 m out from the shore.
export function lakeIslands(sdf) {
  const out = [];
  let seed = 77;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let tries = 0; tries < 4000 && out.length < 46; tries++) {
    const x = -2100 + rnd() * 1900, z = -1100 + rnd() * 2100, d = sdf(x, z);
    if (d > -30 || d < -260) continue;
    const r = 12 + rnd() * 38 * (d < -120 ? 1 : 0.6);
    if (out.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 25)) continue;
    out.push({ x, z, r, rot: rnd() * 6.28 });
  }
  return out;
}

// Lake over the blobs' extent at height level; sdf(x, z) is the shore distance
// in world coordinates (negative on the water).
export function buildLake(blobs, level, sdf, { resolutionScale = 0.45 } = {}) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z, r] of blobs) { x0 = Math.min(x0, x - r - 120); x1 = Math.max(x1, x + r + 120); z0 = Math.min(z0, z - r - 120); z1 = Math.max(z1, z + r + 120); }
  const group = new THREE.Group();
  const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const textureMatrix = new THREE.Matrix4();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tReflect: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  }]);
  uniforms.tReflect.value = target.texture; uniforms.textureMatrix.value = textureMatrix;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUvR; varying vec3 vWorld;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUvR = textureMatrix * vec4(position, 1.0);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tReflect; uniform float uTime; uniform vec3 uSunDir, uSunColor;
      varying vec4 vUvR; varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        vec2 p = vWorld.xz; float t = uTime * 0.35;
        float n3 = lakeNoise(p * 0.6 + vec2(t * 2.0, 0.0));
        float nx = lakeNoise(p * 0.045 + vec2(t, t * 0.6)) * 0.5 + lakeNoise(p * 0.13 - vec2(t * 1.3, t) + 3.0) * 0.35 + n3 * 0.15;
        float nz = lakeNoise(p * 0.05 + vec2(0.0, t) + 9.0) * 0.6 + n3 * 0.4;
        vec3 N = normalize(vec3(nx * 0.16, 1.0, nz * 0.16));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, N), 0.0), 5.0);
        vec4 uv = vUvR; uv.xy += vec2(nx, nz) * 0.018 * uv.w;
        vec3 r = texture2DProj(tReflect, uv).rgb;
        vec3 deep = vec3(0.018, 0.05, 0.045) * uSunColor * 0.9;
        float spec = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 600.0) * 40.0;
        gl_FragColor = vec4(mix(deep, r, clamp(fres * 1.15 + 0.12, 0.0, 1.0)) + uSunColor * spec, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, level, (z0 + z1) / 2);
  water.name = 'lake';
  group.add(water);

  // Mirror camera: the viewer reflected through the water plane, with the
  // near plane tilted onto the water so nothing below it shows.
  const mirror = new THREE.PerspectiveCamera(), eye = new THREE.Vector3(), look = new THREE.Vector3(), rot = new THREE.Matrix4();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4(), size = new THREE.Vector2();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const start = performance.now();
  let rendering = false, sun;
  water.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uTime.value = (performance.now() - start) / 1000;
    // Only for the main view: mirrors and our own pass see the last reflection.
    if (rendering || renderer.getRenderTarget() !== null) return;
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y <= level) return;
    if (sun === undefined) { sun = null; scene.traverse(o => { if (o.isDirectionalLight && !sun) sun = o; }); }
    if (sun) { uniforms.uSunDir.value.subVectors(sun.position, sun.target.position).normalize(); uniforms.uSunColor.value.copy(sun.color); }
    renderer.getDrawingBufferSize(size).multiplyScalar(resolutionScale).round();
    if (target.width !== size.x || target.height !== size.y) target.setSize(Math.max(16, size.x), Math.max(16, size.y));

    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(eye);
    mirror.position.set(eye.x, 2 * level - eye.y, eye.z);
    mirror.up.set(0, 1, 0).applyMatrix4(rot); mirror.up.y = -mirror.up.y;
    mirror.lookAt(look.x, 2 * level - look.y, look.z);
    mirror.far = camera.far; mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse).multiply(water.matrixWorld);
    // Oblique near plane on the water (Lengyel), as three's Reflector does.
    plane.set(new THREE.Vector3(0, 1, 0), -level).applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = mirror.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    rendering = true; water.visible = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    renderer.shadowMap.autoUpdate = shadows; water.visible = true; rendering = false;
  };

  // Papyrus islands: low ragged mats of green just above the water.
  const shape = new THREE.Shape();
  for (let i = 0; i <= 28; i++) {
    const a = i / 28 * Math.PI * 2, r = 1 + 0.22 * Math.sin(a * 3 + 1.3) + 0.12 * Math.sin(a * 7 + 0.4);
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  const islandGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.06, bevelSegments: 2 });
  islandGeo.rotateX(-Math.PI / 2);
  const list = lakeIslands(sdf);
  const islands = new THREE.InstancedMesh(islandGeo, new THREE.MeshStandardMaterial({ color: 0x1c3a14, roughness: 0.95 }), list.length);
  const m = new THREE.Matrix4(), rq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  list.forEach((o, i) => {
    islands.setMatrixAt(i, m.compose(new THREE.Vector3(o.x, level - 0.35, o.z), rq.setFromAxisAngle(up, o.rot), new THREE.Vector3(o.r, 1, o.r * 0.7)));
    islands.setColorAt(i, tint.setScalar(0.85 + (i * 0.37 % 1) * 0.3));
  });
  islands.receiveShadow = true; islands.name = 'lake-islands';
  group.add(islands);
  group.userData = { islands: list, water };
  return group;
}
