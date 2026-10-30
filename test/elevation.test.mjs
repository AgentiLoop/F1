import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCar, step, FIXED_DT } from '../src/physics.mjs';
import { createTimeTrial } from '../src/trial.mjs';
import { createLapTimer } from '../src/laptimer.mjs';

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

test('slopeAt gives the ground gradient that heightAt shows (null on flat circuits)', () => {
  assert.equal(createCircuitTrack(CIRCUITS.monza).slopeAt, null);
  for (const s of [300, 1500, 2700, 4100, 5200]) for (const off of [-5, 0, 4]) {
    const [x, y] = rwanda.point(s, off), [gx, gy] = rwanda.slopeAt(x, y), d = 0.5;
    const ex = (rwanda.heightAt(x + d, y) - rwanda.heightAt(x - d, y)) / (2 * d), ey = (rwanda.heightAt(x, y + d) - rwanda.heightAt(x, y - d)) / (2 * d);
    assert.ok(Math.abs(gx - ex) < 0.01 && Math.abs(gy - ey) < 0.01, `s ${s} off ${off}: ${gx},${gy} vs ${ex},${ey}`);
  }
});

// Lap progress of the steepest climb and descent along the centreline.
function steepest(sign) {
  let best = 0, at = 0;
  for (let s = 0; s < rwanda.length; s += 5) { const g = (rwanda.elevation(s + 5) - rwanda.elevation(s - 5)) / 10; if (g * sign > best) { best = g * sign; at = s; } }
  return { at, grade: best };
}

test('gravity on the grade: a car coasting uphill slows faster than one coasting downhill', () => {
  const speedAfter = (s0, slopeAt) => {
    const car = createCar();
    [car.x, car.y] = rwanda.point(s0); car.heading = rwanda.heading(s0);
    car.vx = 30 * Math.cos(car.heading); car.vy = 30 * Math.sin(car.heading);
    car.wheelOmega.fill(30 / car.config.wheelRadius);
    for (let i = 0; i < 240; i++) step(car, { steer: 0 }, FIXED_DT, rwanda.surfaceAt, null, slopeAt);
    return car.telemetry.speed;
  };
  const up = steepest(1), down = steepest(-1);
  assert.ok(up.grade > 0.03 && down.grade > 0.03, `${up.grade} ${down.grade}`);
  const upFlat = speedAfter(up.at - 15, null), upHill = speedAfter(up.at - 15, rwanda.slopeAt);
  const downFlat = speedAfter(down.at - 15, null), downHill = speedAfter(down.at - 15, rwanda.slopeAt);
  // About g × grade × 1 s either way.
  assert.ok(upFlat - upHill > 0.25, `uphill ${upFlat} -> ${upHill}`);
  assert.ok(downHill - downFlat > 0.25, `downhill ${downFlat} -> ${downHill}`);
});

test('a braked car stays put on the banking and the steepest grade', () => {
  const banks = CIRCUITS.rwanda.banks, sBank = banks.indexOf(0.125) * rwanda.length / banks.length;
  for (const s0 of [sBank, steepest(1).at]) {
    const car = createCar();
    [car.x, car.y] = rwanda.point(s0, 3); car.heading = rwanda.heading(s0);
    const x0 = car.x, y0 = car.y;
    for (let i = 0; i < 240 * 5; i++) step(car, { brake: 1 }, FIXED_DT, rwanda.surfaceAt, rwanda.barrierAt, rwanda.slopeAt);
    assert.ok(Math.hypot(car.x - x0, car.y - y0) < 0.3, `s ${s0}: drifted ${Math.hypot(car.x - x0, car.y - y0)} m`);
  }
});

test('the time trial laps the RISE Motordrome with gravity on its hills and banking', () => {
  const sim = createTimeTrial(rwanda), timer = createLapTimer(rwanda, { lineProgress: 0 });
  for (let i = 0; i < 60 * 200 && !timer.state.lastLap; i++) { sim.advance(1 / 60, null); timer.update(sim.car); }
  const lap = timer.state.lastLap;
  assert.ok(lap?.valid, 'lap within track limits');
  assert.ok(lap.time > 80 && lap.time < 140, `lap ${lap.time.toFixed(2)} s`);
});
