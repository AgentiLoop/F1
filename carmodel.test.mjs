import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from './vendor/three.module.js';
import { loadCarTemplate, buildModelCar, STEERING_RATIO } from './carmodel.mjs';
import { DEFAULT_CAR } from './physics.mjs';

const bytes = readFileSync(new URL('./models/f222.glb', import.meta.url));
const wheelBytes = readFileSync(new URL('./models/mclaren-wheel.glb', import.meta.url));
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const template = await loadCarTemplate(ab(bytes), ab(wheelBytes));
const box = o => { let r = o; while (r.parent) r = r.parent; r.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o, true); };

test('GLB carries its CC BY 4.0 attribution and loads into the expected named parts', () => {
  const glb = bytes, json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  assert.match(json.asset.extras.license, /CC-BY-4\.0/);
  assert.match(json.asset.extras.author, /CarlosCG31/);
  for (const name of ['front-wing', 'rear-wing', 'bodywork', 'front-left-wheel', 'rear-right-wheel'])
    assert.ok(template.getObjectByName(name), name);
});

test('model car is 2022-sized, sits on the ground and is light enough for a full grid', () => {
  const { group } = buildModelCar(template, DEFAULT_CAR), size = box(group).getSize(new THREE.Vector3());
  assert.ok(size.x > 5.5 && size.x < 5.8, `length ${size.x}`);
  assert.ok(size.z > 1.95 && size.z < 2.1, `width ${size.z}`);
  assert.ok(size.y > 0.95 && size.y < 1.15, `height ${size.y}`);
  assert.ok(Math.abs(box(group).min.y) < 1e-3, `lowest point ${box(group).min.y}`);
  // Each part: twice-subdivided close up, once at mid range, the original far away.
  const count = m => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  const tris = [0, 0, 0]; group.traverse(o => { if (o.isLOD && o.levels[0].object.isMesh) o.levels.forEach((l, i) => { tris[i] += count(l.object); }); });
  const [near, mid, far] = tris;
  assert.ok(far > 50000 && far < 80000, `${far} far triangles`);
  assert.ok(mid > 3.5 * far && mid < 300000, `${mid} mid-range triangles`);
  assert.ok(near > 3.5 * mid && near < 1100000, `${near} close-up triangles`);
});

test('wheel hubs sit on the physics axles, left wheels at -z, tires on the ground', () => {
  const c = DEFAULT_CAR, F = c.wheelbase * (1 - c.frontWeight), R = -c.wheelbase * c.frontWeight;
  const { group, wheels } = buildModelCar(template, c);
  group.updateMatrixWorld(true);
  wheels.forEach((w, i) => {
    const p = w.pivot.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(p.x - (i < 2 ? F : R)) < 1e-6, `wheel ${i} x ${p.x}`);
    assert.ok(Math.sign(p.z) === (i % 2 ? 1 : -1) && Math.abs(Math.abs(p.z) - c.track / 2) < 0.05, `wheel ${i} z ${p.z}`);
    assert.ok(Math.abs(box(w.spin).min.y) < 1e-3, `tire ${i} touches the ground`);
    assert.equal(w.front, i < 2);
  });
});

test('spinning a wheel turns only round parts about the hub; steering turns the upright too', () => {
  const { group, wheels } = buildModelCar(template, DEFAULT_CAR), w = wheels[0];
  const before = box(w.spin), upright = w.pivot.children.find(o => o !== w.spin), uprightBefore = box(upright);
  w.spin.rotation.z = 1.3;
  const after = box(w.spin);
  assert.ok(after.min.distanceTo(before.min) < 0.01 && after.max.distanceTo(before.max) < 0.01, 'round parts keep their envelope');
  assert.ok(box(upright).min.distanceTo(uprightBefore.min) < 1e-9, 'upright does not spin');
  w.pivot.rotation.y = 0.3;
  assert.ok(box(upright).min.distanceTo(uprightBefore.min) > 0.01, 'upright steers');
  assert.ok(group);
});

test('sprung body rolls without moving the wheels; DRS opens the flap; livery paints the body', () => {
  const car = buildModelCar(template, DEFAULT_CAR, { paint: 0xc8102e });
  assert.ok(car.wheels.every(w => w.pivot.parent === car.group));
  const tires = car.wheels.map(w => box(w.spin).min.y);
  car.body.rotation.x = 0.03;
  assert.deepEqual(car.wheels.map(w => box(w.spin).min.y), tires);
  car.drsFlap.rotation.z = -35 * Math.PI / 180; const closed = box(car.drsFlap);
  car.drsFlap.rotation.z = -5 * Math.PI / 180; const open = box(car.drsFlap);
  assert.ok(open.max.x - closed.max.x > 0.02 || open.min.y - closed.min.y > 0.02, 'flap moves when opened');
  const colours = new Set(); car.body.traverse(o => { if (o.isMesh && o.material.clearcoat === 1) colours.add(o.material.color.getHex()); });
  assert.ok([...colours].some(c => new THREE.Color(0xc8102e).getHex() === c), 'paint colour applied');
  assert.ok(car.driver.length >= 2 && car.eye.length === 2);
});

test('detailed steering wheel (CC BY 4.0) replaces the plain one, faces the driver and turns about its column', () => {
  const json = JSON.parse(wheelBytes.subarray(20, 20 + wheelBytes.readUInt32LE(12)).toString());
  assert.match(json.asset.extras.license, /CC-BY-4\.0/);
  assert.match(json.asset.extras.author, /dhimasdc9/);
  const car = buildModelCar(template, DEFAULT_CAR), sw = car.steeringWheel;
  for (const name of ['Object_102', 'Object_104', 'Object_110']) assert.equal(car.group.getObjectByName(name), undefined, `${name} removed`);
  const b = box(sw), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  assert.ok(size.z > 0.22 && size.z < 0.26 && size.y > 0.11 && size.y < 0.16, `wheel size ${size.toArray()}`);
  // Ahead of and below the driver's eye, on the centre line.
  assert.ok(c.x - car.eye[0] > 0.25 && c.x - car.eye[0] < 0.5, `reach ${c.x - car.eye[0]}`);
  assert.ok(car.eye[1] - c.y > 0.08 && car.eye[1] - c.y < 0.25, `drop ${car.eye[1] - c.y}`);
  assert.ok(Math.abs(c.z) < 0.01);
  // The screen faces the driver: it sits behind (toward the eye) the column connector.
  const centre = o => box(o).getCenter(new THREE.Vector3());
  const screen = centre(sw.getObjectByName('Plane014_screen_0')), column = centre(sw.getObjectByName('Circle004_connector_0'));
  assert.ok(screen.x < column.x - 0.02, `screen ${screen.x} column ${column.x}`);
  assert.ok(screen.y > column.y, 'screen above the column');
  // Steering left (positive steer) turns the top of the wheel to the left (-z); the column stays put.
  sw.rotation.x = -0.3 * STEERING_RATIO;
  const turned = centre(sw.getObjectByName('Plane014_screen_0'));
  assert.ok(turned.z < -0.02, `screen moves left ${turned.z}`);
  assert.ok(centre(sw.getObjectByName('Circle004_connector_0')).distanceTo(column) < 0.003, 'column fixed');
  // Drawn only near the car.
  const lod = sw.parent; assert.ok(lod.isLOD && lod.levels[1].distance <= 10 && lod.levels[1].object.children.length === 0);
});
test('without the detailed wheel the model keeps its own', async () => {
  const plain = await loadCarTemplate(ab(bytes), null), car = buildModelCar(plain, DEFAULT_CAR);
  assert.equal(car.steeringWheel, null);
  assert.ok(car.group.getObjectByName('Object_102'));
});
