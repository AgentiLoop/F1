import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { structuresPlan } from '../src/structures.mjs';
import { lakeSdf } from '../src/world3d.mjs';

const track = createCircuitTrack(CIRCUITS.rwanda), wallAt = track.wallOffset, half = track.roadWidth / 2;
// Stand-in terrain: the road's height out to the barriers, the lake below its level.
const terrain = {
  height: (x, y) => lakeSdf(x, -y) < 0 ? track.lakeLevel - 2 : track.heightAt(x, y),
  dist: (x, y) => { let d = Infinity; for (let s = 0; s < track.length; s += 10) { const [px, py] = track.point(s); d = Math.min(d, Math.hypot(x - px, y - py)); } return d; },
  lake: (x, y) => lakeSdf(x, -y),
};
const plan = structuresPlan(track, terrain);

test('RISE footbridges: piers outside both barriers, deck at least 6 m over the road', () => {
  assert.equal(plan.bridges.length, 2);
  for (const b of plan.bridges) {
    const h = track.heading(b.s), a = h + b.yaw;
    // the deck runs along the bridge's local x: right of the race direction, turned by yaw
    const at = d => [b.x + Math.sin(a) * d, b.y - Math.cos(a) * d];
    for (const side of [-1, 1]) assert.ok(Math.abs(track.offset(...at(side * b.half))) > wallAt + 1, `pier at ${b.s}`);
    for (let d = -half; d <= half; d += 1.5) { const [x, y] = at(d); assert.ok(b.h - 0.45 - track.heightAt(x, y) > 6, `clearance at ${b.s}, ${d}`); }
  }
});

test('RISE floodlights, paddock and villages stay off the road and out of the lake', () => {
  assert.ok(plan.masts.length > 100, `${plan.masts.length} masts`);
  for (const m of plan.masts) assert.ok(Math.abs(track.offset(m.x, m.y)) > wallAt + 3 && lakeSdf(m.x, -m.y) > 0);
  assert.ok(Math.abs(track.offset(plan.tower.x, plan.tower.y)) > wallAt + 60);
  assert.ok(plan.domes.length + plan.huts.length > 10, `${plan.domes.length} domes, ${plan.huts.length} huts`);
  for (const o of [...plan.domes, ...plan.huts]) assert.ok(Math.abs(track.offset(o.x, o.y)) > wallAt + 16);
  assert.ok(plan.houses.length > 100, `${plan.houses.length} houses`);
  for (const o of plan.houses) assert.ok(Math.abs(track.offset(o.x, o.y)) > 200 && lakeSdf(o.x, -o.y) > 50);
  assert.equal(plan.clear(plan.tower.x, plan.tower.y), false);
  assert.equal(plan.clear(plan.houses[0].x, plan.houses[0].y), false);
});

test('RISE trackside furniture: braking boards on the run-off, corner numbers and marshal posts behind the barrier, facing the cars', () => {
  // 3, 2 and 1 before each of the seven heavy-braking corners, off the road but inside the barrier
  assert.equal(plan.boards.length, 21);
  for (const b of plan.boards) { const o = Math.abs(track.offset(b.x, b.y)); assert.ok(o > half + 1 && o < wallAt, `board ${b.n} at ${o.toFixed(1)} m`); }
  assert.ok(plan.cornerSigns.length >= 15, `${plan.cornerSigns.length} corner numbers`);
  assert.ok(plan.posts.length >= 12, `${plan.posts.length} marshal posts`);
  for (const o of [...plan.cornerSigns, ...plan.posts]) assert.ok(Math.abs(track.offset(o.x, o.y)) > wallAt && lakeSdf(o.x, -o.y) > 0);
  // the front (local +z) is (sin yaw, -cos yaw) in physics x / y: back down the track
  for (const o of [...plan.boards, ...plan.cornerSigns, ...plan.posts]) {
    const h = track.heading(o.s);
    assert.ok(Math.sin(o.yaw) * Math.cos(h) - Math.cos(o.yaw) * Math.sin(h) < -0.99, `faces the cars at ${o.s}`);
  }
});
test('RISE raised billboards: behind the outside wall past Turns 3, 8, 12 and 17, facing back up the braking zone', () => {
  assert.ok(plan.billboards.length >= 3, `${plan.billboards.length} billboards`);
  for (const o of plan.billboards) {
    assert.ok(Math.abs(track.offset(o.x, o.y)) > wallAt + 3 && lakeSdf(o.x, -o.y) > 0, `billboard ${o.n}`);
    // its face (local +z: sin yaw, -cos yaw in physics x / y) points at the track 150 m before it
    const [ax, ay] = track.point(o.s - 155), d = Math.hypot(ax - o.x, ay - o.y);
    assert.ok((Math.sin(o.yaw) * (ax - o.x) - Math.cos(o.yaw) * (ay - o.y)) / d > 0.999, `billboard ${o.n} faces the braking zone`);
    assert.equal(plan.clear(o.x, o.y), false);
  }
});
