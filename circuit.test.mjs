import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from './circuit.mjs';
import { CIRCUITS } from './circuits.mjs';
import { createTimeTrial } from './trial.mjs';
import { createLapTimer } from './laptimer.mjs';
import { SURFACE_GRIP } from './track.mjs';
import { createCircuitAutopilot } from './autopilot.mjs';
import { createCar } from './physics.mjs';

// Anticlockwise circle of radius 200 m traced with 48 points.
const ring = Array.from({ length: 48 }, (_, i) => [200 * Math.cos(i * Math.PI / 24), 200 * Math.sin(i * Math.PI / 24)]);

test('a traced circle gives a closed track with progress, signed offsets, surfaces and walls', () => {
  const t = createCircuitTrack({ points: ring.flat(), roadWidth: 12 });
  assert.ok(Math.abs(t.length - 2 * Math.PI * 200) < 15, `length ${t.length.toFixed(1)}`);
  // Positive offset = right of the race direction = outside of an anticlockwise loop.
  assert.ok(Math.abs(t.offset(205, 0) - 5) < 0.5 && Math.abs(t.offset(195, 0) + 5) < 0.5);
  const quarter = t.progress(0, 200) - t.progress(200, 0);
  assert.ok(Math.abs(quarter - t.length / 4) < 3, `quarter lap ${quarter.toFixed(1)}`);
  assert.equal(t.surface(200, 0), 'asphalt');
  assert.equal(t.surface(206.5, 0), 'kerb'); // R 200 m is tighter than 1 / kerbCurvature
  assert.equal(t.surface(210, 0), 'runoff');
  assert.equal(t.surface(230, 0), 'grass');
  assert.equal(t.surfaceAt(200, 0), SURFACE_GRIP.asphalt);
  assert.equal(t.barrierAt(200, 0), null);
  const wall = t.barrierAt(200 + t.wallOffset + 1, 0);
  assert.ok(Math.abs(wall.depth - 1) < 0.5 && wall.nx < -0.99, JSON.stringify(wall));
  const [px, py] = t.point(t.progress(0, 200), 3);
  assert.ok(Math.abs(Math.hypot(px, py) - 203) < 0.5, 'point offsets to the right');
});

test('kerbs are laid only in corners: none along a long straight', () => {
  const stadium = [[-300, -100], [0, -100], [300, -100], [400, 0], [300, 100], [0, 100], [-300, 100], [-400, 0]];
  const t = createCircuitTrack({ points: stadium.flat(), smoothing: 0 });
  const s = t.progress(0, -100), [x, y] = t.point(s, t.roadWidth / 2 + 0.6);
  assert.equal(t.surface(x, y), 'runoff', 'mid-straight edge');
  const kerbs = t.samples.kerb.reduce((a, k) => a + k, 0) / t.samples.kerb.length;
  assert.ok(kerbs > 0.2 && kerbs < 0.9, `kerbed fraction ${kerbs.toFixed(2)}`);
});

// Ideal-speed-plan lap time (instant acceleration) along a path's curvature.
const planTime = (length, curvature, step) => createCircuitAutopilot({ length, samples: { lineCurvature: curvature, lineStep: step } }).plan(createCar())
  .reduce((t, v, i) => t + step[i] / v, 0);

test('every bundled circuit matches its official length and its racing line plans a faster lap than the centreline', () => {
  for (const [key, c] of Object.entries(CIRCUITS)) {
    const t = createCircuitTrack(c), { curvature, lineCurvature, lineStep, line } = t.samples;
    assert.ok(Math.abs(t.length - c.length) < 0.005 * c.length, `${key} ${t.length.toFixed(0)} vs ${c.length}`);
    const centre = planTime(t.length, curvature, new Float64Array(curvature.length).fill(t.step)), racing = planTime(t.length, lineCurvature, lineStep);
    assert.ok(racing < 0.95 * centre, `${key} line ${racing.toFixed(1)} s vs centreline ${centre.toFixed(1)} s`);
    assert.ok(Math.max(...line.map(Math.abs)) <= t.roadWidth / 2 - 1.6 + 1e-9, `${key} line within the road`);
  }
});

test('the circuit autopilot laps Monza on the road at a plausible pace', () => {
  const track = createCircuitTrack(CIRCUITS.monza), sim = createTimeTrial(track), timer = createLapTimer(track, { lineProgress: 0 });
  let maxOffset = 0, top = 0;
  for (let i = 0; i < 60 * 130 && !timer.state.lastLap; i++) {
    sim.advance(1 / 60, null);
    timer.update(sim.car);
    maxOffset = Math.max(maxOffset, Math.abs(track.offset(sim.car.x, sim.car.y)));
    top = Math.max(top, sim.car.telemetry.speed);
  }
  const lap = timer.state.lastLap;
  assert.ok(lap, 'completed a lap');
  assert.ok(lap.valid, 'lap within track limits');
  assert.ok(maxOffset < track.roadWidth / 2, `max offset ${maxOffset.toFixed(2)} m`);
  // Real pole laps are ~80 s; this illustrative car on a geometric line is slower.
  assert.ok(lap.time > 85 && lap.time < 105, `lap ${lap.time.toFixed(2)} s`);
  assert.ok(top * 3.6 > 290, `top speed ${(top * 3.6).toFixed(0)} km/h`);
});
