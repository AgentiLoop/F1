// Photo-real car: "F1 2022 Generic V3" by Hydra_Junie, reuploaded from TheoDevF1 (CC BY 4.0,
// see models/CREDITS.md), fitted to the physics car so it is a drop-in for buildF1Car:
// { group, body, wheels, driver, drsFlap, steeringWheel, eye }. Every car on the grid uses it,
// its red livery repainted in the car's colour.
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
import { toFloat, splitCorners } from './rb22.mjs';

export const GENERIC_URL = new URL('./models/f1-2022-generic-v3.glb', import.meta.url).href;
// All four wheels of each of these materials are merged: split per corner at load.
const WHEEL_MATERIAL = new Set(['tyres', 'rims', 'brake']);
// Textured with the red livery, which buildModelCar repaints.
const LIVERY_MATERIAL = new Set(['Livery', 'Livery_Wings']);
const CORNERS = ['front-left', 'front-right', 'rear-left', 'rear-right'];
// Parts wholly this far outboard (model units) are uprights and brake ducts: they steer, not spin.
const OUTBOARD = 0.5;
// Steering wheel turn per radian of road-wheel steer (full lock 0.38 rad -> about 110°).
export const STEERING_RATIO = 5;

// Load the GLB once (a URL in the browser, an ArrayBuffer in node): bake every mesh into model
// space (nose +z, left +x, up +y) and split the merged wheel meshes per corner. Outside a
// browser (node tests) textures are skipped, since there is nothing to decode images with.
export async function loadCarTemplate(source = GENERIC_URL) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (typeof document === 'undefined') loader.register(() => ({ name: 'no-textures', loadTexture: () => Promise.resolve(null) }));
  const gltf = await (typeof source === 'string' ? loader.loadAsync(source) : loader.parseAsync(source, ''));
  gltf.scene.updateMatrixWorld(true);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const template = new THREE.Group(), steering = Object.assign(new THREE.Group(), { name: 'steering' });
  const corners = CORNERS.map(name => Object.assign(new THREE.Group(), { name }));
  const uprights = CORNERS.map(name => Object.assign(new THREE.Group(), { name: `${name}-upright` }));
  for (const m of meshes) {
    const geometry = toFloat(m.geometry).applyMatrix4(m.matrixWorld), name = m.material.name;
    // The model's tyres are glossy (roughness 0.23): at grazing angles they mirror the bright
    // environment as white outlines. Rubber is matte, and even rough the sidewalls catch a white
    // Fresnel sheen side-on, so the specular is cut too.
    if (name === 'tyres') {
      m.material = new THREE.MeshPhysicalMaterial({ name, map: m.material.map,
        roughness: 0.9, specularIntensity: 0.05, envMapIntensity: 0.15 });
      // The texture paints white, yellow and red markings on the sidewalls (rubber is sRGB ~40,
      // linear ~0.02); dimmed they still showed as white streaks side-on: paint them rubber black.
      m.material.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), smoothstep(0.03, 0.06, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))));'); };
    }
    geometry.computeBoundingBox();
    const b = geometry.boundingBox, outboard = b.min.x > OUTBOARD || b.max.x < -OUTBOARD;
    if (WHEEL_MATERIAL.has(name) || outboard) {
      splitCorners(geometry).forEach((g, i) => g && (outboard && !WHEEL_MATERIAL.has(name) ? uprights : corners)[i].add(new THREE.Mesh(g, m.material)));
      continue;
    }
    // Glossy dark paint mirrors the bright room environment as a pale grey-white sheen over whole
    // panels: keep a satin finish with weak reflections so the paint colour shows.
    const material = LIVERY_MATERIAL.has(name) ? new THREE.MeshPhysicalMaterial({ name, map: m.material.map,
      roughness: 0.55, specularIntensity: 0.4, envMapIntensity: 0.3, clearcoat: 0.1, clearcoatRoughness: 0.4 }) : m.material;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = m.name;
    (name === 'Steer' ? steering : template).add(mesh);
  }
  template.add(steering, ...corners, ...uprights);
  return template;
}

// A copy of a livery material whose red (strongly red texels; the white and black markings
// stay) is repainted `paint`, keeping the texture's shading.
function paintMaterial(material, paint) {
  const m = material.clone(), color = { value: new THREE.Color(paint) };
  m.userData.paint = color.value;
  m.customProgramCacheKey = () => 'livery-paint';
  m.onBeforeCompile = shader => {
    shader.uniforms.paint = color;
    shader.fragmentShader = 'uniform vec3 paint;\n' + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float red = smoothstep(0.3, 0.8, (diffuseColor.r - max(diffuseColor.g, diffuseColor.b)) / max(diffuseColor.r, 1e-4));
      diffuseColor.rgb = mix(diffuseColor.rgb, paint * min(diffuseColor.r / 0.296, 1.0), red);`);
  };
  return m;
}

// A tyre's axle direction in car space (+z side): a tyre is a ring, so its vertices vary least
// along the axle (smallest eigenvector of their covariance). Needs current world matrices.
export function axleOf(mesh) {
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3(), mean = new THREE.Vector3(), pts = [];
  for (let k = 0; k < pos.count; k++) { pts.push(v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld).clone()); mean.add(pts[k]); }
  mean.divideScalar(pts.length);
  const c = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  for (const p of pts) { const x = p.x - mean.x, y = p.y - mean.y, z = p.z - mean.z; c[0] += x * x; c[1] += x * y; c[2] += x * z; c[3] += y * y; c[4] += y * z; c[5] += z * z; }
  const inv = new THREE.Matrix3().set(c[0], c[1], c[2], c[1], c[3], c[4], c[2], c[4], c[5]).invert();
  const axis = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < 50; k++) axis.applyMatrix3(inv).normalize(); // inverse power iteration
  return axis.multiplyScalar(Math.sign(axis.z) || 1);
}

// livery: { paint, accent, helmet } hex colours, as buildF1Car.
export function buildModelCar(template, config, { paint = 0x0d2340, accent = 0x39e0ae, helmet = 0xf2bf5e } = {}) {
  const physical = o => new THREE.MeshPhysicalMaterial(o);
  const car = new THREE.Group(); car.name = 'f1-car';
  const root = template.clone(true);
  // Nose +z, left +x -> nose +x, left -z.
  root.rotation.y = Math.PI / 2; car.add(root);
  const painted = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const name = o.material.name;
    if (LIVERY_MATERIAL.has(name)) { if (!painted.has(name)) painted.set(name, paintMaterial(o.material, paint)); o.material = painted.get(name); }
    o.castShadow = true; o.receiveShadow = true;
  });
  const box = o => { car.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  const tyre = name => box(root.getObjectByName(name).children.find(m => m.material.name === 'tyres'));
  const hub = name => tyre(name).getCenter(new THREE.Vector3());
  // Scale to the physics wheelbase, put the front axle on the physics front axle and the tyres on the ground.
  root.scale.setScalar(config.wheelbase / (hub(CORNERS[0]).x - hub(CORNERS[2]).x));
  const F = config.wheelbase * (1 - config.frontWeight);
  root.position.x = F - hub(CORNERS[0]).x;
  root.position.y = -Math.min(...CORNERS.map(n => tyre(n).min.y));

  // Wheels: tyre, rim and disc spin about the hub, on the tyre's own axle (the front wheels
  // are modelled with camber and toe: spun about the car's lateral axis they wobble); the
  // uprights and brake ducts only steer.
  const wheels = CORNERS.map((name, i) => {
    const centre = hub(name), pivot = new THREE.Group(); pivot.position.copy(centre); car.add(pivot);
    const tyreMesh = root.getObjectByName(name).children.find(m => m.material.name === 'tyres');
    const axle = new THREE.Group(); axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axleOf(tyreMesh)); pivot.add(axle);
    const spin = new THREE.Group(); axle.add(spin); car.updateMatrixWorld(true);
    spin.attach(root.getObjectByName(name)); pivot.attach(root.getObjectByName(`${name}-upright`));
    return { pivot, spin, front: i < 2 };
  });

  // The rear wing is part of the merged bodywork, so the DRS flap is a placeholder.
  const drsFlap = new THREE.Group(); car.add(drsFlap);

  // Steering wheel turns about its column (steeringWheel.rotation.x).
  const steer = root.getObjectByName('steering'), sc = box(steer).getCenter(new THREE.Vector3());
  const steeringWheel = new THREE.Group(); steeringWheel.name = 'steering-wheel';
  steeringWheel.position.copy(sc); car.add(steeringWheel); car.updateMatrixWorld(true);
  steeringWheel.attach(steer);

  // The model has no driver: a helmet sits in the cockpit behind the steering wheel.
  const head = new THREE.Vector3(sc.x - 0.6, 0.70, 0);
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
