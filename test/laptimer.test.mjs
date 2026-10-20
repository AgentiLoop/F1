import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, createCar } from '../src/physics.mjs';
import { createStadiumTrack } from '../src/track.mjs';
import { createAutopilot } from '../src/autopilot.mjs';
import { createLapTimer, formatLapTime } from '../src/laptimer.mjs';

const halfStraight = 220, radius = 90, roadWidth = 15;
const track = createStadiumTrack({ halfStraight, radius, roadWidth });

// Kinematic point on the centreline at distance s past the left end of the bottom straight.
function place(car, s, t) {
  const straight = 2 * halfStraight, arc = Math.PI * radius;
  s = ((s % track.length) + track.length) % track.length;
  let x, y, h;
  if (s < straight) [x, y, h] = [s - halfStraight, -radius, 0];
  else if ((s -= straight) < arc) { const a = s / radius - Math.PI / 2; [x, y, h] = [halfStraight + radius * Math.cos(a), radius * Math.sin(a), a + Math.PI / 2]; }
  else if ((s -= arc) < straight) [x, y, h] = [halfStraight - s, radius, Math.PI];
  else { const a = (s - straight) / radius + Math.PI / 2; [x, y, h] = [-halfStraight + radius * Math.cos(a), radius * Math.sin(a), a + Math.PI / 2]; }
  Object.assign(car, { x, y, heading: h, time: t });
}

test('track progress runs 0..length anticlockwise and matches the layout', () => {
  assert.ok(Math.abs(track.length - (4 * halfStraight + 2 * Math.PI * radius)) < 1e-9);
  assert.ok(Math.abs(track.progress(0, -radius) - halfStraight) < 1e-9);
  assert.ok(Math.abs(track.progress(halfStraight + radius, 0) - (2 * halfStraight + Math.PI * radius / 2)) < 1e-9);
  assert.ok(Math.abs(track.progress(0, radius) - (3 * halfStraight + Math.PI * radius)) < 1e-9);
  const car = createCar();
  for (let s = 0; s < track.length; s += 37) { place(car, s, 0); assert.ok(Math.abs(track.progress(car.x, car.y) - s) < 1e-6, `s=${s}`); }
});

test('constant-speed laps time exactly, with interpolated crossings and sector splits', () => {
  const timer = createLapTimer(track), car = createCar(), v = 50;
  // Coarse 1/30 s updates: crossings must be interpolated between calls.
  for (let t = 0; t <= 3 * track.length / v + 2; t += 1 / 30) { place(car, halfStraight + v * t, t); timer.update(car); }
  const s = timer.state, lap = track.length / v;
  assert.equal(s.laps.length, 3);
  for (const l of s.laps) {
    assert.ok(Math.abs(l.time - lap) < 1e-6, `lap ${l.time}`);
    assert.equal(l.sectors.length, 3);
    for (const x of l.sectors) assert.ok(Math.abs(x - lap / 3) < 1e-6, `sector ${x}`);
    assert.ok(l.valid);
  }
  assert.ok(Math.abs(s.laps[0].time - lap) < 1e-6 && Math.abs(timer.state.lapStart - (0.8 / v + 3 * lap)) < 1e-6);
  assert.ok(Math.abs(s.bestLap - lap) < 1e-6);
  assert.ok(Math.abs(timer.delta(car)) < 1e-3, `delta ${timer.delta(car)}`);
});

test('the live delta to the best lap reflects a slower lap', () => {
  const timer = createLapTimer(track), car = createCar();
  let t = 0, s = halfStraight;
  place(car, s, t); timer.update(car);
  const run = (v, dist) => { for (let d = 0; d < dist; d += v / 60) { s += v / 60; t += 1 / 60; place(car, s, t); timer.update(car); } };
  run(60, track.length + 10); // first full lap at 60 m/s (sets best)
  run(50, track.length / 2);  // half a lap at 50 m/s
  const expected = (track.length / 2) / 50 - (track.length / 2) / 60;
  assert.ok(Math.abs(timer.delta(car) - expected) < 0.05, `delta ${timer.delta(car)} vs ${expected}`);
});

test('a lap with all four wheels beyond the road edge is deleted; kerb use is not', () => {
  const timer = createLapTimer(track), car = createCar(), v = 50;
  for (let t = 0; t <= 2 * track.length / v + 1; t += 1 / 60) {
    place(car, halfStraight + v * t, t);
    const lapPos = (v * t - 0.8) / track.length;
    // Lap 1: one wheel pair on the kerb (centre 7.5 m out). Lap 2: centre 9 m out for a moment.
    if (lapPos > 0.2 && lapPos < 0.25) car.y -= 7.5;
    if (lapPos > 1.5 && lapPos < 1.52) car.y -= 9;
    timer.update(car);
  }
  const s = timer.state;
  assert.equal(s.laps.length, 2);
  assert.equal(s.laps[0].valid, true);
  assert.equal(s.laps[1].valid, false);
  assert.equal(s.warnings, 1);
  assert.ok(Math.abs(s.bestLap - s.laps[0].time) < 1e-9, 'deleted lap must not become best');
});

test('reversing over the line does not count a lap', () => {
  const timer = createLapTimer(track), car = createCar();
  let t = 0;
  for (const s of [halfStraight - 5, halfStraight + 5, halfStraight - 5, halfStraight + 5, halfStraight + 20]) { place(car, s, t); timer.update(car); t += 0.2; }
  assert.equal(timer.state.laps.length, 0);
  assert.equal(timer.state.lap, 1);
  assert.equal(timer.state.nextSector, 0);
});

test('autopilot sets a valid lap on the full simulation', () => {
  const sim = new Simulation(createCar()); sim.car.y = -radius;
  const drive = createAutopilot({ halfStraight, radius }), timer = createLapTimer(track);
  for (let i = 0; i < 60 * 70 && timer.state.laps.length < 2; i++) {
    sim.advance(1 / 60, drive(sim.car), track.surfaceAt, track.barrierAt);
    timer.update(sim.car);
  }
  const [l1, l2] = timer.state.laps;
  assert.ok(l2, 'two laps completed');
  assert.ok(l1.valid && l2.valid);
  assert.ok(l2.time < l1.time, `flying lap ${l2.time} faster than standing lap ${l1.time}`);
  assert.ok(Math.abs(l2.sectors.reduce((a, b) => a + b) - l2.time) < 1e-9);
  assert.ok(l2.time > 15 && l2.time < 40, `lap ${l2.time}`);
});

test('lap times format as m:ss.mmm', () => {
  assert.equal(formatLapTime(83.4567), '1:23.457');
  assert.equal(formatLapTime(5.2), '0:05.200');
  assert.equal(formatLapTime(null), '–:––.–––');
});

test('restart aborts the lap in progress but keeps completed laps and bests', () => {
  const timer = createLapTimer(track), car = createCar(), v = 50;
  for (let t = 0; t <= (track.length * 1.5) / v; t += 1 / 60) { place(car, halfStraight + v * t, t); timer.update(car); }
  assert.equal(timer.state.laps.length, 1);
  const best = timer.state.bestLap;
  timer.restart();
  for (let t = 0; t <= 2; t += 1 / 60) { place(car, halfStraight + v * t, t); timer.update(car); }
  assert.equal(timer.state.laps.length, 1);
  assert.equal(timer.state.lap, 2);
  assert.ok(timer.state.lapStart < 0.1, 'new lap timed from the line after the reset');
  assert.equal(timer.state.bestLap, best);
});
