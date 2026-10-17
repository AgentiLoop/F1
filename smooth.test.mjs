import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { smoothGeometry } from './smooth.mjs';
import { mergeVertices } from './vendor/BufferGeometryUtils.js';

// Distances from the origin of every vertex and every triangle centre (non-indexed).
const radii = g => {
  const p = g.toNonIndexed().attributes.position, r = [], c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = i; k < i + 3; k++) { r.push(Math.hypot(p.getX(k), p.getY(k), p.getZ(k))); c.x += p.getX(k) / 3; c.y += p.getY(k) / 3; c.z += p.getZ(k) / 3; }
    r.push(c.length());
  }
  return r;
};

test('hard edges stay creases: a cube keeps its box and flat faces, 4x the triangles', () => {
  const cube = new THREE.BoxGeometry(2, 1, 1), g = smoothGeometry(cube);
  assert.equal(g.index.count, 4 * cube.index.count);
  g.computeBoundingBox();
  assert.ok(g.boundingBox.min.distanceTo(new THREE.Vector3(-1, -0.5, -0.5)) < 1e-6 && g.boundingBox.max.distanceTo(new THREE.Vector3(1, 0.5, 0.5)) < 1e-6);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))) > 0.999, 'face normals stay axis-aligned');
});

test('soft edges round off: an icosahedron moves toward a sphere and shades smooth', () => {
  const ico = new THREE.IcosahedronGeometry(1, 0); ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const g = smoothGeometry(mergeVertices(ico));
  const spread = r => Math.max(...r) / Math.min(...r);
  assert.ok(spread(radii(g)) < 0.5 * spread(radii(ico)) + 0.5, `radius spread ${spread(radii(g))} vs ${spread(radii(ico))}`);
  // Smooth shading: vertex normals follow the position, not the faces.
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    assert.ok(v.dot(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i))) > 0.97, 'normal points outward along the radius');
  }
});

test('mirrored parts keep the authored facing: reversed winding, outward normals stay outward', () => {
  const ico = new THREE.IcosahedronGeometry(1, 1); ico.deleteAttribute('uv');
  const m = mergeVertices(ico), idx = m.index.array;
  for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  for (const levels of [1, 2]) {
    const g = smoothGeometry(m, { levels }), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      assert.ok(v.dot(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i))) > 0.9, `levels ${levels}: normal points outward`);
    }
  }
});
