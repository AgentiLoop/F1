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
  const monza = createCircuitTrack({ ...CIRCUITS.monza, heights: null });
  assert.equal(monza.hasElevation, false);
  for (const off of [-30, 0, 30]) assert.equal(monza.elevation(1234, off), 0);
  assert.equal(monza.heightAt(...monza.point(500, 4)), 0);
});

test('the real circuits carry the climbs the cars measured (OpenF1 heights)', () => {
  const range = key => { const t = createCircuitTrack({ ...CIRCUITS[key], pitLane: false }); let lo = Infinity, hi = -Infinity;
    for (let s = 0; s < t.length; s += 5) { const z = t.elevation(s); lo = Math.min(lo, z); hi = Math.max(hi, z); } return hi - lo; };
  // Spa ~100 m, the Red Bull Ring ~65 m, Monaco ~42 m; Jeddah and Miami are flat.
  for (const [key, lo, hi] of [['spa', 95, 106], ['red-bull-ring', 58, 66], ['monaco', 36, 44], ['jeddah', 0, 4], ['miami', 0, 4]]) {
    const r = range(key); assert.ok(r > lo && r < hi, `${key}: ${r}`);
  }
  for (const key of Object.keys(CIRCUITS)) assert.equal(CIRCUITS[key].heights.length, CIRCUITS[key].points.length / 2, key);
  // Spa: down from La Source to Eau Rouge, then up the Kemmel straight.
  const spa = createCircuitTrack({ ...CIRCUITS.spa, pitLane: false }), at = d => spa.elevation(CIRCUITS.spa.timingLine * spa.length / CIRCUITS.spa.length + d);
  assert.ok(at(1000) < at(400) - 20 && at(2400) > at(1000) + 50, `${at(400)} ${at(1000)} ${at(2400)}`);
});

