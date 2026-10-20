import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, shift, FIXED_DT } from '../src/physics.mjs';

const run = (car, seconds, input, barrier = null, dt = FIXED_DT) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) step(car, input, dt, () => 1, barrier);
};
const reverse = car => run(car, 0.1, { reverse: true, brake: 1 });

test('reverse selection requires stopped wheels/chassis, brake and released throttle', () => {
  for (const setup of [c => { c.vx = 1; }, c => { c.vy = 1; }, c => { c.wheelOmega[2] = 10; }]) {
    const c = createCar(); setup(c);
    step(c, { reverse: true, brake: 1 });
    assert.equal(c.gear, 1);
  }
  const c = createCar();
  step(c, { reverse: true }); assert.equal(c.gear, 1);
  step(c, { reverse: true, brake: 1, throttle: 0.1 }); assert.equal(c.gear, 1);
  run(c, 0.5, { brake: 1 });
  step(c, { reverse: true, brake: 1 });
  assert.equal(c.gear, -1); assert.ok(c.telemetry.powertrain.shifting);
  assert.equal(Math.abs(c.telemetry.powertrain.axleTorque), 0);
  run(c, 0.1, { brake: 1 });
  assert.equal(shift(c, 1), false); assert.equal(shift(c, -1), false);
  step(c, { reverse: false, brake: 1 }); assert.equal(c.gear, 1);
});

test('reverse drives rear wheels backwards, burns fuel, disables deployment and respects limiter', () => {
  const c = createCar({ fuelLoad: 2, ersMinSpeed: 0, ersSpeedBlend: 0.1 }); reverse(c);
  let maxRpm = 0;
  for (let i = 0; i < 10 / FIXED_DT; i++) {
    step(c, { throttle: 1 });
    maxRpm = Math.max(maxRpm, c.telemetry.powertrain.rpm);
    assert.equal(c.gear, -1);
    assert.equal(c.telemetry.powertrain.ers.deploy, 0);
  }
  assert.ok(c.x < -50 && c.vx < -5);
  assert.ok(c.wheelOmega.every(w => w < 0));
  assert.ok(c.fuel < 2 && c.fuel > 1);
  assert.ok(maxRpm <= c.config.maxRpm + 1);
  assert.ok(c.telemetry.speed < 12, `reverse speed ${c.telemetry.speed}`);
  const dry = createCar({ fuelLoad: 0 }); reverse(dry); run(dry, 2, { throttle: 1 });
  assert.equal(dry.x, 0);
});

test('reverse lift and braking dissipate energy; forward request cannot shift a moving car', () => {
  const c = createCar(); reverse(c); run(c, 2, { throttle: 0.25 });
  const speed = c.telemetry.speed;
  step(c, { reverse: false, brake: 1 }); assert.equal(c.gear, -1);
  run(c, 0.5, {}); assert.ok(c.telemetry.speed < speed);
  run(c, 2, { brake: 1 }); assert.ok(c.telemetry.speed < 0.01);
  assert.equal(c.gear, -1);
  run(c, 0.1, { reverse: false, brake: 1 }); assert.equal(c.gear, 1);
  run(c, 2, { throttle: 0.3 }); assert.ok(c.vx > 1);
});

test('reverse can back away from a nose-on barrier and turns with opposite yaw', () => {
  const c = createCar(), wallX = c.config.bodyFront;
  const barrier = (x, y) => x > wallX ? { depth: x - wallX, nx: -1, ny: 0 } : null;
  run(c, 1, { throttle: 0.3 }, barrier);
  assert.ok(Math.abs(c.x) < 0.1);
  run(c, 1, { reverse: true, brake: 1 }, barrier); assert.equal(c.gear, -1);
  run(c, 2, { throttle: 0.15 }, barrier); assert.ok(c.x < -2);
  run(c, 1, { throttle: 0.1, steer: 0.5 }, barrier);
  assert.ok(c.heading < -0.05, `reverse yaw ${c.heading}`);
  assert.ok(Number.isFinite(c.y));
});

test('reverse straight-line integration converges and has no drive on zero grip', () => {
  const cars = [FIXED_DT, 1 / 960].map(dt => {
    const c = createCar(); run(c, 0.1, { reverse: true, brake: 1 }, null, dt);
    run(c, 3, { throttle: 0.2 }, null, dt); return c;
  });
  assert.ok(Math.abs(cars[0].x / cars[1].x - 1) < 0.03);
  assert.ok(Math.abs(cars[0].vx / cars[1].vx - 1) < 0.03);
  const c = createCar(); reverse(c);
  for (let i = 0; i < 1000; i++) step(c, { throttle: 1 }, FIXED_DT, () => 0);
  assert.equal(c.x, 0); assert.ok(c.wheelOmega[2] < -1);
});
