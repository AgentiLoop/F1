// Rear-view mirrors that show the scene: each frame the mirror is drawn as seen from the
// viewer's eye reflected through the mirror's plane, through a frustum fitted to the glass
// (its near plane on the mirror, so nothing behind the glass shows), and that image is
// projected back onto the glass.
import * as THREE from './vendor/three.module.js';

let rendering = false; // a mirror seen in another mirror keeps its last image

// mesh: the (roughly flat) glass, front faces toward the viewer; width: render target pixels;
// hide: objects left out of the mirror's image (e.g. the car's own rear wheels);
// tilt: radians the mirror is angled up (the view moves up by twice that);
// extend: screen pixels the glass (and its image) reaches further down.
export function makeMirror(mesh, { width = 512, hide = [], tilt = 0.025, extend = 3 } = {}) {
  // The glass's plane in mesh space: area-weighted normal, centroid and a rectangle around it.
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, P = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), centre = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    const t = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)), s = t.length() / 2;
    n.add(t); centre.addScaledVector(a.add(b).add(c), s / 3); area += s;
  }
  n.normalize(); centre.divideScalar(area);
  const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(), v = n.clone().cross(u);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < P.count; i++) {
    const d = a.fromBufferAttribute(P, i).sub(centre), x = d.dot(u), y = d.dot(v);
    u0 = Math.min(u0, x); u1 = Math.max(u1, x); v0 = Math.min(v0, y); v1 = Math.max(v1, y);
  }
  const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([x, y]) => centre.clone().addScaledVector(u, x).addScaledVector(v, y));
  // The glass is stretched down (top edge fixed) each frame so the image is `extend` screen px taller at the bottom.
  const vUp = v.clone(), base = [corners[0].clone(), corners[1].clone()], pos = mesh.geometry.attributes.position, orig = pos.array.slice();
  const weight = Array.from({ length: pos.count }, (_, i) => (v1 - a.fromBufferAttribute(pos, i).sub(centre).dot(vUp)) / (v1 - v0));
  let shift = 0;
  const stretch = s => {
    if (Math.abs(s - shift) < 1e-6) return;
    shift = s;
    for (let i = 0; i < pos.count; i++) for (let k = 0; k < 3; k++) pos.array[3 * i + k] = orig[3 * i + k] - vUp.getComponent(k) * s * weight[i];
    pos.needsUpdate = true;
    corners[0].copy(base[0]).addScaledVector(vUp, -s); corners[1].copy(base[1]).addScaledVector(vUp, -s);
  };
  // Tilt the reflecting plane up about the glass's horizontal axis so the view clears the car's own bodywork.
  { const nt = n.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(v, Math.sin(tilt));
    v.multiplyScalar(Math.cos(tilt)).addScaledVector(n, -Math.sin(tilt)); n.copy(nt); }

  const target = new THREE.WebGLRenderTarget(width, Math.max(16, Math.round(width * (v1 - v0) / (u1 - u0))), { type: THREE.HalfFloatType, samples: 4 });
  const textureMatrix = new THREE.Matrix4(), mirrorCamera = new THREE.PerspectiveCamera();
  const modelled = mesh.material, glass = new THREE.ShaderMaterial({
    name: 'mirror',
    uniforms: { map: { value: target.texture }, textureMatrix: { value: textureMatrix } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vMirror;
      void main() { vMirror = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vMirror;
      void main() { gl_FragColor = texture2DProj(map, vMirror);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  // mesh.userData.mirror(on): the glass reflects (on) or goes back to its modelled material.
  (mesh.userData.mirror = on => { mesh.material = on ? glass : modelled; if (!on) stretch(0); })(true);

  const q = new THREE.Vector3(), down = new THREE.Vector3(), size = new THREE.Vector2();
  const C = new THREE.Vector3(), N = new THREE.Vector3(), up = new THREE.Vector3(), eye = new THREE.Vector3(), p = new THREE.Vector3();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (rendering || mesh.material !== glass) return;
    C.copy(centre).applyMatrix4(mesh.matrixWorld);
    N.copy(n).transformDirection(mesh.matrixWorld); up.copy(v).transformDirection(mesh.matrixWorld);
    const dist = eye.setFromMatrixPosition(camera.matrixWorld).sub(C).dot(N);
    if (dist <= 1e-3) return; // seen from behind
    // Screen px per metre down the glass at its bottom edge, then stretch it by `extend` px.
    p.copy(base[0]).lerp(base[1], 0.5).applyMatrix4(mesh.matrixWorld); down.copy(vUp).transformDirection(mesh.matrixWorld).negate();
    q.copy(p).addScaledVector(down, 0.01).project(camera);
    const pxPerM = Math.abs(q.y - p.project(camera).y) / 2 * renderer.getSize(size).y / 0.01;
    if (pxPerM > 0) stretch(extend / pxPerM / mesh.matrixWorld.getMaxScaleOnAxis());
    eye.addScaledVector(N, -2 * dist).add(C); // the eye reflected through the plane
    mirrorCamera.position.copy(eye); mirrorCamera.up.copy(up);
    mirrorCamera.lookAt(p.copy(eye).add(N)); mirrorCamera.updateMatrixWorld();
    let l = Infinity, r = -Infinity, bt = Infinity, tp = -Infinity;
    for (const k of corners) {
      p.copy(k).applyMatrix4(mesh.matrixWorld).applyMatrix4(mirrorCamera.matrixWorldInverse);
      const x = p.x * dist / -p.z, y = p.y * dist / -p.z;
      l = Math.min(l, x); r = Math.max(r, x); bt = Math.min(bt, y); tp = Math.max(tp, y);
    }
    mirrorCamera.projectionMatrix.makePerspective(l, r, tp, bt, dist, camera.far);
    mirrorCamera.projectionMatrixInverse.copy(mirrorCamera.projectionMatrix).invert();
    textureMatrix.copy(bias).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse).multiply(mesh.matrixWorld);

    const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    const shown = hide.map(o => o.visible);
    rendering = true; mesh.visible = false; renderer.shadowMap.autoUpdate = false; hide.forEach(o => { o.visible = false; });
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, mirrorCamera);
    renderer.setRenderTarget(previous);
    hide.forEach((o, i) => { o.visible = shown[i]; });
    renderer.shadowMap.autoUpdate = shadows; mesh.visible = true; rendering = false;
  };
  return mesh;
}
