import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from './vendor/three.module.js';
import { loadCarTemplate, buildModelCar, STEERING_RATIO } from './carmodel.mjs';
import { DEFAULT_CAR } from './physics.mjs';

const bytes = readFileSync(new URL('./models/f1-2022-generic-v3.glb', import.meta.url));
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const template = await loadCarTemplate(ab(bytes));
const box = o => { let r = o; while (r.parent) r = r.parent; r.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o, true); };

test('GLB carries its CC BY 4.0 attribution and loads into the expected parts', () => {
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.match(json.asset.extras.license, /CC-BY-4\.0/);
  assert.match(json.asset.extras.author, /Hydra_Junie/);
  for (const name of ['steering', 'front-left', 'rear-right', 'front-left-upright'])
    assert.ok(template.getObjectByName(name), name);
});

test('model car is 2022-sized and sits on the ground', () => {
  const { group } = buildModelCar(template, DEFAULT_CAR), size = box(group).getSize(new THREE.Vector3());
  assert.ok(size.x > 5.5 && size.x < 6, `length ${size.x}`);
  assert.ok(size.z > 1.95 && size.z < 2.1, `width ${size.z}`);
  assert.ok(size.y > 0.95 && size.y < 1.25, `height ${size.y}`);
  assert.ok(Math.abs(box(group).min.y) < 1e-3, `lowest point ${box(group).min.y}`);
});

test('wheel hubs sit on the physics axles, left wheels at -z, tires on the ground', () => {
  const c = DEFAULT_CAR, F = c.wheelbase * (1 - c.frontWeight), R = -c.wheelbase * c.frontWeight;
  const { group, wheels } = buildModelCar(template, c);
  group.updateMatrixWorld(true);
  wheels.forEach((w, i) => {
    const p = w.pivot.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(p.x - (i < 2 ? F : R)) < 1e-6, `wheel ${i} x ${p.x}`);
    assert.ok(Math.sign(p.z) === (i % 2 ? 1 : -1) && Math.abs(Math.abs(p.z) - c.track / 2) < 0.06, `wheel ${i} z ${p.z}`);
    assert.ok(box(w.spin).min.y < 0.02, `tire ${i} touches the ground`);
    assert.equal(w.front, i < 2);
  });
});

test('spinning a wheel keeps its envelope; steering turns the front upright too', () => {
  const { wheels } = buildModelCar(template, DEFAULT_CAR), w = wheels[0];
  const before = box(w.spin), upright = w.pivot.children.find(o => o !== w.spin.parent), uprightBefore = box(upright);
  w.spin.rotation.z = 1.3;
  const after = box(w.spin);
  // The front wheels have camber and toe: spun off their own axle they wobble by ~3 cm.
  assert.ok(after.min.distanceTo(before.min) < 0.005 && after.max.distanceTo(before.max) < 0.005, 'round parts keep their envelope');
  assert.ok(box(upright).min.distanceTo(uprightBefore.min) < 1e-9, 'upright does not spin');
  w.pivot.rotation.y = 0.3;
  assert.ok(box(upright).min.distanceTo(uprightBefore.min) > 0.01, 'upright steers');
});

test('sprung body rolls without moving the wheels; livery paints each car in its own colour', () => {
  const car = buildModelCar(template, DEFAULT_CAR, { paint: 0xc8102e }), other = buildModelCar(template, DEFAULT_CAR, { paint: 0x1e5bc6 });
  assert.ok(car.wheels.every(w => w.pivot.parent === car.group));
  const tires = car.wheels.map(w => box(w.spin).min.y);
  car.body.rotation.x = 0.03;
  assert.deepEqual(car.wheels.map(w => box(w.spin).min.y), tires);
  const paints = c => { const s = new Set(); c.body.traverse(o => { if (o.isMesh && o.material.userData.paint) s.add(o.material.userData.paint.getHex()); }); return [...s]; };
  assert.deepEqual(paints(car), [0xc8102e]);
  assert.deepEqual(paints(other), [0x1e5bc6]);
  assert.ok(car.driver.length >= 2 && car.eye.length === 2);
});

test('steering wheel sits ahead of the driver on the centre line and turns about its column', () => {
  const car = buildModelCar(template, DEFAULT_CAR), sw = car.steeringWheel;
  const b = box(sw), c = b.getCenter(new THREE.Vector3());
  assert.ok(c.x - car.eye[0] > 0.25 && c.x - car.eye[0] < 0.6, `reach ${c.x - car.eye[0]}`);
  assert.ok(car.eye[1] - c.y > 0.08 && car.eye[1] - c.y < 0.25, `drop ${car.eye[1] - c.y}`);
  assert.ok(Math.abs(c.z) < 0.02);
  sw.rotation.x = -0.3 * STEERING_RATIO;
  assert.ok(box(sw).getCenter(new THREE.Vector3()).distanceTo(c) < 0.02, 'turns in place');
});
