import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { SCENERY, coast } from '../src/scenery.mjs';

// A do-nothing 2D canvas so buildCircuitWorld's textures can be drawn in Node.
const ctx = new Proxy({}, { get: (_, k) => k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
globalThis.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => ctx }), createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
const { buildCircuitWorld } = await import('../src/world3d.mjs');

test('every real circuit has its scenery, with tree weights summing to 1', () => {
  for (const key of Object.keys(CIRCUITS).filter(k => k !== 'rwanda')) {
    const s = SCENERY[key];
    assert.ok(s, key);
    const sum = Object.values(s.trees).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9 && s.clusters > 0, key);
  }
  assert.equal(SCENERY.rwanda, undefined);
});

test('the coast lies 160 m beyond the circuit, towards the bearing', () => {
  const c = coast([[0, 0], [100, 50], [-30, 20]], 270);
  assert.ok(Math.abs(c.dir[0] + 1) < 1e-12 && Math.abs(c.dir[1]) < 1e-12);
  assert.ok(Math.abs(c.seaSide(-30, 0) + 160) < 1e-9 && Math.abs(c.seaSide(-190, 99) - 0) < 1e-9);
});

const meshes = world => { const out = []; world.traverse(o => o.isMesh && out.push(o)); return out; };
const kindsOf = world => meshes(world).filter(m => m.isInstancedMesh && m.count > 0 && !m.geometry.parameters).length;

test('coastal circuits get the sea beside them, below every part of the road', () => {
  for (const key of ['zandvoort', 'jeddah', 'monaco']) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: SCENERY[key] });
    const sea = meshes(world).find(m => m.material.color?.getHex() === 0x1f5b78);
    assert.ok(sea, key);
    let lo = Infinity;
    for (let s = 0; s < track.length; s += 5) lo = Math.min(lo, track.elevation(s, -track.roadWidth / 2), track.elevation(s, track.roadWidth / 2));
    assert.ok(sea.position.y < lo - 2, `${key}: sea ${sea.position.y} road ${lo}`);
    // No tree stands in the water.
    const c = coast(Array.from(track.samples.x, (x, i) => [x, track.samples.y[i]]), SCENERY[key].sea), m = new (sea.matrix.constructor)();
    for (const t of meshes(world).filter(o => o.isInstancedMesh && o.count > 0 && !o.geometry.parameters)) {
      for (let i = 0; i < t.count; i++) { t.getMatrixAt(i, m); assert.ok(c.seaSide(m.elements[12], -m.elements[14]) < 0, key); }
    }
  }
});

test('inland circuits have no sea; desert circuits only palms, Spa conifers and broadleaves', () => {
  const spa = buildCircuitWorld(createCircuitTrack(CIRCUITS.spa), { scenery: SCENERY.spa });
  assert.ok(!meshes(spa).some(m => m.material.color?.getHex() === 0x1f5b78));
  assert.equal(kindsOf(spa), 2);
  const bahrain = buildCircuitWorld(createCircuitTrack(CIRCUITS.bahrain), { scenery: SCENERY.bahrain });
  assert.equal(kindsOf(bahrain), 1);
});
const townOf = world => meshes(world).find(m => m.userData.kind === 'buildings');
test('town circuits get buildings clear of the road and the sea; Monaco is lined with them', () => {
  for (const key of ['monaco', 'interlagos', 'mexico', 'jeddah', 'yas-marina']) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: SCENERY[key] }), town = townOf(world);
    assert.ok(town && town.count > 0, key);
    const m = new (town.matrix.constructor)(), c = SCENERY[key].sea == null ? null : coast(Array.from(track.samples.x, (x, i) => [x, track.samples.y[i]]), SCENERY[key].sea);
    for (let i = 0; i < town.count; i++) {
      town.getMatrixAt(i, m);
      const e = m.elements, x = e[12], y = -e[14], hw = Math.hypot(e[0], e[2]) / 2, hd = Math.hypot(e[8], e[10]) / 2;
      // Every corner of the footprint is behind the barriers, and on land.
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = x + u * e[0] / 2 + v * e[8] / 2, py = y - (u * e[2] / 2 + v * e[10] / 2);
        assert.ok(Math.abs(track.offset(px, py)) > track.wallOffset + 3, `${key} block ${i}`);
        if (c) assert.ok(c.seaSide(px, py) < 0, `${key} block ${i} in the sea`);
      }
      assert.ok(hw > 5 && hd > 4, key);
    }
    if (key === 'monaco') assert.ok(town.count >= 500, `monaco: ${town.count}`);
  }
  for (const key of ['spa', 'silverstone']) assert.equal(townOf(buildCircuitWorld(createCircuitTrack(CIRCUITS[key]), { scenery: SCENERY[key] })), undefined, key);
});
