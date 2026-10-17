import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, resolveBarrier, FIXED_DT } from './physics.mjs';
import { createStadiumTrack, SURFACE_GRIP } from './track.mjs';

const track = createStadiumTrack({ halfStraight: 220, radius: 90, roadWidth: 15 });
// Footprint corners must stay inside both walls (small tolerance for one step of travel).
const insideWalls = (car) => {
  const c = car.config, cos = Math.cos(car.heading), sin = Math.sin(car.heading);
  return [[c.bodyFront, c.bodyHalfWidth], [c.bodyFront, -c.bodyHalfWidth], [-c.bodyRear, c.bodyHalfWidth], [-c.bodyRear, -c.bodyHalfWidth]]
    .every(([bx, by]) => Math.abs(track.offset(car.x + bx * cos - by * sin, car.y + bx * sin + by * cos)) <= track.wallOffset + 1e-6);
};
const energy = (car) => 0.5 * car.config.mass * (car.vx ** 2 + car.vy ** 2) + 0.5 * car.config.yawInertia * car.yawRate ** 2;

test('surfaces run asphalt, kerb, runoff, grass outward on straights and arcs', () => {
  for (const [d, name] of [[0, 'asphalt'], [7.4, 'asphalt'], [8, 'kerb'], [10, 'runoff'], [16, 'grass']]) {
    assert.equal(track.surface(0, -90 - d), name, `bottom straight outside ${d} m`);
    assert.equal(track.surface(0, -90 + d), name, `bottom straight inside ${d} m`);
    assert.equal(track.surface(220 + 90 + d, 0), name, `right arc outside ${d} m`);
  }
  assert.equal(track.surfaceAt(0, -98), SURFACE_GRIP.kerb);
});

test('barriers report depth and an inward normal on both walls', () => {
  assert.equal(track.barrierAt(0, -90), null);
  const outer = track.barrierAt(0, -90 - track.wallOffset - 0.5);
  assert.ok(Math.abs(outer.depth - 0.5) < 1e-9 && Math.abs(outer.ny - 1) < 1e-12);
  const inner = track.barrierAt(0, -90 + track.wallOffset + 0.25);
  assert.ok(Math.abs(inner.depth - 0.25) < 1e-9 && Math.abs(inner.ny + 1) < 1e-12);
  const arc = track.barrierAt(220 + 90 + track.wallOffset + 1, 0);
  assert.ok(Math.abs(arc.nx + 1) < 1e-12 && Math.abs(arc.depth - 1) < 1e-9);
});

test('head-on wall impact rebounds with the restitution ratio and no spin', () => {
  const car = createCar({ wallFriction: 0 });
  car.heading = -Math.PI / 2; car.y = -90 - track.wallOffset + car.config.bodyFront - 0.01; car.vy = -30;
  const closing = resolveBarrier(car, track.barrierAt);
  assert.ok(Math.abs(closing - 30) < 1e-9);
  assert.ok(Math.abs(car.vy - 30 * car.config.wallRestitution) < 1e-9, `rebound ${car.vy}`);
  assert.ok(Math.abs(car.yawRate) < 1e-9 && Math.abs(car.vx) < 1e-9);
  assert.equal(car.impact.speed, closing);
});

test('glancing impact dissipates energy, yaws the car away from the wall and keeps it inside', () => {
  const car = createCar();
  car.y = -90 - track.wallOffset + 1.2; car.heading = -0.35;
  car.vx = 60 * Math.cos(car.heading); car.vy = 60 * Math.sin(car.heading);
  car.wheelOmega.fill(60 / car.config.wheelRadius); car.gear = 7;
  const before = energy(car);
  let hits = 0;
  for (let i = 0; i < 240 * 2; i++) {
    step(car, { throttle: 0 }, FIXED_DT, track.surfaceAt, track.barrierAt);
    if (car.impact && car.impact.time >= car.time - 1.5 * FIXED_DT) hits++;
    assert.ok(insideWalls(car), `left the circuit at step ${i}`);
    assert.ok([car.x, car.y, car.vx, car.vy, car.yawRate].every(Number.isFinite));
  }
  assert.ok(hits > 0, 'the car touched the wall');
  assert.ok(energy(car) < 0.8 * before, `energy ${energy(car).toFixed(0)} vs ${before.toFixed(0)}`);
  assert.ok(Math.sin(car.heading) > -0.2, `heading ${car.heading.toFixed(2)} turned back along the wall`);
});

test('full throttle into the outer wall at speed never tunnels through it', () => {
  for (const angle of [-0.2, -0.6, -1.2, -Math.PI / 2]) {
    const car = createCar();
    car.y = -90; car.heading = angle;
    car.vx = 85 * Math.cos(angle); car.vy = 85 * Math.sin(angle);
    car.wheelOmega.fill(85 / car.config.wheelRadius); car.gear = 8;
    let hardest = 0;
    for (let i = 0; i < 240 * 3; i++) {
      step(car, { throttle: 1 }, FIXED_DT, track.surfaceAt, track.barrierAt);
      hardest = Math.max(hardest, car.impact?.speed ?? 0);
      assert.ok(insideWalls(car), `angle ${angle}: left the circuit at step ${i}`);
    }
    assert.ok(hardest > 5, `angle ${angle}: hardest impact ${hardest.toFixed(1)} m/s`);
  }
});
