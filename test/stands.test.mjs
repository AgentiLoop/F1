import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { riseStandPlan, pitBuildingSpan } from '../src/stands.mjs';

const track = createCircuitTrack(CIRCUITS.rwanda), pit = track.pit;

test('RISE grandstands: all four fit across the straight from the pits (pit.side +1 = pits on the left), clear of the barriers', () => {
  const plan = riseStandPlan(track, pit.side);
  assert.deepEqual(plan.map(p => p.s), [-185, -62, 62, 186]);
  for (const { s, front } of plan) for (let dz = -56; dz <= 56; dz += 8) for (const f of [front, front + 25.8]) {
    const [x, y] = track.point(s + dz, pit.side * f);
    assert.ok(Math.abs(track.offset(x, y)) > track.wallOffset + 3, `stand at ${s} reaches the road`);
  }
});

test('RISE pit building: covers every box and stays inside the pit lane', () => {
  for (const boxes of [5, 10, 20]) {
    const [s0, s1] = pitBuildingSpan(pit, boxes);
    assert.ok(s0 > pit.entry && s1 < pit.exit, `${boxes} boxes: ${s0}..${s1}`);
    assert.ok(s0 <= pit.boxStart - 10 && s1 >= Math.min(pit.exit - 30, pit.boxStart + pit.boxSpacing * (boxes - 1) + 10));
  }
});
