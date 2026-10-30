import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar } from '../src/physics.mjs';
import { createCircuitAutopilot } from '../src/autopilot.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { chevronLayout, brakeWindow, buildChevrons, SPACING } from '../src/chevrons.mjs';

const setup = key => {
  const track = createCircuitTrack(CIRCUITS[key]), car = createCar(), drive = createCircuitAutopilot(track);
  const speedAt = s => drive.planSpeed(car, s), c = car.config, a = drive.brakeDecel(c, 0), b = drive.brakeDecel(c, 1) - a;
  return { track, speedAt, brakeDist: (v, vt) => Math.log((a + b * v * v) / (a + b * vt * vt)) / (2 * b) };
};

test('chevrons lie on the racing line, on the road surface, pointing along it', () => {
  for (const key of ['monza', 'rwanda']) {
    const { track, speedAt } = setup(key), list = chevronLayout(track, speedAt);
    assert.equal(list.length, Math.floor(track.length / SPACING));
    for (const c of list) {
      const [x, y] = track.point(c.s, track.lineOffset(c.s));
      assert.ok(Math.hypot(c.p[0] - x, -c.p[2] - y) < 1e-6);
      assert.ok(Math.abs(c.p[1] - 0.045 - track.elevation(c.s, track.lineOffset(c.s))) < 1e-6);
      assert.ok(c.N[1] > 0.9, `${key} ${c.s}: up ${c.N[1]}`);
      const h = track.heading(c.s);
      assert.ok(c.T[0] * Math.cos(h) - c.T[2] * Math.sin(h) > 0.8, `${key} ${c.s}: forward`);
    }
    // Some braking zones, but most of the lap is not one.
    const red = list.filter(c => c.brake).length;
    assert.ok(red > 10 && red < list.length / 3, `${key}: ${red} of ${list.length} in braking zones`);
  }
});

test('the brake window: on the plan speed no early braking; too fast, it starts earlier', () => {
  const { track, speedAt, brakeDist } = setup('monza');
  // Lowest plan speed on the lap and 300 m before it.
  let low = 0;
  for (let s = 0; s < track.length; s += 5) if (speedAt(s) < speedAt(low)) low = s;
  const s0 = low - 300;
  // At the plan's speed braking starts no earlier than where the plan brakes.
  const onPlan = brakeWindow(s0, speedAt(s0) - 1, speedAt, brakeDist);
  assert.ok(!onPlan || onPlan[0] > -5, JSON.stringify(onPlan));
  assert.equal(brakeWindow(low, speedAt(low) - 1, speedAt, brakeDist)?.[0] < 0, false);
  const w = brakeWindow(s0, speedAt(s0) + 30, speedAt, brakeDist);
  assert.ok(w && w[0] < w[1] && w[1] <= 450, JSON.stringify(w));
  // Faster means braking earlier.
  assert.ok(brakeWindow(s0, speedAt(s0) + 40, speedAt, brakeDist)[0] < w[0]);
  const chev = buildChevrons(track, speedAt, brakeDist);
  assert.equal(chev.mesh.count, Math.floor(track.length / SPACING));
  chev.update(s0, speedAt(s0) + 30);
  assert.equal(chev.uniforms.brakeFrom.value, w[0]);
  chev.mode(0); assert.equal(chev.mesh.visible, false);
});
