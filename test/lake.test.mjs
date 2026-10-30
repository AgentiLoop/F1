import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLake, lakeIslands } from '../src/lake.mjs';
import { lakeSdf } from '../src/world3d.mjs';

const BLOBS = [[-470, -60, 125], [-1500, 100, 500], [-1700, -600, 520]];

test('papyrus islands sit on open water, apart from each other', () => {
  const list = lakeIslands(lakeSdf);
  assert.ok(list.length >= 20, `${list.length} islands`);
  for (const o of list) {
    assert.ok(lakeSdf(o.x, o.z) <= -30, `island at ${o.x}, ${o.z} is out on the water`);
    for (const p of list) if (p !== o) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= o.r + p.r + 25);
  }
});

test('the lake is a reflecting water plane at lake level with its islands', () => {
  const lake = buildLake(BLOBS, 1.5, lakeSdf);
  const water = lake.getObjectByName('lake'), islands = lake.getObjectByName('lake-islands');
  assert.equal(water.position.y, 1.5);
  assert.equal(typeof water.onBeforeRender, 'function');
  assert.ok(water.material.uniforms.tReflect.value, 'reflection texture bound');
  assert.equal(islands.count, lake.userData.islands.length);
});
