import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { buildCircuitWorld } from '../src/world3d.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';

// Scenery construction needs canvas/image objects, but no renderer or GPU.
const context = new Proxy({
  measureText: () => ({ width: 100 }),
  createLinearGradient: () => ({ addColorStop() {} }),
}, { get: (target, key) => target[key] ?? (() => {}) });

function scenery(track) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }),
  };
  try { return buildCircuitWorld(track); }
  finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

for (const sloped of [false, true]) test(`roadside signs follow ${sloped ? 'uphill and downhill grades' : 'flat ground'}`, () => {
  const track = createCircuitTrack(CIRCUITS.monza);
  // An analytic ground plane exercises both sign faces without generating terrain.
  const height = (x, y) => sloped ? 12 + 0.12 * x - 0.08 * y : 0;
  track.elevation = (s, off = 0) => height(...track.point(s, off));
  track.heightAt = height;
  const world = scenery(track);
  try {
    const boards = world.children.find(m => m.isInstancedMesh && m.geometry.parameters?.width === 8);
    assert.ok(boards?.count > 0);
    let uphill = 0, downhill = 0;
    for (let i = 0; i < boards.count; i++) {
      const matrix = new THREE.Matrix4(); boards.getMatrixAt(i, matrix);
      const center = new THREE.Vector3().setFromMatrixPosition(matrix);
      const along = new THREE.Vector3().setFromMatrixColumn(matrix, 0);
      const facing = new THREE.Vector3().setFromMatrixColumn(matrix, 2);
      const horizontal = Math.hypot(along.x, along.z);
      const expected = sloped ? (0.12 * along.x + 0.08 * along.z) / horizontal : 0;
      assert.ok(Math.abs(along.y / horizontal - expected) < 1e-5, `sign ${i}: grade ${along.y / horizontal}, expected ${expected}`);
      assert.ok(Math.abs(center.y - height(center.x, -center.z) - 0.75) < 1e-4, `sign ${i}: height`);
      assert.ok(Math.abs(facing.y) < 1e-6, 'sign still faces horizontally toward the road');
      if (expected > 0.03) uphill++;
      if (expected < -0.03) downhill++;
    }
    if (sloped) assert.ok(uphill > 0 && downhill > 0, 'both sides and grade directions exercised');
  } finally {
    world.traverse(m => {
      m.geometry?.dispose();
      for (const material of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) material.dispose();
    });
  }
});
