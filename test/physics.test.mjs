import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, wheelLoads, aeroMap, tireForce, relaxSlipAngle, engineTorque, shift, updateBody, tireTempGrip, updateTireTemp, tireWearGrip, updateTireWear, fitTires, carMass, newErsLap, TIRE_COMPOUNDS, Simulation, FIXED_DT }
  from '../src/physics.mjs';

const run = (car, seconds, input, surface) => {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) step(car, input, FIXED_DT, surface);
  return car;
};
const rollingCar = (speed, overrides = {}) => {
  const car = createCar(overrides);
  car.vx = speed;
  car.wheelOmega.fill(speed / car.config.wheelRadius);
  // Start in the gear a driver would hold at this speed, so tests do not
  // begin with a cascade of auto-upshifts from first gear.
  const rpm = ratio => speed / car.config.wheelRadius * ratio * 60 / (2 * Math.PI);
  const fit = car.config.gearRatios.findIndex(ratio => rpm(ratio) <= car.config.upshiftRpm);
  car.gear = fit < 0 ? car.config.gearRatios.length : fit + 1;
  return car;
};
const kineticEnergy = c => c.config.mass * (c.vx ** 2 + c.vy ** 2) / 2
  + c.config.yawInertia * c.yawRate ** 2 / 2
  + c.wheelOmega.reduce((sum, omega) => sum + c.config.wheelInertia * omega ** 2 / 2, 0);
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
// Peak crank power on the full-throttle curve, sampled every 10 rpm.
const peakPower = c => {
  let peak = 0;
  for (let rpm = 0; rpm <= c.maxRpm; rpm += 10) peak = Math.max(peak, engineTorque(c, rpm, 1) * rpm * Math.PI / 30);
  return peak;
};
// Peak drive power at the crank: the ICE curve plus the MGU-K.
const drivePower = c => peakPower(c) + (c.ers ? c.ersPower : 0);

test('rest is stable, including applied brakes and steering', () => {
  const c = run(createCar(), 10, { brake: 1, steer: 1 });
  near(c.x, 0); near(c.y, 0); near(c.yawRate, 0);
});

test('straight acceleration is symmetric and limited by the engine curve', () => {
  const c = run(createCar(), 10, { throttle: 1 });
  assert.ok(c.vx > 60 && c.vx < 100);
  near(c.y, 0); near(c.heading, 0);
  const rear = c.telemetry.wheels.slice(2);
  assert.ok(rear.reduce((sum, w) => sum + w.fx, 0) * c.vx
    < drivePower(c.config) * c.config.drivelineEfficiency * 1.001);
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
  const c = rollingCar(25, { dragArea: 0, rollingResistance: 0, engineBrakeTorque: 0 });
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
    assert.ok((kineticEnergy(c) - energy) / FIXED_DT
      <= drivePower(c.config) * c.config.drivelineEfficiency * 0.7 + 1e-6);
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
  // Coarse error can cross zero (shift timing), so ordering is only checked beyond 0.5%.
  assert.ok(Math.abs(normal.vx - fine.vx) < Math.max(Math.abs(coarse.vx - fine.vx), 0.005 * fine.vx));
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
        assert.ok(b.utilization < locked.config.slidingGripRatio + 0.05);
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
  // 2.3% at the default grip (tireMu 2.1): the shorter stop leaves fewer steps.
  assert.ok(Math.abs(normal - fine) / fine < 0.025);
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
  // Closed-throttle engine braking off: isolates the tire transient from shifts.
  const car = rollingCar(speed, { dragArea: 0, rollingResistance: 0, engineBrakeTorque: 0, ...overrides });
  car.steer = 0.02;
  const frontForce = [];
  for (let i = 0; i < Math.round(1.5 / dt); i++) {
    step(car, { steer: 0.02 / car.config.maxSteer }, dt);
    frontForce.push(car.telemetry.wheels[0].fy + car.telemetry.wheels[1].fy);
  }
  return { car, frontForce };
};

test('cornering stiffness grows with wheel load: the loaded outside front builds more force per radian', () => {
  const corner = overrides => {
    const car = rollingCar(60, { dragArea: 0, rollingResistance: 0, engineBrakeTorque: 0, ...overrides });
    for (let i = 0; i < 360; i++) step(car, { steer: 0.006 / car.config.maxSteer, throttle: 0.2 });
    const [inner, outer] = car.telemetry.wheels[0].load < car.telemetry.wheels[1].load ? car.telemetry.wheels : [car.telemetry.wheels[1], car.telemetry.wheels[0]];
    return { loads: outer.load / inner.load, stiffness: (outer.fy / outer.slipAngle) / (inner.fy / inner.slipAngle) };
  };
  // Small slip: the envelope is nearly linear, so force per radian is the stiffness.
  const scaled = corner({}), fixed = corner({ stiffnessLoadExponent: 0 });
  assert.ok(scaled.loads > 1.1, `load ratio ${scaled.loads}`);
  near(scaled.stiffness, scaled.loads ** 0.8, 0.03 * scaled.stiffness);
  near(fixed.stiffness, 1, 0.03);
});

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

test('engine torque follows the curve, cuts at the limiter and brakes when closed', () => {
  const c = createCar().config;
  near(engineTorque(c, 4000, 1), 250);
  near(engineTorque(c, 10500, 1), 457.5);
  near(engineTorque(c, 2000, 1), 250);
  near(engineTorque(c, c.maxRpm, 1), 0);
  near(engineTorque(c, c.maxRpm + 500, 1), 0);
  near(engineTorque(c, 12000, 0), -c.engineBrakeTorque * 0.8);
  near(engineTorque(c, 12000, 0.5), (455 - c.engineBrakeTorque * 0.8) / 2);
  const peak = peakPower(c);
  assert.ok(peak > 540000 && peak < 600000, `peak ${peak}`);
});

test('full-throttle run upshifts in sequence without exceeding the limiter', () => {
  const c = createCar();
  let gear = 1, shifts = 0, sawCut = false;
  for (let i = 0; i < 240 * 12; i++) {
    step(c, { throttle: 1 });
    const p = c.telemetry.powertrain;
    assert.ok(p.gear === gear || p.gear === gear + 1, `gear jump ${gear} -> ${p.gear}`);
    if (p.gear !== gear) { shifts++; gear = p.gear; }
    assert.ok(p.rpm <= c.config.maxRpm + 1e-9);
    if (p.shifting) { sawCut = true; near(c.telemetry.wheels[2].driveTorque + c.telemetry.wheels[3].driveTorque, 0); }
  }
  assert.ok(gear >= 7 && shifts === gear - 1 && sawCut, `gear ${gear}, shifts ${shifts}`);
  assert.ok(c.vx > 75, `speed ${c.vx}`);
});

test('braking from speed downshifts through the box', () => {
  const c = rollingCar(80);
  run(c, 1.5, { throttle: 1 });
  const top = c.gear;
  for (let i = 0; i < 240 * 6 && c.vx > 12; i++) {
    const before = c.gear;
    step(c, { brake: 0.6 });
    assert.ok(c.gear === before || c.gear === before - 1);
  }
  assert.ok(top >= 6 && c.gear <= 2, `top ${top}, final ${c.gear}`);
});

test('manual gearbox holds gear on the limiter and refuses over-rev downshifts', () => {
  const c = run(createCar({ autoShift: false }), 6, { throttle: 1 });
  assert.equal(c.gear, 1);
  assert.ok(c.telemetry.powertrain.limiter);
  const limitSpeed = c.config.maxRpm / 60 * 2 * Math.PI / c.config.gearRatios[0] * c.config.wheelRadius;
  assert.ok(c.vx < limitSpeed * 1.02, `${c.vx} vs ${limitSpeed}`);
  assert.equal(shift(c, 1), true);
  assert.equal(shift(c, 1), false, 'second request during the shift is ignored');
  run(c, 0.5, { throttle: 1 });
  assert.equal(shift(c, -1), false, 'downshift into gear 1 would exceed the limiter');
  assert.equal(c.gear, 2);
  const slow = rollingCar(10, { autoShift: false });
  slow.gear = 8;
  assert.equal(shift(slow, -1), true);
  assert.equal(slow.gear, 7);
  const bottom = createCar({ autoShift: false });
  assert.equal(shift(bottom, -1), false);
});

test('clutch slips for launch, then locks, and a closed throttle never creeps', () => {
  const idle = run(createCar(), 5, {});
  near(idle.x, 0); near(idle.vx, 0);
  assert.equal(idle.telemetry.powertrain.clutchLocked, false);
  const c = createCar();
  step(c, { throttle: 1 });
  assert.equal(c.telemetry.powertrain.clutchLocked, false);
  near(c.telemetry.powertrain.rpm, c.config.launchRpm);
  run(c, 1, { throttle: 1 });
  assert.equal(c.telemetry.powertrain.clutchLocked, true);
});

test('closed-throttle engine braking decelerates harder than coasting in neutral torque', () => {
  const coast = engineBrakeTorque => run(rollingCar(50, { engineBrakeTorque, autoShift: false,
    gearRatios: [5.35, 5.35, 5.35, 5.35, 5.35, 5.35, 5.35, 5.35] }), 2, {}).vx;
  const free = coast(0), braked = coast(80);
  assert.ok(braked < free - 1, `${braked} vs ${free}`);
});

test('limited-slip differential improves split-grip traction over an open differential', () => {
  // Left-side wheels on a low-grip patch (y > 0), right side on dry track.
  const surface = (x, y) => y > 0 ? 0.15 : 1;
  const launch = overrides => {
    const c = createCar(overrides);
    let maxDelta = 0;
    for (let i = 0; i < 240 * 2; i++) {
      step(c, { throttle: 0.6 }, FIXED_DT, surface);
      maxDelta = Math.max(maxDelta, c.wheelOmega[2] - c.wheelOmega[3]);
    }
    return { c, maxDelta };
  };
  const open = launch({ diffPreload: 0, diffRamp: 0 }), lsd = launch({});
  assert.ok(lsd.c.vx > open.c.vx * 1.05, `${lsd.c.vx} vs ${open.c.vx}`);
  assert.ok(lsd.maxDelta < open.maxDelta, `${lsd.maxDelta} vs ${open.maxDelta}`);
  assert.ok(open.maxDelta > 5, 'open differential lets the low-grip wheel spin up');
});

test('sprung body settles to the static roll, pitch and heave of a constant load', () => {
  const car = createCar(), c = car.config, g = 9.81;
  for (let i = 0; i < 480; i++) updateBody(car, -4 * g, 3 * g, 15000, FIXED_DT);
  near(car.body.roll, c.mass * 3 * g * c.cgHeight / c.rollStiffness, 1e-5);
  near(car.body.pitch, c.mass * 4 * g * c.cgHeight / c.pitchStiffness, 1e-5);
  near(car.body.heave, 15000 / c.heaveStiffness, 1e-5);
  // Signs: a left turn lifts the left side, braking dips the nose, downforce lowers the car.
  assert.ok(car.body.roll > 0 && car.body.pitch > 0 && car.body.heave > 0);
  // F1-like magnitudes: around a degree of roll/pitch, a couple of cm of aero squat.
  assert.ok(car.body.roll * 180 / Math.PI < 2 && car.body.pitch * 180 / Math.PI < 2 && car.body.heave < 0.03);
});

test('body modes are damped and stay bounded at the coarsest allowed timestep', () => {
  for (const dt of [FIXED_DT, 1 / 60]) {
    const car = createCar();
    let peak = 0;
    for (let i = 0; i < 2 / dt; i++) {
      updateBody(car, 0, i * dt < 0.5 ? 4 * 9.81 : 0, 0, dt);
      peak = Math.max(peak, Math.abs(car.body.roll));
    }
    const settled = car.config.mass * 4 * 9.81 * car.config.cgHeight / car.config.rollStiffness;
    // Underdamped overshoot (zeta 0.6 gives under 10%) then decay back to level.
    assert.ok(peak < settled * 1.12, `overshoot ${peak / settled}`);
    assert.ok(Math.abs(car.body.roll) < settled * 0.01 && Math.abs(car.body.rollRate) < 0.01);
  }
});

test('driving the car rolls it out of a left turn, dips the nose on braking and squats at speed', () => {
  const corner = run(rollingCar(40), 3, { steer: 0.15 });
  assert.ok(corner.ay > 5 && corner.body.roll > 0, `ay ${corner.ay} roll ${corner.body.roll}`);
  const fast = run(rollingCar(80), 0.5, { throttle: 0.6 });
  assert.ok(fast.body.heave > 0.01, `heave ${fast.body.heave}`);
  const braking = run(rollingCar(80), 0.5, { brake: 1 });
  assert.ok(braking.body.pitch > 0.005, `pitch ${braking.body.pitch}`);
  const accelerating = run(rollingCar(15), 0.5, { throttle: 1 });
  assert.ok(accelerating.body.pitch < 0, 'acceleration lifts the nose');
});
test('aero map: static ride heights at rest, ground effect as the floor drops, stall near the ground', () => {
  const car = createCar(), c = car.config;
  const rest = aeroMap(car);
  near(rest.front, c.frontRideHeight); near(rest.rear, c.rearRideHeight);
  near(rest.factor, 1); near(rest.frontShare, c.frontAero);
  assert.ok(!rest.stalled && !rest.bottoming);
  const factorAt = heave => { car.body.heave = heave; return aeroMap(car); };
  // Lowering the floor adds downforce until the stall height, then it is lost.
  const mid = factorAt(0.02), low = factorAt(0.045), stalled = factorAt(0.064);
  assert.ok(mid.factor > 1 && low.factor > mid.factor, `${mid.factor} ${low.factor}`);
  near(mid.factor, 1 + c.groundEffectGain * 0.02, 1e-12);
  assert.ok(stalled.stalled && stalled.factor < low.factor, `stall ${stalled.factor} vs ${low.factor}`);
  const grounded = factorAt(0.2);
  assert.ok(grounded.bottoming && grounded.front === 0 && grounded.rear === 0);
  near(grounded.factor, (1 + c.groundEffectGain * (0.06 - c.stallHeight)) * (1 - c.stallLoss), 1e-12);
});
test('nose-down pitch lowers the front, raises the rear and moves the aero balance forward', () => {
  const car = createCar(), c = car.config;
  car.body.pitch = 0.005;
  const map = aeroMap(car);
  near(map.front, c.frontRideHeight - 0.005 * c.wheelbase * (1 - c.frontWeight), 1e-12);
  near(map.rear, c.rearRideHeight + 0.005 * c.wheelbase * c.frontWeight, 1e-12);
  assert.ok(map.frontShare > c.frontAero, `share ${map.frontShare}`);
  const neutral = wheelLoads(car, 10000), forward = wheelLoads(car, 10000, map.frontShare);
  assert.ok(forward[0] + forward[1] > neutral[0] + neutral[1]);
  near(forward.reduce((a, b) => a + b), neutral.reduce((a, b) => a + b), 1e-9);
});
test('at speed the car squats into ground effect and settles without porpoising at any timestep', () => {
  for (const dt of [FIXED_DT, 1 / 60]) {
    const car = rollingCar(75);
    const heaves = [];
    for (let i = 0; i < Math.round(2 / dt); i++) {
      step(car, { throttle: 0.6 }, dt);
      if (i * dt > 1) heaves.push(car.body.heave);
    }
    const { aero, downforce, speed } = car.telemetry;
    const base = 0.5 * car.config.airDensity * speed * speed * car.config.downforceArea;
    assert.ok(aero.factor > 1.05 && downforce > base * 1.05, `factor ${aero.factor}`);
    assert.ok(aero.front > 0 && aero.rear > aero.front && !aero.stalled, `${aero.front} ${aero.rear}`);
    // Ride height drifts only with speed in the last second: no sustained oscillation.
    const swing = Math.max(...heaves) - Math.min(...heaves);
    assert.ok(swing < 0.002 && Math.abs(car.body.heaveRate) < 0.01, `dt ${dt} swing ${swing}`);
  }
});
test('heavy braking at speed shifts the aero balance forward with the pitch', () => {
  const car = run(rollingCar(80), 0.4, { brake: 1 });
  const { aero } = car.telemetry;
  assert.ok(car.body.pitch > 0 && aero.frontShare > car.config.frontAero + 0.02, `share ${aero.frontShare}`);
  assert.ok(aero.rear > car.config.rearRideHeight * 0.9 && aero.front < car.config.frontRideHeight / 2);
});

test('thermal grip peaks at the optimum, is symmetric about it and floors at the minimum', () => {
  const c = createCar().config, g = (surface, carcass = surface) => tireTempGrip(c, { surface, carcass });
  near(g(c.tireOptimalTemp), 1);
  near(g(c.tireOptimalTemp - 30), g(c.tireOptimalTemp + 30));
  assert.ok(g(70) < g(85) && g(85) < 1, `${g(70)} ${g(85)}`);
  near(g(-50), c.tireMinTempGrip); near(g(300), c.tireMinTempGrip);
  // The tread surface dominates: a hot surface on a cold carcass grips better than the reverse.
  assert.ok(g(100, 60) > g(60, 100));
});

test('tire temperatures reach the analytic two-node steady state at any timestep', () => {
  const c = createCar().config, P = 6000, R = 1500, v = 50;
  const hs = c.tireSurfaceCooling + c.tireSurfaceCoolingPerSpeed * v, hr = c.tireRoadConduction, k = c.tireCoreConduction;
  const hc = c.tireCarcassCooling + c.tireCarcassCoolingPerSpeed * v;
  // Solve [hs+hr+k, -k; -k, hc+k] [Ts; Tc] = [share*P + hs*Ta + hr*Tr; R + hc*Ta].
  const a = hs + hr + k, d = hc + k, b1 = c.tireSlipHeatShare * P + hs * c.ambientTemp + hr * c.trackTemp, b2 = R + hc * c.ambientTemp;
  const det = a * d - k * k, Ts = (b1 * d + k * b2) / det, Tc = (a * b2 + k * b1) / det;
  for (const dt of [1 / 60, 1 / 240, 1 / 960]) {
    const t = { surface: 20, carcass: 20 };
    for (let i = 0; i < 4000 / dt; i++) updateTireTemp(t, c, P, R, v, dt);
    near(t.surface, Ts, 0.01); near(t.carcass, Tc, 0.01);
  }
  // Without heat input the tire settles between the air and track temperatures.
  const idle = { surface: 110, carcass: 110 };
  for (let i = 0; i < 4000 * 60; i++) updateTireTemp(idle, c, 0, 0, 0, 1 / 60);
  assert.ok(idle.surface > c.ambientTemp && idle.surface < c.trackTemp && idle.carcass < idle.surface, JSON.stringify(idle));
});

test('sliding heats the tread while free rolling only cools it toward the air', () => {
  const rolling = rollingCar(50), locked = rollingCar(50), start = rolling.config.tireStartTemp;
  run(rolling, 1, {}); run(locked, 1, { brake: 1 });
  for (const w of rolling.telemetry.wheels) assert.ok(w.slipPower < 500 && w.surfaceTemp <= start, `${w.slipPower} ${w.surfaceTemp}`);
  for (const w of locked.tireTemp) assert.ok(w.surface > start + 5 && w.surface > w.carcass, JSON.stringify(w));
});

test('cold tires grip less: a stop on 40 °C tires is longer than on tires at the optimum', () => {
  const stop = temp => {
    const c = rollingCar(50, { tireStartTemp: temp });
    for (let i = 0; i < 2400 && c.vx > 0.01; i++) step(c, { brake: 1 });
    return c.x;
  };
  const warm = stop(100), cold = stop(40);
  assert.ok(cold > warm * 1.1, `${warm.toFixed(1)} vs ${cold.toFixed(1)} m`);
});
test('wear grip falls linearly, then off a cliff, and is clamped at both ends', () => {
  const c = createCar().config, g = w => tireWearGrip(c, w);
  near(g(0), 1); near(g(-1), 1);
  near(g(c.tireCliffWear), 1 - c.tireWearGripLoss * c.tireCliffWear);
  near(g(1), 1 - c.tireWearGripLoss - c.tireCliffGripLoss); near(g(2), g(1));
  // Steeper per unit of wear past the cliff than before it.
  assert.ok(g(0.9) - g(1) > 2 * (g(0.4) - g(0.5)), `${g(0.4)} ${g(0.5)} ${g(0.9)} ${g(1)}`);
});
test('wear accumulates sliding energy, is timestep independent, faster when hot and capped at 1', () => {
  const c = createCar().config, P = 20000, T = 10;
  for (const dt of [1 / 60, 1 / 240, 1 / 960]) {
    let w = 0;
    for (let i = 0; i < Math.round(T / dt); i++) w = updateTireWear(w, c, P, c.tireOptimalTemp - 20, dt);
    near(w, P * T / c.tireWearEnergy, 1e-9);
  }
  // Below the optimum temperature has no effect; one temperature scale above wears e times faster.
  const hot = updateTireWear(0, c, P, c.tireOptimalTemp + c.tireWearTempScale, 1);
  near(hot, Math.E * updateTireWear(0, c, P, c.tireOptimalTemp, 1), 1e-12);
  near(updateTireWear(0.99, c, 1e9, 150, 1), 1);
  assert.equal(updateTireWear(0.3, c, 0, 150, 1), 0.3);
});
test('a lockup wears the sliding tires, free rolling does not, and worn tires stop longer', () => {
  const rolling = rollingCar(50), locked = rollingCar(50);
  run(rolling, 1, {}); run(locked, 1, { brake: 1 });
  for (const w of rolling.tireWear) assert.ok(w < 1e-5, `${w}`);
  for (const w of locked.tireWear) assert.ok(w > 1e-4, `${w}`);
  near(locked.telemetry.wheels[0].wear, locked.tireWear[0]);
  const stop = wear => {
    const c = rollingCar(50, { tireStartTemp: 100, tireStartWear: wear });
    for (let i = 0; i < 2400 && c.vx > 0.01; i++) step(c, { brake: 1 });
    return c.x;
  };
  const fresh = stop(0), worn = stop(1);
  assert.ok(worn > fresh * 1.1, `${fresh.toFixed(1)} vs ${worn.toFixed(1)} m`);
});
test('softer compounds stop shorter and wear faster; fitTires fits a fresh set at blanket temperature', () => {
  const stop = compound => {
    const c = rollingCar(50, { tireStartTemp: 100, tireCompound: compound });
    for (let i = 0; i < 2400 && c.vx > 0.01; i++) step(c, { brake: 1 });
    return c;
  };
  const soft = stop('soft'), medium = stop('medium'), hard = stop('hard');
  assert.ok(soft.x < medium.x && medium.x < hard.x, `${soft.x.toFixed(2)} ${medium.x.toFixed(2)} ${hard.x.toFixed(2)} m`);
  assert.ok(soft.tireWear[0] > 1.5 * medium.tireWear[0] && hard.tireWear[0] < 0.7 * medium.tireWear[0]);
  near(soft.telemetry.wheels[0].compoundGrip ?? TIRE_COMPOUNDS.soft.grip, TIRE_COMPOUNDS.soft.grip);
  fitTires(soft, 'hard');
  assert.equal(soft.compound, 'hard');
  assert.deepEqual(soft.tireWear, [0, 0, 0, 0]);
  for (const t of soft.tireTemp) assert.deepEqual(t, { surface: 100, carcass: 100 });
  assert.throws(() => fitTires(soft, 'wet'), RangeError);
  assert.equal(createCar().compound, 'medium');
});

test('fuel: burnt with crank work near the 100 kg/h limit at peak power, adds mass, and an empty tank starves drive', () => {
  // Not modelled by default: no mass, no burn.
  const plain = run(rollingCar(60), 2, { throttle: 1 });
  assert.equal(plain.fuel, null);
  assert.equal(carMass(plain), plain.config.mass);
  const full = run(rollingCar(60, { fuelLoad: 50 }), 2, { throttle: 1 });
  const flow = full.telemetry.powertrain.fuelFlow;
  assert.ok(flow > 60 && flow < 101, `flow ${flow.toFixed(1)} kg/h`);
  assert.ok(full.fuel < 50 && full.fuel > 49.9, `fuel ${full.fuel}`);
  assert.equal(carMass(full), full.config.mass + full.fuel);
  // Closed throttle burns nothing.
  const coast = run(rollingCar(60, { fuelLoad: 50 }), 1, {});
  assert.equal(coast.fuel, 50);
  // The extra mass costs acceleration from the same speed.
  const light = run(rollingCar(30, { fuelLoad: 1 }), 2, { throttle: 1 });
  const heavy = run(rollingCar(30, { fuelLoad: 100 }), 2, { throttle: 1 });
  assert.ok(light.telemetry.speed > heavy.telemetry.speed + 0.5, `${light.telemetry.speed} vs ${heavy.telemetry.speed}`);
  // Empty: no drive whatever the pedal, the car only slows.
  const dry = run(rollingCar(60, { fuelLoad: 0 }), 2, { throttle: 1 });
  assert.ok(dry.telemetry.speed < 58, `speed ${dry.telemetry.speed}`);
  assert.equal(dry.telemetry.powertrain.fuelFlow, 0);
});

test('ERS: the MGU-K adds up to 120 kW above 100 km/h, burns no fuel, and can be held back', () => {
  const c = createCar().config;
  const hybrid = run(rollingCar(50, { fuelLoad: 50 }), 0.5, { throttle: 1 }), p = hybrid.telemetry.powertrain;
  near(p.ers.deploy, c.ersPower, 1e-6);
  near(p.crankTorque, p.iceTorque + p.ersTorque);
  near(p.ersTorque * p.rpm * Math.PI / 30, c.ersPower, 1e-6);
  // Fuel flow follows the ICE work alone.
  near(p.fuelFlow, p.iceTorque * p.rpm * Math.PI / 30 * c.fuelPerJoule * 3600, 1e-9);
  const held = run(rollingCar(50), 0.5, { throttle: 1, ers: false });
  const none = run(rollingCar(50, { ers: false }), 0.5, { throttle: 1 });
  assert.equal(held.telemetry.powertrain.ersTorque, 0);
  assert.equal(none.ers, null);
  assert.ok(hybrid.vx > held.vx + 0.2, `${hybrid.vx} vs ${held.vx}`);
  near(held.vx, none.vx, 1e-9);
  // Nothing below ersMinSpeed (no first-gear wheelspin from the MGU-K).
  const slow = run(rollingCar(15), 0.2, { throttle: 1 });
  assert.equal(slow.telemetry.powertrain.ersTorque, 0);
  // Part throttle deploys in proportion.
  const part = run(rollingCar(50), 0.2, { throttle: 0.5 });
  near(part.telemetry.powertrain.ers.deploy, c.ersPower / 2, 1e-6);
});

test('ERS: deployment stops at the per-lap allowance until a new lap; braking harvests up to the cap', () => {
  const car = rollingCar(60, { ersHeatShare: 0 });
  let t = 0;
  while (car.ers.deployed < car.config.ersDeployPerLap - 1 && t < 60) { step(car, { throttle: 1 }); t += FIXED_DT; }
  near(car.ers.deployed, car.config.ersDeployPerLap, 1e-6);
  near(car.ers.charge, car.config.ersCapacity - car.config.ersDeployPerLap, 1e-6);
  assert.ok(t > 33 && t < 34, `${t.toFixed(2)} s at 120 kW`); // 4 MJ / 120 kW = 33.3 s
  step(car, { throttle: 1 });
  assert.equal(car.telemetry.powertrain.ersTorque, 0); // allowance spent, store empty
  // Braking from speed: harvest capped at ersPower, energy goes into the store.
  car.vx = 80; car.wheelOmega.fill(80 / car.config.wheelRadius);
  step(car, { brake: 1 });
  near(car.telemetry.powertrain.ers.harvest, car.config.ersPower, 1e-6);
  near(car.ers.charge, car.config.ersPower * FIXED_DT, 1e-6);
  // The harvest cap per lap.
  car.ers.harvested = car.config.ersHarvestPerLap;
  step(car, { brake: 1 });
  assert.equal(car.telemetry.powertrain.ers.harvest, 0);
  // A new lap: allowances reset, charge kept; it deploys again.
  newErsLap(car);
  assert.equal(car.ers.deployed, 0); assert.equal(car.ers.harvested, 0);
  car.ers.charge = 1e6; car.vx = 60; car.wheelOmega.fill(60 / car.config.wheelRadius);
  run(car, 0.2, { throttle: 1 }); // past any downshift
  assert.ok(car.telemetry.powertrain.ersTorque > 0);
  // The store never overfills (MGU-H recovery at full throttle).
  const full = run(rollingCar(60), 1, { throttle: 1, ers: false });
  near(full.ers.charge, full.config.ersCapacity, 1e-6);
});

test('a loose surface ({ grip, rolling }) ploughs: gravel slows a coasting car more than grass, yet it drives out from rest', () => {
  const gravel = () => ({ grip: 0.45, rolling: 0.25 }), coast = surface => run(rollingCar(30), 2, {}, surface).telemetry.speed;
  const onGrass = coast(() => 0.35), onGravel = coast(gravel);
  assert.ok(onGravel < onGrass - 3, `gravel ${onGravel} vs grass ${onGrass}`);
  assert.equal(run(rollingCar(30), 0.1, {}, gravel).telemetry.wheels[0].rolling, 0.25);
  assert.ok(run(createCar(), 5, { throttle: 1 }, gravel).telemetry.speed > 5);
});
