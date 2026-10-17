import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, createCar, clamp } from './physics.mjs';
import { createAutopilot } from './autopilot.mjs';

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
