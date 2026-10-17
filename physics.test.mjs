import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, wheelLoads, tireForce, relaxSlipAngle, Simulation, FIXED_DT } from './physics.mjs';

const run = (car, seconds, input, surface) => {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) step(car, input, FIXED_DT, surface);
  return car;
};
const rollingCar = (speed, overrides = {}) => {
  const car = createCar(overrides);
  car.vx = speed;
  car.wheelOmega.fill(speed / car.config.wheelRadius);
  return car;
};
const kineticEnergy = c => c.config.mass * (c.vx ** 2 + c.vy ** 2) / 2
  + c.config.yawInertia * c.yawRate ** 2 / 2
  + c.wheelOmega.reduce((sum, omega) => sum + c.config.wheelInertia * omega ** 2 / 2, 0);
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
    const c = rollingCar(50);
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

test('coasting dissipates chassis and wheel energy', () => {
  const c = rollingCar(60); c.vy = 5; c.yawRate = 0.1;
  const energy = () => kineticEnergy(c);
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
    for (const w of c.telemetry.wheels) {
      assert.ok(w.load >= 0 && w.utilization <= 1 + 1e-9);
      assert.ok(Number.isFinite(w.omega) && Number.isFinite(w.slipRatio));
    }
  }
});

test('free rolling preserves speed and zero slip without losses', () => {
  const c = rollingCar(25, { dragArea: 0, rollingResistance: 0 });
  run(c, 5, {});
  near(c.vx, 25);
  for (const w of c.telemetry.wheels) { near(w.fx, 0); near(w.slipRatio, 0); }
});

test('rear wheels spin under excess drive torque and lower grip increases slip', () => {
  const dry = run(createCar(), 1, { throttle: 1 });
  const slick = run(createCar(), 1, { throttle: 1 }, () => 0.2);
  assert.ok(slick.vx < dry.vx);
  assert.ok(slick.telemetry.wheels.slice(2).every(w => w.slipRatio > 1 && w.omega > 0));
  assert.ok(slick.telemetry.wheels[2].slipRatio > dry.telemetry.wheels[2].slipRatio);
  assert.ok(slick.telemetry.wheels.slice(0, 2).every(w => Math.abs(w.slipRatio) < 0.1));
});

test('hard braking locks wheels and releasing brakes restores rotation', () => {
  const c = rollingCar(30);
  run(c, 0.25, { brake: 1 });
  assert.ok(c.telemetry.wheels.every(w => w.locked && w.slipRatio < -0.99));
  run(c, 0.5, {});
  assert.ok(c.telemetry.wheels.every(w => !w.locked && w.omega > 0 && Math.abs(w.slipRatio) < 0.02));
});

test('zero grip transfers no contact force while driven wheels accelerate', () => {
  const c = run(createCar({ rollingResistance: 0 }), 2, { throttle: 1 }, () => 0);
  near(c.vx, 0); near(c.vy, 0);
  assert.ok(c.wheelOmega[2] > 100);
  for (const w of c.telemetry.wheels) { near(w.fx, 0); near(w.fy, 0); }
});

test('brakes hold against throttle without reversing wheel rotation', () => {
  const c = run(createCar(), 2, { throttle: 1, brake: 1 });
  near(c.vx, 0); near(c.x, 0);
  for (const omega of c.wheelOmega) near(omega, 0);
});

test('braking is stable in both directions down to rest at supported timesteps', () => {
  for (const dt of [1 / 60, 1 / 240, 1 / 960]) {
    for (const speed of [-30, -0.01, 0, 0.01, 30]) {
      const c = rollingCar(speed);
      for (let i = 0; i < 6 / dt; i++) {
        const before = kineticEnergy(c);
        step(c, { brake: 1 }, dt);
        assert.ok(c.vx * speed >= -1e-12);
        assert.ok(kineticEnergy(c) <= before + 1e-7);
      }
      assert.ok(Math.abs(c.vx) < 1e-6);
      assert.ok(c.wheelOmega.every(w => Math.abs(w) < 1e-6));
    }
  }
});

test('isolated rotating wheels obey torque balance and power bound', () => {
  const c = createCar({ rollingResistance: 0, dragArea: 0 });
  for (let i = 0; i < 2400; i++) {
    const before = [...c.wheelOmega];
    const energy = kineticEnergy(c);
    step(c, { throttle: 0.7 }, FIXED_DT, () => 0);
    for (let j = 0; j < 4; j++) {
      const w = c.telemetry.wheels[j];
      near((w.omega - before[j]) * c.config.wheelInertia / FIXED_DT,
        w.driveTorque - c.config.wheelRadius * w.fx - w.resistanceTorque, 1e-7);
    }
    assert.ok((kineticEnergy(c) - energy) / FIXED_DT <= c.config.power * 0.7 + 1e-6);
  }
});

test('contact impulses dissipate energy with arbitrary chassis and wheel motion', () => {
  let seed = 12345;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 5000; i++) {
    const c = createCar({ dragArea: 0, rollingResistance: 0 });
    c.vx = (random() - 0.5) * 100; c.vy = (random() - 0.5) * 40;
    c.yawRate = (random() - 0.5) * 10; c.steer = (random() - 0.5) * 0.76;
    c.wheelOmega = c.wheelOmega.map(() => (random() - 0.5) * 800);
    const before = kineticEnergy(c);
    const grip = random();
    step(c, { steer: c.steer / c.config.maxSteer, brake: random() }, 1 / 60, () => grip);
    assert.ok(kineticEnergy(c) <= before + 1e-7, `energy increased at sample ${i}`);
  }
});

test('straight acceleration converges as timestep is reduced', () => {
  const simulate = dt => {
    const c = createCar();
    for (let i = 0; i < 5 / dt; i++) step(c, { throttle: 0.5 }, dt);
    return c;
  };
  const coarse = simulate(1 / 60), normal = simulate(1 / 240), fine = simulate(1 / 960);
  assert.ok(Math.abs(normal.vx - fine.vx) < Math.abs(coarse.vx - fine.vx));
  assert.ok(Math.abs(normal.vx - fine.vx) / fine.vx < 0.01);
  assert.ok(Math.abs(normal.x - fine.x) / fine.x < 0.01);
});
test('combined tire envelope has a smooth peak and a lower sliding plateau', () => {
  const c = createCar().config;
  const load = c.mass * 9.81 / 4, capacity = c.tireMu * load;
  const force = q => tireForce(q * capacity, 0, 40, load, 1, c, FIXED_DT);
  near(force(0).fx, 0);
  near(force(1e-6).fx / (capacity * 1e-6), 1, 1e-6);
  near(force(2).fx, capacity);
  near(force(30).fx, capacity * c.slidingGripRatio);
  assert.equal(force(2).sliding, false);
  assert.equal(force(2.01).sliding, true);
  let previous = 0;
  for (let q = 0; q <= 2; q += 0.01) {
    const f = force(q);
    assert.ok(f.fx >= previous - 1e-9); previous = f.fx;
  }
  previous = capacity;
  for (let q = 2; q <= 30; q += 0.01) {
    const f = force(q);
    assert.ok(f.fx <= previous + 1e-9);
    assert.ok(f.fx >= capacity * c.slidingGripRatio - 1e-9); previous = f.fx;
  }
  const h = 1e-5;
  near((force(2).fx - force(2 - h).fx) / (h * capacity), 0, 1e-5);
  near((force(2 + h).fx - force(2).fx) / (h * capacity), 0, 1e-5);
});

test('pure lateral force peaks, falls off and is symmetric in reverse', () => {
  const c = createCar().config, load = c.mass * 9.81 / 4;
  const capacity = c.tireMu * load;
  for (const speed of [-40, 40]) {
    const force = q => tireForce(0, Math.tan(q * capacity / c.corneringStiffness) * Math.abs(speed),
      speed, load, 1, c, FIXED_DT);
    near(force(2).fy, -capacity);
    near(force(20).fy, -capacity * c.slidingGripRatio, 1e-8);
    near(force(-2).fy, capacity);
    assert.ok(Math.abs(force(3).fy) < Math.abs(force(2).fy));
  }
});

test('combined demands share a radial envelope without changing force direction', () => {
  const c = createCar().config, load = c.mass * 9.81 / 4;
  const capacity = c.tireMu * load;
  for (const q of [0.01, 0.5, 2, 3, 10]) {
    for (let a = 0; a < 2 * Math.PI; a += 0.1) {
      const dx = q * capacity * Math.cos(a), dy = q * capacity * Math.sin(a);
      const lateralSpeed = Math.tan(-dy / c.corneringStiffness) * 40;
      const f = tireForce(dx, lateralSpeed, 40, load, 1, c, FIXED_DT);
      const pure = tireForce(q * capacity, 0, 40, load, 1, c, FIXED_DT);
      near(Math.hypot(f.fx, f.fy), pure.fx, 1e-8);
      near(f.fx, pure.fx * Math.cos(a), 1e-8);
      near(f.fy, pure.fx * Math.sin(a), 1e-8);
    }
  }
});

test('peak force responds to surface grip and load sensitivity', () => {
  const c = createCar().config;
  let previous = 0;
  for (const load of [100, 1000, 2000, 10000]) {
    const capacity = c.tireMu * load * (load / (c.mass * 9.81 / 4)) ** -c.loadSensitivity;
    const peak = tireForce(2 * capacity, 0, 40, load, 1, c, FIXED_DT);
    const halfGrip = tireForce(capacity, 0, 40, load, 0.5, c, FIXED_DT);
    near(peak.fx, capacity); near(halfGrip.fx, capacity / 2);
    assert.ok(peak.fx > previous); previous = peak.fx;
  }
  for (const [load, grip] of [[0, 1], [2000, 0]]) {
    const f = tireForce(1e5, 10, 40, load, grip, c, FIXED_DT);
    near(f.fx, 0); near(f.fy, 0); near(f.combinedDemand, 0);
    assert.equal(f.sliding, false);
  }
});

test('locked wheels lose cornering authority in forward and reverse travel', () => {
  for (const speed of [-30, 30]) {
    for (const dt of [1 / 60, 1 / 240, 1 / 960]) {
      const rolling = rollingCar(speed), locked = rollingCar(speed);
      rolling.steer = locked.steer = 0.04;
      locked.wheelOmega.fill(0);
      step(rolling, { steer: 0.04 / rolling.config.maxSteer }, dt);
      step(locked, { steer: 0.04 / locked.config.maxSteer, brake: 1 }, dt);
      for (let i = 0; i < 2; i++) {
        const a = rolling.telemetry.wheels[i], b = locked.telemetry.wheels[i];
        assert.ok(b.locked && b.sliding);
        assert.ok(Math.abs(b.fy) < Math.abs(a.fy) * 0.25);
        assert.ok(b.utilization < 0.8);
      }
    }
  }
});

test('high-slip braking converges and falloff lengthens locked-wheel stops', () => {
  const stop = (dt, slidingGripRatio) => {
    const c = rollingCar(30, { slidingGripRatio });
    for (let i = 0; i < 10 / dt && c.vx > 0.01; i++) step(c, { brake: 1 }, dt);
    assert.ok(c.vx <= 0.01);
    return c.x;
  };
  const fine = stop(1 / 960, 0.75), normal = stop(1 / 240, 0.75), coarse = stop(1 / 60, 0.75);
  assert.ok(Math.abs(normal - fine) < Math.abs(coarse - fine));
  assert.ok(Math.abs(normal - fine) / fine < 0.02);
  assert.ok(normal > stop(1 / 240, 1) * 1.15);
});

test('loaded contact force preserves wheel torque balance through sliding and release', () => {
  const c = rollingCar(30);
  let sawSliding = false;
  for (let i = 0; i < 1200; i++) {
    const before = [...c.wheelOmega];
    step(c, { brake: i < 120 ? 1 : 0, throttle: i > 360 ? 1 : 0, steer: 0.1 });
    for (let j = 0; j < 4; j++) {
      const w = c.telemetry.wheels[j];
      sawSliding ||= w.sliding;
      near((w.omega - before[j]) * c.config.wheelInertia / FIXED_DT,
        w.driveTorque - c.config.wheelRadius * w.fx - w.resistanceTorque, 1e-7);
    }
  }
  assert.ok(sawSliding);
});

test('grip discontinuities and sustained sliding remain passive without propulsion', () => {
  const c = rollingCar(60, { dragArea: 0, rollingResistance: 0 });
  c.vy = 20; c.yawRate = 2; c.wheelOmega = [0, -40, 400, 800];
  for (let i = 0; i < 6000; i++) {
    const before = kineticEnergy(c);
    step(c, { steer: Math.sin(i / 100), brake: i % 500 < 100 ? 1 : 0 },
      FIXED_DT, () => [1, 0, 0.1, 2][Math.floor(i / 25) % 4]);
    assert.ok(kineticEnergy(c) <= before + 1e-7, `energy increased at step ${i}`);
    for (const w of c.telemetry.wheels) {
      assert.ok(Number.isFinite(w.combinedDemand));
      assert.ok(w.utilization <= 1 + 1e-9);
    }
  }
});

test('slip relaxation decays by e per relaxation length independent of timestep', () => {
  const c = createCar().config;
  for (const dt of [1 / 240, 1 / 960]) {
    let alpha = 0;
    const speed = 40, steps = 30;
    // Travel exactly one relaxation length in `steps` substeps.
    const h = c.relaxationLength / speed / steps * (dt * 240);
    for (let i = 0; i < steps / (dt * 240); i++) alpha = relaxSlipAngle(alpha, 0.1, speed, c, h);
    near(alpha, 0.1 * (1 - Math.exp(-1)), 1e-12);
  }
  // Near rest the floor speed sets the response so the state cannot freeze.
  near(relaxSlipAngle(0, 0.1, 0, c, 1), relaxSlipAngle(0, 0.1, c.relaxationSpeedFloor, c, 1));
});

const stepSteer = (overrides, dt = FIXED_DT, speed = 50) => {
  const car = rollingCar(speed, { dragArea: 0, rollingResistance: 0, ...overrides });
  car.steer = 0.05;
  const frontForce = [];
  for (let i = 0; i < Math.round(1.5 / dt); i++) {
    step(car, { steer: 0.05 / car.config.maxSteer }, dt);
    frontForce.push(car.telemetry.wheels[0].fy + car.telemetry.wheels[1].fy);
  }
  return { car, frontForce };
};

test('step steer builds front force over the relaxation length', () => {
  const lagged = stepSteer({});
  const instant = stepSteer({ relaxationLength: 1e-6 });
  // One 240 Hz step covers 0.21 m at 50 m/s: about 37% of the 0.45 m response.
  const ratio = lagged.frontForce[0] / instant.frontForce[0];
  assert.ok(ratio > 0.3 && ratio < 0.45, `first-step ratio ${ratio}`);
  assert.ok(lagged.frontForce[4] > 0.9 * instant.frontForce[4]);
  // Transient only: the settled yaw response matches the instantaneous tire.
  assert.ok(Math.abs(lagged.car.yawRate - instant.car.yawRate) / Math.abs(instant.car.yawRate) < 0.02);
});

test('relaxation lag time scales inversely with speed', () => {
  const riseTime = speed => {
    const { frontForce } = stepSteer({}, FIXED_DT / 4, speed);
    const instant = stepSteer({ relaxationLength: 1e-6 }, FIXED_DT / 4, speed).frontForce;
    return frontForce.findIndex((f, i) => f >= 0.632 * instant[i]) * FIXED_DT / 4;
  };
  const slow = riseTime(15), fast = riseTime(60);
  assert.ok(slow > fast * 2.5 && slow < fast * 5, `${slow} vs ${fast}`);
});

test('step steer with relaxation converges as timestep is reduced', () => {
  const normal = stepSteer({}, 1 / 240).car, fine = stepSteer({}, 1 / 960).car;
  assert.ok(Math.abs(normal.yawRate - fine.yawRate) / Math.abs(fine.yawRate) < 0.01);
  assert.ok(Math.abs(normal.y - fine.y) / Math.abs(fine.y) < 0.02);
});
