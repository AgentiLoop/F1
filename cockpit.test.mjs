import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from './vendor/three.module.js';
import { loadCarTemplate, buildModelCar, HEADREST } from './carmodel.mjs';
import { carbonWeave, splitTriangles, addBoxUV, CARBON_PARTS, WEAVE_TILE } from './cockpit.mjs';
import { DEFAULT_CAR } from './physics.mjs';

const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const bytes = readFileSync(new URL('./models/f222.glb', import.meta.url));
const template = await loadCarTemplate(ab(bytes), null);

test('carbon weave is a 2x2 twill: tows alternate direction diagonally and repeat every 4 tows', () => {
  const { map, height, size } = carbonWeave(64, 8), tw = 8, px = map.image.data;
  const tone = (i, j) => px[4 * ((j * tw + tw / 2) * size + i * tw + tw / 2)];
  // Tow centres along u are brighter than tows along v; the pattern shifts one tow per row.
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const alongU = ((i - j) % 4 + 4) % 4 < 2;
    assert.ok(alongU ? tone(i, j) > 35 : tone(i, j) < 30, `tow ${i},${j} ${tone(i, j)}`);
    assert.equal(alongU, ((i + 1 - (j + 1)) % 4 + 4) % 4 < 2);
  }
  // Tows are raised in the middle and dip at their edges.
  assert.ok(height[(tw / 2) * size + tw / 2] > 0.6 && height[0] < 0.4);
  assert.equal(map.wrapS, THREE.RepeatWrapping);
});

test('splitTriangles moves matching triangles into a sibling mesh with just their vertices', () => {
  const g = new THREE.BoxGeometry(1, 1, 1), parent = new THREE.Group(), mesh = new THREE.Mesh(g);
  parent.add(mesh); mesh.position.x = 5;
  const part = splitTriangles(mesh, c => c.y > 0.4, 'top');
  assert.equal(part.geometry.index.count, 6); assert.equal(g.index.count, 30);
  assert.equal(part.geometry.attributes.position.count, 4, 'only the vertices of the moved face');
  assert.ok(new THREE.Box3().setFromBufferAttribute(part.geometry.attributes.position).min.y > 0.49);
  assert.equal(part.parent, parent); assert.equal(part.position.x, 5);
  assert.equal(splitTriangles(mesh, () => false, 'none'), null);
});

test('box UVs are in weave tiles per metre along the face plane', () => {
  const g = new THREE.PlaneGeometry(WEAVE_TILE * 2, WEAVE_TILE), uv = () => g.attributes.uv;
  addBoxUV(g, new THREE.Matrix4());
  const u = [...Array(4).keys()].map(i => uv().getX(i)), v = [...Array(4).keys()].map(i => uv().getY(i));
  assert.ok(Math.abs(Math.max(...u) - Math.min(...u) - 2) < 1e-6 && Math.abs(Math.max(...v) - Math.min(...v) - 1) < 1e-6);
});

test('cockpit tub is textured carbon and the headrest around the head is padding, not livery', () => {
  const car = buildModelCar(template, DEFAULT_CAR, { paint: 0xc8102e });
  const lodOf = n => car.group.getObjectByName(n);
  for (const n of CARBON_PARTS) lodOf(n).levels.forEach(l => {
    assert.equal(l.object.material.name, 'cockpit-carbon', n);
    assert.ok(l.object.material.map && l.object.material.normalMap && l.object.geometry.attributes.uv, `${n} weave`);
  });
  const pad = lodOf(HEADREST);
  pad.levels.forEach(l => assert.equal(l.object.material.name, 'cockpit-padding'));
  assert.ok(pad.levels[0].object.geometry.attributes.uv);
  // The padding surrounds the helmet: both sides of it and behind it, within the cockpit opening.
  const b = new THREE.Box3().setFromObject(pad, true), helmet = new THREE.Box3().setFromObject(car.driver[0]);
  assert.ok(b.min.z < helmet.min.z && b.max.z > helmet.max.z, `sides ${b.min.z} ${b.max.z}`);
  assert.ok(b.min.x < helmet.min.x && b.max.x > helmet.min.x, 'behind the head');
  assert.ok(b.min.y > 0.55 && b.max.y < 0.95, `height ${b.min.y} ${b.max.y}`);
  const far = pad.levels.at(-1).object.geometry.index.count / 3;
  assert.ok(far > 100 && far < 1500, `${far} padding triangles`);
  // The livery body no longer covers those triangles.
  const body = lodOf('Object_60').levels.at(-1).object;
  assert.equal(body.material.color.getHex(), 0xc8102e);
  assert.equal(body.geometry.index.count / 3 + far, 7056);
});
