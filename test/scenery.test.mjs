import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { SCENERY, waterField, terrainField, landcoverField } from '../src/scenery.mjs';

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

const meshes = world => { const out = []; world.traverse(o => o.isMesh && out.push(o)); return out; };
const kindsOf = world => meshes(world).filter(m => m.isInstancedMesh && m.count > 0 && !m.geometry.parameters).length;

test('coastal circuits get the real sea (OpenStreetMap) beside them, below the road, off it, with no tree in it', () => {
  assert.deepEqual(Object.keys(SCENERY).filter(k => SCENERY[k].sea).sort(), ['bahrain', 'jeddah', 'monaco', 'yas-marina', 'zandvoort']);
  for (const key of ['zandvoort', 'jeddah', 'monaco', 'yas-marina']) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: SCENERY[key] }), sf = waterField(SCENERY[key].sea);
    const seas = meshes(world).filter(m => m.userData.kind === 'sea');
    assert.equal(seas.length, sf.list.length, key);
    let lo = Infinity, near = Infinity;
    for (let s = 0; s < track.length; s += 5) lo = Math.min(lo, track.elevation(s, -track.roadWidth / 2), track.elevation(s, track.roadWidth / 2));
    for (const m of seas) assert.ok(m.position.y < lo - 2, `${key}: sea ${m.position.y} road ${lo}`);
    for (let i = 0; i < track.samples.x.length; i++) near = Math.min(near, sf.sd(track.samples.x[i], track.samples.y[i], Infinity));
    assert.ok(near > 0 && near < 500, `${key}: road ${near} m from the sea`);
    // The ground dips under the sea (Port Hercule and Yas Marina right up to the barriers).
    const P = meshes(world).filter(o => o.material.vertexColors && o.geometry.index).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0].geometry.attributes.position;
    let wet = 0;
    for (let i = 0; i < P.count; i += 7) {
      const x = P.getX(i), y = -P.getZ(i);
      if (Math.abs(track.offset(x, y)) < track.wallOffset + 15 || sf.sd(x, y, Infinity) > -5) continue;
      assert.ok(P.getY(i) < seas[0].position.y, `${key}: ground above the sea`); wet++;
    }
    assert.ok(wet > 500, `${key}: ${wet} ground points under the sea`);
    const m = new (seas[0].matrix.constructor)();
    for (const t of meshes(world).filter(o => o.isInstancedMesh && o.count > 0 && !o.geometry.parameters && o.userData.kind !== 'buildings')) {
      for (let i = 0; i < t.count; i++) { t.getMatrixAt(i, m); assert.ok(sf.sd(m.elements[12], -m.elements[14], Infinity) > 0, `${key}: tree in the sea`); }
    }
  }
});

test('inland circuits have no sea; desert circuits only palms, Spa conifers and broadleaves', () => {
  const spa = buildCircuitWorld(createCircuitTrack(CIRCUITS.spa), { scenery: SCENERY.spa });
  assert.ok(!meshes(spa).some(m => m.userData.kind === 'sea'));
  assert.equal(kindsOf(spa), 2);
  const bahrain = buildCircuitWorld(createCircuitTrack(CIRCUITS.bahrain), { scenery: SCENERY.bahrain });
  assert.equal(kindsOf(bahrain), 1);
});
const townOf = world => { let t; world.traverse(o => { if (o.isGroup && o.userData.kind === 'buildings') t = o; }); return t; };
test('every real circuit gets its real buildings (OpenStreetMap), clear of the road, the sea and the water; Monaco is lined with them', () => {
  const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const counts = {};
  for (const key of Object.keys(SCENERY)) {
    const s = SCENERY[key], track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: s }), town = townOf(world);
    assert.ok(s.buildings && town && town.userData.count > 0, key);
    // Most of the imported footprints are placed.
    assert.ok(town.userData.count > 0.6 * s.buildings.length, `${key}: ${town.userData.count} of ${s.buildings.length}`);
    const sea = s.sea && waterField(s.sea), water = s.water && waterField(s.water);
    for (const b of town.userData.blocks) {
      assert.ok(area(b.ring) > 0 && b.top > b.base + 2, key);
      for (const [x, y] of b.ring) {
        assert.ok(Math.abs(track.offset(x, y)) > track.wallOffset + 3, `${key}: building on the road`);
        if (sea) assert.ok(sea.sd(x, y, Infinity) > 0, `${key}: building in the sea`);
        if (water) assert.ok(water.sd(x, y) > 0, `${key}: building in the water`);
      }
    }
    counts[key] = town.userData.count;
  }
  assert.ok(counts.monaco >= 1000, `monaco: ${counts.monaco}`);
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

test('every real circuit stands on the real ground (terrain tiles), which meets the road heights; Spa and the Red Bull Ring in their hills', () => {
  for (const key of Object.keys(CIRCUITS).filter(k => k !== 'rwanda')) {
    const t = SCENERY[key].terrain, track = createCircuitTrack(CIRCUITS[key]), { x: X, y: Y, s: S } = track.samples, ground = terrainField(t);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < X.length; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
    const R = Math.hypot(x1 - x0, y1 - y0) / 2 + 1400;
    // Covers the whole 3D terrain square.
    assert.ok(t.x0 <= (x0 + x1) / 2 - R && t.y0 <= (y0 + y1) / 2 - R && t.x0 + (t.nx - 1) * t.step >= (x0 + x1) / 2 + R && t.y0 + (t.ny - 1) * t.step >= (y0 + y1) / 2 + R, key);
    const gaps = [];
    for (let i = 0; i < X.length; i += 5) gaps.push(Math.abs(track.elevation(S[i]) - ground(X[i], Y[i])));
    gaps.sort((a, b) => a - b);
    assert.ok(gaps[gaps.length >> 1] < 5, `${key}: road vs ground median ${gaps[gaps.length >> 1]} m`);
  }
  for (const [key, relief] of [['spa', 150], ['red-bull-ring', 300]]) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: SCENERY[key] }), ground = terrainField(SCENERY[key].terrain);
    const P = meshes(world).filter(o => o.material.vertexColors && o.geometry.index).sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0].geometry.attributes.position;
    const wet = waterField(SCENERY[key].water);
    let lo = Infinity, hi = -Infinity, far = 0;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = -P.getZ(i), h = P.getY(i);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      // Well away from the road and the water the mesh is the real ground.
      if (Math.abs(track.offset(x, y)) > track.wallOffset + 200 && wet.sd(x, y, 50) > 50 && i % 13 === 0) { assert.ok(Math.abs(h - ground(x, y)) < 0.01, `${key}: ${h} vs ${ground(x, y)}`); far++; }
    }
    assert.ok(far > 200 && hi - lo > relief, `${key}: ${far} points, relief ${hi - lo} m`);
  }
});

test('the trees are the real woods and trees (OpenStreetMap), clear of the road, the sea, the water and the buildings; Spa and Monza in their woods', () => {
  const real = {};
  for (const [key, s] of Object.entries(SCENERY)) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: s });
    const trees = meshes(world).filter(m => m.userData.kind === 'trees'), m = new (world.matrix.constructor)();
    const sea = s.sea && waterField(s.sea), water = s.water && waterField(s.water), town = townOf(world);
    real[key] = trees.reduce((a, t) => a + t.userData.real, 0);
    assert.ok(trees.length && trees.reduce((a, t) => a + t.count, 0) <= 6000 + (real[key] < 200 ? s.clusters * 3 : 0), key);
    for (const t of trees) for (let i = 0; i < t.count; i += 3) {
      t.getMatrixAt(i, m);
      const x = m.elements[12], y = -m.elements[14];
      assert.ok(Math.abs(track.offset(x, y)) > track.roadWidth / 2 + 20, `${key}: tree on the road`);
      if (sea) assert.ok(sea.sd(x, y, Infinity) > 0, `${key}: tree in the sea`);
      if (water) assert.ok(water.sd(x, y) > 0, `${key}: tree in the water`);
      if (town) for (const b of town.userData.blocks) if (x > b.box[0] && x < b.box[2] && y > b.box[1] && y < b.box[3]) {
        let inside = false;
        for (let p = 0, q = b.ring.length - 1; p < b.ring.length; q = p++) if ((b.ring[p][1] > y) !== (b.ring[q][1] > y) && x < (b.ring[q][0] - b.ring[p][0]) * (y - b.ring[p][1]) / (b.ring[q][1] - b.ring[p][1]) + b.ring[p][0]) inside = !inside;
        assert.ok(!inside, `${key}: tree in a building`);
      }
    }
  }
  // Every circuit OSM maps trees around plants them; the forests at Spa, the
  // Red Bull Ring and Monza's park fill the cap.
  for (const key of Object.keys(SCENERY).filter(k => k !== 'jeddah')) assert.ok(real[key] >= 200, `${key}: ${real[key]} real trees`);
  for (const key of ['spa', 'red-bull-ring', 'monza']) assert.equal(real[key], 6000, key);
});

test('landcoverField rasterises areas in order, smaller ones over larger, with holes', () => {
  const field = landcoverField([[2, [0, 0, 100, 0, 100, 100, 0, 100], [40, 40, 40, 60, 60, 60, 60, 40]], [6, [70, 70, 90, 70, 90, 90, 70, 90]]]);
  assert.equal(field(10, 10), 2);
  assert.equal(field(50, 50), 0, 'hole');
  assert.equal(field(80, 80), 6, 'later area on top');
  assert.equal(field(-10, 50), 0);
  assert.equal(field(150, 50), 0);
});

test('every real circuit gets its real land cover (OpenStreetMap) on the ground, with no tree on sand, gravel or paving', () => {
  for (const key of Object.keys(CIRCUITS).filter(k => k !== 'rwanda')) assert.ok(SCENERY[key].landcover?.length > 40, key);
  const cases = { hungaroring: 1, imola: 1, monza: 2, zandvoort: 3, bahrain: 4, jeddah: 6 };
  for (const [key, cls] of Object.entries(cases)) {
    const world = buildCircuitWorld(createCircuitTrack(CIRCUITS[key]), { scenery: SCENERY[key] }), field = landcoverField(SCENERY[key].landcover);
    const ground = meshes(world).find(m => m.userData.kind === 'ground');
    const { covered } = ground.userData, total = covered.reduce((a, b) => a + b, 0);
    assert.ok(covered[cls] > total * 0.01, `${key}: class ${cls} on ${covered[cls]} of ${total} ground points`);
    const m = new (ground.matrix.constructor)();
    for (const t of meshes(world).filter(o => o.isInstancedMesh && o.userData.kind === 'trees')) {
      for (let i = 0; i < t.count; i++) { t.getMatrixAt(i, m); assert.ok(field(m.elements[12], -m.elements[14]) < 4, `${key}: tree on bare ground`); }
    }
  }
});

test('with its land cover, a real circuit\'s run-off is its real surface: gravel traps at Catalunya and the Red Bull Ring, paved run-off at Miami', () => {
  const share = (key, name) => {
    const t = createCircuitTrack({ ...CIRCUITS[key], cover: landcoverField(SCENERY[key].landcover) }), half = t.roadWidth / 2;
    let n = 0, hit = 0;
    for (let s = 0; s < t.length; s += 8) for (const side of [-1, 1]) { const [x, y] = t.point(s, side * (half + 5)); if (t.surface(x, y) === 'pit') continue; n++; if (t.surface(x, y) === name) hit++; }
    return { t, frac: hit / n };
  };
  const cat = share('catalunya', 'gravel');
  assert.ok(cat.frac > 0.1, `catalunya gravel ${cat.frac}`);
  assert.ok(share('red-bull-ring', 'gravel').frac > 0.05);
  assert.ok(share('miami', 'runoff').frac > 0.2);
  // A gravel point gives the physics a ploughing surface; the road stays asphalt.
  let g = null;
  for (let s = 0; s < cat.t.length && !g; s += 4) { const p = cat.t.point(s, cat.t.roadWidth / 2 + 5); if (cat.t.surface(...p) === 'gravel') g = p; }
  assert.deepEqual(cat.t.surfaceAt(...g), { grip: 0.45, rolling: 0.25 });
  assert.equal(cat.t.surfaceAt(...cat.t.point(100)), 1);
});

test('every real circuit gets its real roads and streets (OpenStreetMap), on the ground, clear of the circuit, the sea and the water, with no tree on them', () => {
  const km = {};
  for (const [key, s] of Object.entries(SCENERY)) {
    const track = createCircuitTrack(CIRCUITS[key]), world = buildCircuitWorld(track, { scenery: s });
    const roads = meshes(world).filter(m => m.userData.kind === 'roads');
    assert.ok(s.roads && roads.length === 1, key);
    const P = roads[0].geometry.attributes.position, sea = s.sea && waterField(s.sea), water = s.water && waterField(s.water);
    // Each step's two edge vertices: their middle is the road's centre.
    const centres = [];
    for (let i = 0; i < P.count; i += 2) {
      const x = (P.getX(i) + P.getX(i + 1)) / 2, y = -(P.getZ(i) + P.getZ(i + 1)) / 2, hw = Math.hypot(P.getX(i) - P.getX(i + 1), P.getZ(i) - P.getZ(i + 1)) / 2;
      assert.ok(Math.abs(track.offset(x, y)) > track.wallOffset + hw + 2, `${key}: street on the circuit`);
      if (sea) assert.ok(sea.sd(x, y, Infinity) > 0, `${key}: street in the sea`);
      if (water) assert.ok(water.sd(x, y) > 0, `${key}: street in the water`);
      centres.push([x, y, hw]);
    }
    km[key] = roads[0].userData.km;
    const m = new (world.matrix.constructor)(), grid = new Map(), cell = 20;
    for (const c of centres) { const k = `${Math.floor(c[0] / cell)},${Math.floor(c[1] / cell)}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(c); }
    for (const t of meshes(world).filter(o => o.userData.kind === 'trees')) for (let i = 0; i < t.count; i++) {
      t.getMatrixAt(i, m);
      const x = m.elements[12], y = -m.elements[14];
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const [cx, cy, hw] of grid.get(`${Math.floor(x / cell) + u},${Math.floor(y / cell) + v}`) ?? []) {
        assert.ok(Math.hypot(x - cx, y - cy) > hw + 2, `${key}: tree on a street`);
      }
    }
  }
  // Every circuit has streets around it; Monte Carlo, Montreal's island and Miami's stadium grounds many.
  for (const key of Object.keys(SCENERY)) assert.ok(km[key] > 3, `${key}: ${km[key]} km`);
  assert.ok(km.monaco > 20, `monaco: ${km.monaco} km`);
});
