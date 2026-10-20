import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { buildF1Car, loft } from '../src/car3d.mjs';
import { DEFAULT_CAR } from '../src/physics.mjs';

const { group, wheels } = buildF1Car(DEFAULT_CAR);
group.updateMatrixWorld(true);

test('3D car fits 2022-era F1 envelope (5.6 m long, 2.0 m wide, 0.95 m tall)', () => {
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3());
  assert.ok(size.x > 5.2 && size.x <= 5.65, `length ${size.x}`);
  assert.ok(size.z > 1.9 && size.z <= 2.0, `width ${size.z}`);
  assert.ok(size.y > 0.85 && size.y <= 0.96, `height ${size.y}`);
  assert.ok(Math.abs(box.min.y) < 1e-6, `lowest point ${box.min.y} must touch the ground`);
});

test('wheel hubs sit exactly where the physics model puts its contact patches', () => {
  const c = DEFAULT_CAR, F = c.wheelbase * (1 - c.frontWeight), R = -c.wheelbase * c.frontWeight;
  const expected = [[F, -c.track / 2], [F, c.track / 2], [R, -c.track / 2], [R, c.track / 2]];
  assert.equal(wheels.length, 4);
  wheels.forEach((w, i) => {
    const p = w.pivot.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(p.x - expected[i][0]) < 1e-9 && Math.abs(p.z - expected[i][1]) < 1e-9 && Math.abs(p.y - c.wheelRadius) < 1e-9);
    const tire = new THREE.Box3().setFromObject(w.spin);
    assert.ok(Math.abs(tire.min.y) < 1e-3, `tire ${i} touches the ground (${tire.min.y})`);
  });
});

test('nothing but tires and plank reaches below 25 mm ride height', () => {
  const low = [];
  group.traverse(o => {
    if (!o.isMesh || wheels.some(w => w.spin === o.parent || w.pivot === o.parent)) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.min.y < 0.025 && o.material.color.getHex() !== 0x8b6a3e) low.push(b.min.y);
  });
  assert.deepEqual(low, []);
});

test('loft produces closed geometry with outward normals', () => {
  const [body] = loft([[1, 0.5, 0, 1, 2], [-1, 0.5, 0, 1, 2]], 16);
  const p = body.attributes.position, n = body.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const r = new THREE.Vector3(0, p.getY(i) - 0.5, p.getZ(i));
    assert.ok(r.dot(new THREE.Vector3(0, n.getY(i), n.getZ(i))) > 0, `normal ${i} points inward`);
  }
});

test('mesh is detailed but light enough for 60 fps', () => {
  let tris = 0, meshes = 0;
  group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  assert.ok(meshes > 60 && tris > 15000 && tris < 200000, `${meshes} meshes, ${tris} triangles`);
});

test('sprung body rolls, pitches and heaves without moving the planted wheels', () => {
  const car = buildF1Car(DEFAULT_CAR);
  assert.ok(car.wheels.every(w => w.pivot.parent === car.group), 'wheels are outside the sprung body');
  car.group.updateMatrixWorld(true);
  const tiresBefore = car.wheels.map(w => new THREE.Box3().setFromObject(w.spin).min.y);
  const bodyBox = () => new THREE.Box3().setFromObject(car.body);
  const level = bodyBox();
  // 1° roll (left side up), 1° nose-down pitch and 15 mm of aero squat, as index.html applies them.
  const roll = Math.PI / 180, pitch = Math.PI / 180;
  car.body.rotation.set(roll, 0, -pitch); car.body.position.y = -0.015; car.group.updateMatrixWorld(true);
  const moved = bodyBox();
  assert.ok(Math.abs(moved.max.y - level.max.y) > 0.005, 'body attitude changes its extent');
  const tiresAfter = car.wheels.map(w => new THREE.Box3().setFromObject(w.spin).min.y);
  tiresAfter.forEach((y, i) => assert.ok(Math.abs(y - tiresBefore[i]) < 1e-9, `tire ${i} stays on the ground`));
  // Nose-down pitch lowers the front wing, left-side-up roll raises the left (-z) sidepod.
  const point = (x, y, z) => car.body.localToWorld(new THREE.Vector3(x, y, z));
  assert.ok(point(2.5, 0.1, 0).y < 0.1 - 0.015, 'nose dips');
  assert.ok(point(0, 0.3, -0.6).y > point(0, 0.3, 0.6).y, 'left side rises');
});

test('livery recolours the paint and accent without changing the geometry', () => {
  const rival = buildF1Car(DEFAULT_CAR, { paint: 0xc8102e, accent: 0xf4f4f4, helmet: 0xf4f4f4 });
  const meshes = g => { const out = []; g.traverse(o => { if (o.isMesh) out.push(o.material.color.getHex()); }); return out; };
  const colours = new Set(meshes(rival.group));
  assert.equal(meshes(rival.group).length, meshes(buildF1Car(DEFAULT_CAR).group).length);
  assert.ok(colours.has(0xc8102e) && colours.has(0xf4f4f4) && !colours.has(0x0d2340) && !colours.has(0x39e0ae));
});
