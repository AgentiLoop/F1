import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, wheelLoads, tireForce, Simulation, FIXED_DT } from './physics.mjs';

const run = (car, seconds, input, surface) => {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) step(car, input, FIXED_DT, surface);
  return car;
};
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('rest is stable, including applied brakes and steering', () => {
  const c = run(createCar(), 10, { brake: 1, steer: 1 });
  near(c.x, 0); near(c.y, 0); near(c.yawRate, 0);
});

test('straight acceleration is symmetric and power limited', () => {
  const c = run(createCar(), 10, { throttle: 1 });
  assert.ok(c.vx > 60 && c.vx < 100);
  near(c.y, 0); near(c.heading, 0);
  const rear = c.telemetry.wheels.slice(2);
  assert.ok(rear.reduce((sum, w) => sum + w.fx, 0) * c.vx < c.config.power * 1.001);
});

test('aerodynamic forces scale with speed squared', () => {
  const a = createCar(), b = createCar();
  a.vx = 30; b.vx = 60;
  step(a); step(b);
  near(b.telemetry.downforce / a.telemetry.downforce, 4);
  near(b.telemetry.drag / a.telemetry.drag, 4);
});

test('load transfer conserves normal force and follows acceleration direction', () => {
  const c = createCar();
  const baseline = wheelLoads(c, 1000);
  c.ax = -15; c.ay = 20;
  const loads = wheelLoads(c, 1000);
  near(loads.reduce((a, b) => a + b), c.config.mass * 9.81 + 1000);
  assert.ok(loads[0] + loads[1] > baseline[0] + baseline[1]);
  assert.ok(loads[1] > loads[0] && loads[3] > loads[2]);
  c.ax = 10000; c.ay = -10000;
  const extreme = wheelLoads(c, 0);
  assert.ok(extreme.every(x => x >= 0));
  near(extreme.reduce((a, b) => a + b), c.config.mass * 9.81);
});

test('combined tire demand stays inside the friction circle', () => {
  const c = createCar().config;
  for (const load of [0, 100, 2000, 10000]) {
    for (const grip of [0, 0.3, 1]) {
      for (const force of [-30000, 0, 30000]) {
        const f = tireForce(force, 12, 40, load, grip, c, FIXED_DT);
        assert.ok(Math.hypot(f.fx, f.fy) <= f.capacity + 1e-9);
        assert.ok(f.fy <= 0);
      }
    }
  }
});

test('braking stops without reversing and lower grip lengthens the stop', () => {
  const stop = grip => {
    const c = createCar(); c.vx = 50;
    for (let i = 0; i < 2400 && c.vx > 0.01; i++) {
      const previous = c.vx;
      step(c, { brake: 1 }, FIXED_DT, () => grip);
      assert.ok(c.vx >= -1e-9 && c.vx <= previous + 1e-9);
    }
    assert.ok(c.vx < 0.01);
    return c.x;
  };
  const dry = stop(1), grass = stop(0.35);
  assert.ok(grass > dry * 1.5, `${dry}, ${grass}`);
});

test('left and right steering are mirrored', () => {
  const a = createCar(), b = createCar(); a.vx = b.vx = 25;
  run(a, 3, { throttle: 0.25, steer: 0.15 });
  run(b, 3, { throttle: 0.25, steer: -0.15 });
  assert.ok(a.y > 1 && a.heading > 0);
  near(a.x, b.x); near(a.y, -b.y); near(a.heading, -b.heading);
});

test('coasting dissipates energy', () => {
  const c = createCar(); c.vx = 60; c.vy = 5; c.yawRate = 0.1;
  const energy = () => c.config.mass * (c.vx ** 2 + c.vy ** 2) / 2 + c.config.yawInertia * c.yawRate ** 2 / 2;
  for (let i = 0; i < 2400; i++) {
    const before = energy(); step(c);
    assert.ok(energy() <= before + 1e-6);
  }
});

test('fixed stepping gives identical results across render rates', () => {
  const simulate = fps => {
    const sim = new Simulation();
    for (let i = 0; i < fps * 8; i++) sim.advance(1 / fps, { throttle: 0.5, steer: 0.05 });
    return sim.car;
  };
  const a = simulate(30);
  for (const fps of [60, 90, 144]) {
    const b = simulate(fps);
    for (const key of ['x', 'y', 'vx', 'vy', 'heading', 'time']) near(a[key], b[key]);
  }
});

test('hitches are bounded and invalid time is rejected', () => {
  const sim = new Simulation();
  assert.equal(sim.advance(5, { throttle: 1 }), 60);
  near(sim.droppedTime, 4.75);
  assert.throws(() => sim.advance(NaN, {}), RangeError);
  assert.throws(() => step(sim.car, {}, 1), RangeError);
});

test('mixed inputs remain finite through a two-minute stress run', () => {
  const c = createCar();
  for (let i = 0; i < 240 * 120; i++) {
    step(c, { throttle: i % 2000 < 1500 ? 1 : 0, brake: i % 2000 >= 1500 ? 1 : 0,
      steer: Math.sin(i / 500) * 0.6 }, FIXED_DT, (x, y) => x > 100 && y > 0 ? 0.35 : 1);
    for (const key of ['x', 'y', 'vx', 'vy', 'heading', 'yawRate']) assert.ok(Number.isFinite(c[key]));
    for (const w of c.telemetry.wheels) assert.ok(w.load >= 0 && w.utilization <= 1 + 1e-9);
  }
});
