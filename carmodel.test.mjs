import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from './vendor/three.module.js';
import { loadCarTemplate, buildModelCar } from './carmodel.mjs';
import { DEFAULT_CAR } from './physics.mjs';

const bytes = readFileSync(new URL('./models/f222.glb', import.meta.url));
const template = await loadCarTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
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
  let tris = 0; group.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  assert.ok(tris > 50000 && tris < 80000, `${tris} triangles`);
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
