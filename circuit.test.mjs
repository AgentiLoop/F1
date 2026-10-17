import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from './circuit.mjs';
import { CIRCUITS } from './circuits.mjs';
import { createTimeTrial } from './trial.mjs';
import { createLapTimer } from './laptimer.mjs';
import { SURFACE_GRIP } from './track.mjs';
import { createCircuitAutopilot } from './autopilot.mjs';
import { createCar, Simulation, FIXED_DT } from './physics.mjs';
import { createRace, DEFAULT_GRID, RACE_DEFAULTS } from './race.mjs';

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

test('no traced corner is tighter than minRadius, so every racing line stays wider than the car\'s turning circle', () => {
  const { wheelbase, maxSteer } = createCar().config, turning = wheelbase / Math.tan(maxSteer);
  for (const [key, c] of Object.entries(CIRCUITS)) {
    const t = createCircuitTrack(c), { curvature, lineCurvature } = t.samples;
    const centre = 1 / Math.max(...curvature.map(Math.abs)), racing = 1 / Math.max(...lineCurvature.map(Math.abs));
    assert.ok(centre > 14.5, `${key} centreline radius ${centre.toFixed(1)} m`);
    assert.ok(racing > turning, `${key} racing-line radius ${racing.toFixed(1)} m vs turning circle ${turning.toFixed(1)} m`);
  }
  // With the limit off, Monaco's traced Sainte Dévote is a radius the car cannot steer round.
  const raw = createCircuitTrack({ ...CIRCUITS.monaco, minRadius: 0 });
  assert.ok(1 / Math.max(...raw.samples.lineCurvature.map(Math.abs)) < turning);
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

test('the circuit autopilot holds the line through Spa\'s Blanchimont at ~300 km/h and its lap stays within track limits', () => {
  const track = createCircuitTrack(CIRCUITS.spa), sim = createTimeTrial(track), timer = createLapTimer(track, { lineProgress: 0 });
  let maxOffset = 0;
  for (let i = 0; i < 60 * 150 && !timer.state.lastLap; i++) {
    sim.advance(1 / 60, null);
    timer.update(sim.car);
    if (timer.state.started) maxOffset = Math.max(maxOffset, Math.abs(track.offset(sim.car.x, sim.car.y)));
  }
  assert.ok(timer.state.lastLap?.valid, 'lap within track limits');
  assert.ok(maxOffset < track.roadWidth / 2, `max offset ${maxOffset.toFixed(2)} m`);
});

test('yaw-rate feedback steers harder when the car turns less than the pursuit arc, and adds nothing on the arc', () => {
  const track = createCircuitTrack(CIRCUITS.silverstone);
  const s = 1000, car = createCar(), speed = 60;
  car.heading = track.heading(s) - 0.05;
  [car.x, car.y] = track.point(s, track.lineOffset(s));
  [car.vx, car.vy] = [speed * Math.cos(car.heading), speed * Math.sin(car.heading)];
  car.telemetry.speed = speed;
  const steer = gain => createCircuitAutopilot(track, { yawGain: gain })(car).steer;
  car.yawRate = 0;
  assert.ok(Math.abs(steer(2)) > Math.abs(steer(0)) + 0.01, `${steer(2)} vs ${steer(0)}`);
  // On the arc the yaw rate equals speed × pursuit curvature: no correction.
  const ld = Math.max(8, speed * 0.45), [px, py] = track.point(s + ld, track.lineOffset(s + ld));
  const a = Math.atan2(py - car.y, px - car.x) - car.heading;
  car.yawRate = speed * 2 * Math.sin(Math.atan2(Math.sin(a), Math.cos(a))) / ld;
  assert.ok(Math.abs(steer(2) - steer(0)) < 1e-9);
});

test('an offset from the racing line is kept edgeMargin inside the road edge; no offset follows the line', () => {
  const track = createCircuitTrack(CIRCUITS.silverstone), drive = createCircuitAutopilot(track), edge = track.roadWidth / 2 - 2;
  for (let s = 0; s < track.length; s += 37) {
    assert.ok(Math.abs(drive.path(s, 9)) <= edge + 1e-9 && Math.abs(drive.path(s, -9)) <= edge + 1e-9);
    assert.equal(drive.path(s, 0), track.lineOffset(s));
  }
});

test('the circuit autopilot turns a spun car round instead of driving the wrong way', () => {
  const track = createCircuitTrack(CIRCUITS.monza), drive = createCircuitAutopilot(track), sim = new Simulation(createCar());
  const s0 = 300; [sim.car.x, sim.car.y] = track.point(s0, track.lineOffset(s0)); sim.car.heading = track.heading(s0) + Math.PI;
  for (let i = 0; i < 12 / FIXED_DT; i++) sim.advance(FIXED_DT, drive(sim.car), track.surfaceAt, track.barrierAt);
  const s = track.progress(sim.car.x, sim.car.y), d = sim.car.heading - track.heading(s);
  assert.ok(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.2, `heading error ${Math.atan2(Math.sin(d), Math.cos(d)).toFixed(2)} rad`);
  assert.ok(s > s0 + 100 && sim.car.telemetry.speed > 30, `progress ${s.toFixed(0)} m at ${sim.car.telemetry.speed.toFixed(1)} m/s`);
});

test('a race on a real circuit: grid behind the line, fuel for the distance, a clean finish', () => {
  const track = createCircuitTrack(CIRCUITS['red-bull-ring']);
  const race = createRace(track, { grid: DEFAULT_GRID, start: { seed: 3 }, laps: 1, compoundRule: true });
  // A pit lane, but a one-lap race has no compound rule.
  assert.ok(race.pit); assert.equal(race.compoundRule, false);
  race.requestPit('soft'); assert.equal(race.entries[0].pitRequest, 'soft'); race.requestPit(null);
  race.entries.forEach((e, i) => {
    assert.ok(Math.abs(e.covered + 0.8 + RACE_DEFAULTS.gridSpacing * i) < 0.5, `slot ${i}: ${e.covered.toFixed(2)} m`);
    assert.ok(Math.abs(e.car.fuel - (RACE_DEFAULTS.fuelPerKm * track.length / 1000 * (1 + RACE_DEFAULTS.fuelMargin) + RACE_DEFAULTS.fuelReserve)) < 1e-9);
  });
  let contact = 0, maxOff = 0;
  while (!race.finish.done && race.time < 160) {
    race.advance(0.25, null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) { contact = Math.max(contact, e.car.contact?.speed ?? 0); maxOff = Math.max(maxOff, Math.abs(track.offset(e.car.x, e.car.y))); }
  }
  assert.ok(race.finish.done, 'every car took the flag');
  const rows = race.classification();
  assert.ok(rows.every(r => r.finished && r.laps === 1 && !r.dsq), JSON.stringify(rows));
  assert.ok(rows[0].time > 75 && rows[0].time < 100, `winner ${rows[0].time.toFixed(2)} s`);
  assert.ok(contact < 3, `contact ${contact.toFixed(1)} m/s`);
  assert.ok(maxOff < track.roadWidth / 2 + 1.5, `max offset ${maxOff.toFixed(1)} m`);
});

test('every circuit gets a pit lane beside the start/finish straight, with pit surface off the road', () => {
  for (const [key, spec] of Object.entries(CIRCUITS)) {
    const track = createCircuitTrack(spec), pit = track.pit;
    assert.ok(pit, `${key}: no pit lane`);
    assert.ok(pit.entry < pit.limitStart && pit.limitStart < pit.boxStart && pit.boxStart + 4 * pit.boxSpacing < pit.limitEnd && pit.limitEnd < pit.mergeStart && pit.mergeStart < pit.exit, key);
    assert.ok(pit.entry < 0 && pit.exit > 0, `${key}: the lane spans the line`);
    for (const s of [pit.limitStart, pit.boxStart, 0, pit.limitEnd]) {
      const [x, y] = track.point(s, pit.side * pit.boxOffset);
      assert.equal(track.surface(x, y), 'pit', `${key} at ${s}`);
      assert.ok(Math.abs(track.offset(x, y) - pit.side * pit.boxOffset) < 0.5, `${key}: the box marks are nearest this part of the circuit`);
      assert.equal(track.barrierAt(x, y), null);
    }
    const [x, y] = track.point(-1000, pit.side * pit.boxOffset);
    assert.notEqual(track.surface(x, y), 'pit', `${key}: no pit surface away from the lane`);
  }
  assert.equal(createCircuitTrack({ ...CIRCUITS.monza, pitLane: false }).pit, null);
});

test('pit-disabled circuits advance without pit strategy or compound requirements', () => {
  for (const [key, spec] of Object.entries(CIRCUITS)) {
    const track = createCircuitTrack({ ...spec, pitLane: false });
    const race = createRace(track, { start: { seed: 3 }, laps: 2, compoundRule: true });
    assert.equal(race.pit, null, key);
    assert.equal(race.compoundRule, false, key);
    race.requestPit('soft');
    assert.equal(race.entries[0].pitRequest, null, key);
    race.advance(FIXED_DT, null, track.surfaceAt, track.barrierAt);
    race.advance(FIXED_DT, { throttle: 0, brake: 1, steer: 0 }, track.surfaceAt, track.barrierAt);
    assert.equal(race.time, 2 * FIXED_DT, key);
    for (const e of race.entries) {
      assert.equal(race.inPitLane(e.car), false, key);
      assert.equal(e.pit, null, key);
      assert.equal(e.stopLap, null, key);
      assert.ok(Number.isFinite(e.car.x) && Number.isFinite(e.car.y), key);
    }
  }
});

test('a field completes a pit-disabled circuit race without stops or compound disqualifications', () => {
  const track = createCircuitTrack({ ...CIRCUITS['red-bull-ring'], pitLane: false });
  const race = createRace(track, { start: { seed: 2 }, laps: 2, compoundRule: true });
  while (!race.finish.done && race.time < 260) {
    race.advance(0.25, null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) {
      assert.equal(e.pit, null);
      assert.equal(race.inPitLane(e.car), false);
      assert.equal(e.car.contact, undefined);
      assert.equal(e.retired, undefined);
    }
  }
  assert.ok(race.finish.done, 'every car took the flag');
  const rows = race.classification();
  assert.ok(rows.every(r => r.finished && r.laps === 2 && !r.dsq && r.stops === 0 && r.penalty === 0 && r.compounds.length === 1), JSON.stringify(rows));
});

test('circuit pit stops: the field stops under the compound rule without speeding, contact or running off', () => {
  const track = createCircuitTrack(CIRCUITS['red-bull-ring']), pit = track.pit;
  const race = createRace(track, { grid: DEFAULT_GRID, start: { seed: 2 }, laps: 2, compoundRule: true });
  assert.equal(race.compoundRule, true);
  let contact = 0, off = 0, inLane = 0;
  while (!race.finish.done && race.time < 260) {
    race.advance(0.25, null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) {
      contact = Math.max(contact, e.car.contact?.speed ?? 0);
      if (!['asphalt', 'kerb', 'pit'].includes(track.surface(e.car.x, e.car.y))) off += 0.25;
      if (race.inPitLane(e.car)) inLane++;
    }
  }
  assert.ok(race.finish.done, 'every car took the flag');
  const rows = race.classification();
  assert.ok(rows.every(r => r.finished && !r.dsq && r.stops === 1 && r.penalty === 0 && new Set(r.compounds).size === 2), JSON.stringify(rows));
  for (const e of race.entries) assert.ok(e.stops[0].stationary >= RACE_DEFAULTS.stopTimeMin && e.stops[0].stationary < 12, `${e.name} stood ${e.stops[0].stationary.toFixed(1)} s`);
  assert.ok(inLane > 0 && pit.speedLimit < 23);
  assert.ok(contact < 1, `contact ${contact.toFixed(1)} m/s`);
  assert.ok(off <= 1, `${off} s off the road`);
});
