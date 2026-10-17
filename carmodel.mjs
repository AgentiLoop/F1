// Photo-real car: "Formula F222 Ultimate" by CarlosCG31 (CC BY 4.0, see
// models/CREDITS.md), a generic 2022-rules car, fitted to the physics car so it
// is a drop-in for buildF1Car: same { group, body, wheels, driver, drsFlap, eye }.
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { smoothGeometry } from './smooth.mjs';

export const F222_URL = new URL('./models/f222.glb', import.meta.url).href;
const WHEELS = ['front-left-wheel', 'front-right-wheel', 'rear-left-wheel', 'rear-right-wheel'];
// Each part draws its mesh Loop-subdivided twice within SMOOTH_DISTANCE[0] m (close-up
// and cockpit views), once within SMOOTH_DISTANCE[1] m and as authored beyond that.
export const SMOOTH_DISTANCE = [12, 40];
export const WHEEL_URL = new URL('./models/mclaren-wheel.glb', import.meta.url).href;
const STEERING_WHEEL = 'mclaren-steering-wheel';
// The model's own steering wheel (rim, centre, paddles) in the cockpit node.
const PLAIN_WHEEL = ['Object_102', 'Object_104', 'Object_106', 'Object_108', 'Object_110'];
// Steering wheel turn per radian of road-wheel steer (full lock 0.38 rad -> about 110°).
export const STEERING_RATIO = 5;
// The detailed wheel is only drawn within this many metres (it is inside the cockpit).
const WHEEL_DISTANCE = 6;

// Load the GLB once (a URL in the browser, an ArrayBuffer in node) and return its scene.
// Each mesh becomes a LOD of smoothed copies (smooth.mjs keeps the author's hard edges)
// and the original. Subdivided geometry is shared by every car built from the template.
// The detailed steering wheel ("McLaren Formula 1 Steering Wheel" by dhimasdc9, CC BY 4.0)
// replaces the model's plain one; null keeps the plain wheel. Outside a browser (node
// tests) its textures are skipped, since there is nothing to decode images with.
export async function loadCarTemplate(source = F222_URL, wheelSource = WHEEL_URL) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load = (src, l = loader) => typeof src === 'string' ? l.loadAsync(src) : l.parseAsync(src, '');
  const wheelLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (typeof document === 'undefined') wheelLoader.register(() => ({ name: 'no-textures', loadTexture: () => Promise.resolve(null) }));
  const [gltf, wheel] = await Promise.all([load(source),
    wheelSource ? load(wheelSource, wheelLoader).catch(err => { console.warn('steering wheel failed to load', err); return null; }) : null]);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const lod = new THREE.LOD(); lod.name = mesh.name;
    lod.position.copy(mesh.position); lod.quaternion.copy(mesh.quaternion); lod.scale.copy(mesh.scale);
    mesh.parent.children[mesh.parent.children.indexOf(mesh)] = lod; lod.parent = mesh.parent; mesh.parent = null;
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    lod.addLevel(new THREE.Mesh(smoothGeometry(mesh.geometry, { levels: 2 }), mesh.material), 0);
    lod.addLevel(new THREE.Mesh(smoothGeometry(mesh.geometry), mesh.material), SMOOTH_DISTANCE[0]);
    lod.addLevel(mesh, SMOOTH_DISTANCE[1]);
  }
  if (wheel) { wheel.scene.name = STEERING_WHEEL; gltf.scene.add(wheel.scene); }
  return gltf.scene;
}
const meshOf = o => o.isLOD ? o.levels[0].object : o;

// livery: { paint, accent, helmet } hex colours, as buildF1Car.
export function buildModelCar(template, config, { paint = 0x0d2340, accent = 0x39e0ae, helmet = 0xf2bf5e } = {}) {
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  const M = {
    'livery-pearl': physical({ color: paint, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }),
    'livery-satin': physical({ color: 0x15171b, metalness: 0.25, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    'livery-tyre': new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.93 }),
    'showroom-Cover': new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.9, roughness: 0.32 }),
  };
  const car = new THREE.Group(); car.name = 'f1-car';
  const root = template.clone(true);
  // The model's nose points to -x with its left side at +z: turn it to +x (left at -z),
  // then slide it so the front axle sits on the physics front axle.
  root.rotation.y = Math.PI; car.add(root);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = M[o.material.name] ?? o.material; o.castShadow = true; o.receiveShadow = true;
  });
  const box = o => { car.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  const tyre = name => root.getObjectByName(name).children.find(m => meshOf(m).material === M['livery-tyre']);
  const F = config.wheelbase * (1 - config.frontWeight);
  root.position.x = F - box(tyre(WHEELS[0])).getCenter(new THREE.Vector3()).x;

  // Wheels: round parts (tyre, rim, disc, cover) spin; uprights and ducts only steer.
  const wheels = WHEELS.map((name, i) => {
    const node = root.getObjectByName(name), hub = box(tyre(name)).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.position.copy(hub); car.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin); car.updateMatrixWorld(true);
    for (const m of [...node.children]) {
      const b = box(m), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      const round = Math.abs(s.x - s.y) < 0.02 && Math.hypot(c.x - hub.x, c.y - hub.y) < 0.02;
      (round ? spin : pivot).attach(m);
    }
    return { pivot, spin, front: i < 2 };
  });

  // DRS flap: the upper rear-wing element, hinged at its trailing edge. Its authored
  // pose is the closed flap, which poseCar asks for as -35° (it opens toward -5°).
  const flap = root.getObjectByName('rear-wing').children
    .filter(m => { const s = box(m).getSize(new THREE.Vector3()); return s.x < 0.3 && s.z > 0.5; })
    .sort((a, b) => box(b).getCenter(new THREE.Vector3()).y - box(a).getCenter(new THREE.Vector3()).y)[0];
  const fb = box(flap), drsFlap = new THREE.Group(), rest = new THREE.Group();
  drsFlap.position.set(fb.min.x, fb.max.y, 0); drsFlap.rotation.z = -35 * Math.PI / 180;
  rest.rotation.z = 35 * Math.PI / 180; drsFlap.add(rest); car.add(drsFlap);
  car.updateMatrixWorld(true); rest.attach(flap);

  // Steering wheel: the detailed wheel takes the plain one's place, as wide as it and
  // facing the driver, and turns about its column (steeringWheel.rotation.x).
  let steeringWheel = null;
  const detail = root.getObjectByName(STEERING_WHEEL);
  if (detail) {
    const plain = PLAIN_WHEEL.map(n => root.getObjectByName(n)), pb = new THREE.Box3();
    plain.forEach(o => pb.union(box(o)));
    plain.forEach(o => o.removeFromParent());
    detail.removeFromParent(); detail.rotation.set(0, -Math.PI / 2, 0);
    const db = new THREE.Box3().setFromObject(detail), dc = db.getCenter(new THREE.Vector3());
    const column = new THREE.Box3().setFromObject(detail.getObjectByName('Circle004_connector_0')).getCenter(new THREE.Vector3());
    const s = pb.getSize(new THREE.Vector3()).z / db.getSize(new THREE.Vector3()).z, pc = pb.getCenter(new THREE.Vector3());
    detail.scale.setScalar(s); detail.position.set(-dc.x * s, -column.y * s, -column.z * s);
    steeringWheel = new THREE.Group(); steeringWheel.name = 'steering-wheel';
    steeringWheel.position.set(pc.x, pc.y + (column.y - dc.y) * s, pc.z + (column.z - dc.z) * s);
    steeringWheel.add(detail);
    // Only drawn near the car: from further away it is hidden inside the cockpit anyway.
    const lod = new THREE.LOD(); lod.addLevel(steeringWheel, 0); lod.addLevel(new THREE.Object3D(), WHEEL_DISTANCE);
    car.add(lod);
  }

  // The model has no driver: a helmet sits in the cockpit behind the steering wheel.
  const head = new THREE.Vector3(F - 1.53, 0.70, 0);
  const helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.125, 32, 20), physical({ color: helmet, roughness: 0.25, clearcoat: 1 }));
  helmetMesh.scale.set(1.1, 1, 0.95); helmetMesh.position.copy(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.127, 32, 12, -0.9, 1.8, 1.2, 0.45),
    physical({ color: 0x0a0d12, metalness: 0.9, roughness: 0.05, clearcoat: 1 }));
  visor.scale.copy(helmetMesh.scale); visor.rotation.y = Math.PI / 2; visor.position.copy(head);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.126, 0.012, 8, 40), physical({ color: accent, roughness: 0.3, clearcoat: 1 }));
  stripe.rotation.y = Math.PI / 2; stripe.scale.set(1.1, 1, 0.95); stripe.position.copy(head);
  for (const m of [helmetMesh, visor, stripe]) { m.castShadow = true; car.add(m); }

  // Sprung body: everything but the wheel assemblies, as in buildF1Car.
  const body = new THREE.Group(); body.name = 'sprung-body';
  const pivots = new Set(wheels.map(w => w.pivot));
  car.children.filter(o => !pivots.has(o)).forEach(o => body.add(o));
  car.add(body);
  return { group: car, body, wheels, driver: [helmetMesh, visor, stripe], drsFlap, steeringWheel, eye: [head.x + 0.07, head.y + 0.07] };
}
