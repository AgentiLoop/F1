import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, createCar, clamp, newErsLap } from '../src/physics.mjs';
import { createAutopilot, createCircuitAutopilot } from '../src/autopilot.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';

const halfStraight = 220, radius = 90, roadWidth = 15;
const trackDistance = (x, y) => Math.abs(Math.hypot(x - clamp(x, -halfStraight, halfStraight), y) - radius);
const surfaceAt = (x, y) => trackDistance(x, y) <= roadWidth / 2 ? 1 : 0.35;

test('autopilot laps the stadium circuit without leaving the road', () => {
  const sim = new Simulation(createCar()); sim.car.y = -radius;
  const drive = createAutopilot({ halfStraight, radius });
  let maxOffset = 0, topSpeed = 0;
  for (let i = 0; i < 240 * 60; i++) {
    sim.advance(1 / 240, drive(sim.car), surfaceAt);
    maxOffset = Math.max(maxOffset, trackDistance(sim.car.x, sim.car.y));
    topSpeed = Math.max(topSpeed, sim.car.telemetry.speed);
  }
  assert.ok(maxOffset < roadWidth / 2 - 1, `max offset ${maxOffset.toFixed(2)} m`);
  assert.ok(topSpeed * 3.6 > 250, `top speed ${(topSpeed * 3.6).toFixed(0)} km/h`);
  assert.ok(sim.car.distance > 2 * (4 * halfStraight + 2 * Math.PI * radius), `distance ${sim.car.distance.toFixed(0)} m`);
});

test('the circuit ERS plan spreads the lap allowance over the lap at Monza and laps faster than deploying on every throttle application', () => {
  const monza = createCircuitTrack(CIRCUITS.monza);
  const run = ersPlan => {
    const car = createCar(), sim = new Simulation(car), drive = createCircuitAutopilot(monza, { ersPlan });
    [car.x, car.y] = monza.point(monza.length - 150, monza.lineOffset(monza.length - 150));
    car.heading = monza.heading(monza.length - 150);
    const laps = [];
    let last = monza.progress(car.x, car.y), start = 0, spent = null;
    while (laps.length < 3) {
      sim.advance(1 / 240, drive(car), monza.surfaceAt, monza.barrierAt);
      const p = monza.progress(car.x, car.y);
      if (laps.length === 2 && spent === null && car.ers.deployed > car.config.ersDeployPerLap - 1) spent = p;
      if (last - p > monza.length / 2) { newErsLap(car); laps.push(car.time - start); start = car.time; }
      last = p;
    }
    return { lap: laps[2], spent: spent ?? monza.length, charge: car.ers.charge };
  };
  const greedy = run(false), planned = run(true);
  // Deploying on every throttle application, the 4 MJ are gone ~55% of the way round.
  assert.ok(greedy.spent < 0.6 * monza.length, `greedy allowance spent at ${greedy.spent.toFixed(0)} m`);
  assert.ok(planned.spent > 0.9 * monza.length, `planned allowance spent at ${planned.spent.toFixed(0)} m`);
  assert.ok(planned.lap < greedy.lap - 0.3, `lap ${planned.lap.toFixed(2)} s vs ${greedy.lap.toFixed(2)} s`);
  assert.ok(planned.charge > 0.5 * createCar().config.ersCapacity, `store ${(planned.charge / 1e6).toFixed(2)} MJ`);
});

test('the circuit plan takes banked corners faster and laps Zandvoort and Jeddah quicker without touching a wall', () => {
  const lap = (track, planTrack) => {
    const car = createCar(), sim = new Simulation(car), drive = createCircuitAutopilot(planTrack);
    const s0 = track.length - 150;
    [car.x, car.y] = track.point(s0, track.lineOffset(s0)); car.heading = track.heading(s0);
    let last = track.progress(car.x, car.y), start = 0, laps = 0, time = 0, walls = 0;
    while (laps < 2) {
      sim.advance(1 / 240, drive(car), track.surfaceAt, track.barrierAt, track.groundAt);
      if (track.barrierAt(car.x, car.y)) walls++;
      const p = track.progress(car.x, car.y);
      if (last - p > track.length / 2) { newErsLap(car); laps++; time = car.time - start; start = car.time; }
      last = p;
    }
    return { time, walls, plan: drive.plan(car) };
  };
  for (const [key, gain] of [['zandvoort', 2], ['jeddah', 1]]) {
    const track = createCircuitTrack(CIRCUITS[key]), flat = { ...track, samples: { ...track.samples, z: undefined, bank: undefined } };
    const a = lap(track, flat), b = lap(track, track);
    // Sharpest point of a corner banked into the turn (b > 0.1, ~6°).
    const { bank, lineCurvature: k } = track.samples, banked = j => -Math.sign(k[j]) * bank[j] > 0.1 ? Math.abs(k[j]) : 0;
    let i = 0; for (let j = 0; j < k.length; j++) if (banked(j) > banked(i)) i = j;
    assert.ok(b.plan[i] > a.plan[i] * 1.05, `${key} plan at ${track.samples.s[i].toFixed(0)} m: ${b.plan[i].toFixed(1)} vs flat ${a.plan[i].toFixed(1)} m/s`);
    assert.equal(b.walls, 0, `${key} wall contacts`);
    assert.ok(b.time < a.time - gain, `${key} lap ${b.time.toFixed(2)} s vs ${a.time.toFixed(2)} s on the flat plan`);
  }
});
