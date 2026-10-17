import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { buildF1Car, loft } from './car3d.mjs';
import { DEFAULT_CAR } from './physics.mjs';

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
