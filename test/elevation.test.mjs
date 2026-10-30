import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';

const rwanda = createCircuitTrack(CIRCUITS.rwanda);

test('the RISE Motordrome keeps its climb: 1363.5-1415 m above sea level (heights above 1390 m)', () => {
  let lo = Infinity, hi = -Infinity;
  for (let s = 0; s < rwanda.length; s += 2) { const z = rwanda.elevation(s); lo = Math.min(lo, z); hi = Math.max(hi, z); }
  assert.ok(Math.abs(lo + 26.5) < 0.3 && Math.abs(hi - 25) < 0.3, `${lo} .. ${hi}`);
  assert.ok(rwanda.hasElevation && rwanda.lakeLevel === -34);
  // The lake lies below every part of the road.
  assert.ok(lo > rwanda.lakeLevel);
});

test('banking tilts the road: positive banks raise the left edge, and the verges fall away 2%', () => {
  const banks = CIRCUITS.rwanda.banks;
  // Turn 2's banked section: the source banks peak at 0.12 there.
  const k = banks.indexOf(0.12), s = k * rwanda.length / banks.length;
  const half = rwanda.roadWidth / 2, left = rwanda.elevation(s, -half), right = rwanda.elevation(s, half), mid = rwanda.elevation(s);
  assert.ok(left - right > 1.4 && left - right < 1.9, `${left - right}`);
  assert.ok(Math.abs((left + right) / 2 - mid) < 1e-9);
  assert.ok(Math.abs(rwanda.elevation(s, half + 10) - (right - 0.2)) < 1e-9);
  // heightAt finds the same surface from world coordinates.
  const [x, y] = rwanda.point(s, 3);
  assert.ok(Math.abs(rwanda.heightAt(x, y) - rwanda.elevation(s, 3)) < 0.05);
});

test('circuits without elevation stay flat', () => {
  const monza = createCircuitTrack(CIRCUITS.monza);
  assert.equal(monza.hasElevation, false);
  for (const off of [-30, 0, 30]) assert.equal(monza.elevation(1234, off), 0);
  assert.equal(monza.heightAt(...monza.point(500, 4)), 0);
});
