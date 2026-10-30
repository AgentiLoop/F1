import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { SCENERY, coast, waterField } from '../src/scenery.mjs';

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

test('real water (OpenStreetMap) lies off the road; Montreal has the Olympic Basin beside it', () => {
  const area = r => { let a = 0; for (let i = 0; i < r.length; i += 2) { const j = (i + 2) % r.length; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return a / 2; };
  for (const [key, s] of Object.entries(SCENERY)) {
    if (!s.water) continue;
    const track = createCircuitTrack(CIRCUITS[key]), wf = waterField(s.water);
    for (let i = 0; i < track.samples.x.length; i++) assert.ok(wf.sd(track.samples.x[i], track.samples.y[i]) > 0, `${key}: road sample ${i} in the water`);
    // Outer rings anticlockwise, islands clockwise.
    for (const p of s.water) p.forEach((r, k) => assert.ok(k ? area(r) < 0 : area(r) > 0, key));
  }
  // The rowing basin: a long strip of water (about 2.2 km × 110 m) within 150 m of the track.
  const track = createCircuitTrack(CIRCUITS.montreal), wf = waterField(SCENERY.montreal.water);
  const basin = wf.list.filter((p, k) => {
    const [x0, y0, x1, y1] = p.box, wet = area(SCENERY.montreal.water[k][0]) + SCENERY.montreal.water[k].slice(1).reduce((a, r) => a + area(r), 0);
    return Math.max(x1 - x0, y1 - y0) > 1500 && wet > 150000 && wet < 400000;
  });
  assert.equal(basin.length, 1);
  let near = Infinity;
  for (let i = 0; i < track.samples.x.length; i++) near = Math.min(near, wf.sdOf(basin[0], track.samples.x[i], track.samples.y[i]));
  assert.ok(near < 150, `basin ${near} m from the track`);
  assert.equal(SCENERY.hungaroring.water, null);
});

test('the water is drawn over ground that dips below it, with no tree in it', () => {
  for (const key of ['montreal', 'interlagos', 'imola']) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: SCENERY[key] }), wf = waterField(SCENERY[key].water);
    const ponds = meshes(world).filter(m => m.userData.kind === 'water');
    assert.equal(ponds.length, wf.list.length, key);
    const ground = meshes(world).filter(m => m.material.vertexColors && m.geometry.index).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
    const P = ground.geometry.attributes.position;
    let wet = 0;
    for (let i = 0; i < P.count; i += 3) {
      const x = P.getX(i), y = -P.getZ(i);
      if (Math.abs(track.offset(x, y)) < track.wallOffset + 15) continue;
      for (let k = 0; k < wf.list.length; k++) {
        const [x0, y0, x1, y1] = wf.list[k].box;
        if (x < x0 || x > x1 || y < y0 || y > y1 || wf.sdOf(wf.list[k], x, y) > -1) continue;
        assert.ok(P.getY(i) < ponds[k].position.y, `${key}: ground above pond ${k}`); wet++;
      }
    }
    assert.ok(wet > 100, `${key}: ${wet} ground points under water`);
    const m = new (ground.matrix.constructor)();
    for (const t of meshes(world).filter(o => o.isInstancedMesh && o.count > 0 && !o.geometry.parameters && o.userData.kind !== 'buildings')) {
      for (let i = 0; i < t.count; i++) { t.getMatrixAt(i, m); assert.ok(wf.sd(m.elements[12], -m.elements[14]) > 0, `${key}: tree in the water`); }
    }
  }
});
