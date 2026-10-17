// Test-drive car: "2026 Redbull RB22" by Tyler_Dave (CC BY 4.0, see models/CREDITS.md),
// fitted to the physics car as a drop-in for buildModelCar: { group, body, wheels, driver,
// drsFlap, steeringWheel, eye }. Loaded with ?car=rb22. Keeps the authored Red Bull livery.
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

export const RB22_URL = new URL('./models/rb22.glb', import.meta.url).href;
// All four wheels of each of these materials are one mesh: split per corner at load.
const WHEEL_MATERIAL = /^(discs|redbull_wheel_hub|sidewall)/;
// Parts wholly inside this box (model metres, nose at +z) make up the steering wheel.
const STEERING_BOX = new THREE.Box3(new THREE.Vector3(-0.14, 0.48, 0.63), new THREE.Vector3(0.14, 0.69, 0.81));
const CORNERS = ['front-left', 'front-right', 'rear-left', 'rear-right'];

// Load once; bake every mesh into model space and split the merged wheel meshes per corner.
export async function loadRB22Template(source = RB22_URL) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(source);
  gltf.scene.updateMatrixWorld(true);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const template = new THREE.Group(), wheels = CORNERS.map(name => Object.assign(new THREE.Group(), { name }));
  const steering = new THREE.Group(); steering.name = 'steering';
  for (const m of meshes) {
    const geometry = toFloat(m.geometry).applyMatrix4(m.matrixWorld);
    geometry.computeBoundingBox();
    if (WHEEL_MATERIAL.test(m.material.name)) {
      splitCorners(geometry).forEach((g, i) => g && wheels[i].add(new THREE.Mesh(g, m.material)));
      continue;
    }
    const mesh = new THREE.Mesh(geometry, m.material); mesh.name = m.name;
    (STEERING_BOX.containsBox(geometry.boundingBox) ? steering : template).add(mesh);
  }
  template.add(steering, ...wheels);
  return template;
}

// A copy with float attributes (meshopt quantizes them, which a transform would clip).
function toFloat(geometry) {
  const out = new THREE.BufferGeometry(); out.setIndex(geometry.index);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const n = attr.itemSize, dst = new Float32Array(attr.count * n), get = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < attr.count; i++) for (let j = 0; j < n; j++) dst[i * n + j] = attr[get[j]](i);
    out.setAttribute(name, new THREE.BufferAttribute(dst, n));
  }
  return out;
}

// Split a non-indexed copy of geometry into four by triangle centroid: +z front, +x left.
function splitCorners(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, pos = g.attributes.position;
  const buckets = [[], [], [], []];
  for (let t = 0; t < pos.count; t += 3) {
    const x = pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2), z = pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2);
    buckets[(z > 0 ? 0 : 2) + (x > 0 ? 0 : 1)].push(t);
  }
  return buckets.map(tris => {
    if (!tris.length) return null;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const n = attr.itemSize, src = attr.array, dst = new src.constructor(tris.length * 3 * n);
      tris.forEach((t, k) => dst.set(src.subarray(t * n, (t + 3) * n), k * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    return out;
  });
}

// A corner's axle direction in car space (+z side): the area-weighted normal of its flat
// brake disc (split corner meshes are non-indexed). Needs current world matrices.
function axleOf(corner) {
  const axis = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const disc = corner.children.find(m => m.material.name.startsWith('discs')), pos = disc.geometry.attributes.position;
  for (let t = 0; t < pos.count; t += 3) {
    [a, b, c].forEach((v, k) => v.fromBufferAttribute(pos, t + k).applyMatrix4(disc.matrixWorld));
    n.crossVectors(b.sub(a), c.sub(a)); axis.addScaledVector(n, Math.sign(n.z) || 1);
  }
  return axis.normalize();
}

// livery: { helmet } hex colour (the car keeps its own paint).
export function buildRB22Car(template, config, { accent = 0x39e0ae, helmet = 0x1e2a6e } = {}) {
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  const car = new THREE.Group(); car.name = 'f1-car';
  const root = template.clone(true);
  // Nose +z, left +x -> nose +x, left -z; then put the front axle on the physics front axle.
  root.rotation.y = Math.PI / 2; car.add(root);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = o => { car.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  const F = config.wheelbase * (1 - config.frontWeight);
  root.position.x = F - box(root.getObjectByName(CORNERS[0])).getCenter(new THREE.Vector3()).x;

  // Wheels: the whole corner (tyre, rim, disc) spins about its hub, on the wheel's own
  // axle: the front wheels are modelled with camber, and spun about the car's lateral
  // axis instead they wobble.
  const wheels = CORNERS.map((name, i) => {
    const node = root.getObjectByName(name), hub = box(node).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.position.copy(hub); car.add(pivot);
    const axle = new THREE.Group(); axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axleOf(node)); pivot.add(axle);
    const spin = new THREE.Group(); axle.add(spin); car.updateMatrixWorld(true);
    spin.attach(node);
    return { pivot, spin, front: i < 2 };
  });

  // The rear wing is part of the merged bodywork, so the DRS flap is a placeholder.
  const drsFlap = new THREE.Group(); car.add(drsFlap);

  // Steering wheel turns about its column (steeringWheel.rotation.x).
  const steer = root.getObjectByName('steering'), sc = box(steer).getCenter(new THREE.Vector3());
  const steeringWheel = new THREE.Group(); steeringWheel.name = 'steering-wheel';
  steeringWheel.position.copy(sc); car.add(steeringWheel); car.updateMatrixWorld(true);
  steeringWheel.attach(steer);

  // The model has no driver: a helmet sits behind the steering wheel.
  const head = new THREE.Vector3(sc.x - 0.62, 0.70, 0);
  const helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.125, 32, 20), physical({ color: helmet, roughness: 0.25, clearcoat: 1 }));
  helmetMesh.scale.set(1.1, 1, 0.95); helmetMesh.position.copy(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.127, 32, 12, -0.9, 1.8, 1.2, 0.45),
    physical({ color: 0x0a0d12, metalness: 0.9, roughness: 0.05, clearcoat: 1 }));
  visor.scale.copy(helmetMesh.scale); visor.rotation.y = Math.PI / 2; visor.position.copy(head);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.126, 0.012, 8, 40), physical({ color: accent, roughness: 0.3, clearcoat: 1 }));
  stripe.rotation.y = Math.PI / 2; stripe.scale.set(1.1, 1, 0.95); stripe.position.copy(head);
  for (const m of [helmetMesh, visor, stripe]) { m.castShadow = true; car.add(m); }

  const body = new THREE.Group(); body.name = 'sprung-body';
  const pivots = new Set(wheels.map(w => w.pivot));
  car.children.filter(o => !pivots.has(o)).forEach(o => body.add(o));
  car.add(body);
  return { group: car, body, wheels, driver: [helmetMesh, visor, stripe], drsFlap, steeringWheel, eye: [head.x + 0.07, head.y + 0.07] };
}
