import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_DEFAULTS, shapeAxis, readGamepad, createDriverInput } from './input.mjs';

const none = { throttle: false, brake: false, left: false, right: false };
const run = (input, seconds, dt, keys, pad = null, speed = 0) => {
  let out; for (let n = Math.round(seconds / dt); n > 0; n--) out = input.update(dt, keys, pad, speed); return out;
};
const pad = (stick, lt, rt, extra = {}) => ({ connected: true, mapping: 'standard', axes: [stick, 0, 0, 0],
  buttons: Array.from({ length: 17 }, (_, i) => ({ value: i === 6 ? lt : i === 7 ? rt : 0, pressed: false })), ...extra });

test('shapeAxis applies deadzone, rescales to full travel and keeps sign', () => {
  assert.equal(shapeAxis(0.05, 0.08), 0);
  assert.equal(shapeAxis(-0.08, 0.08), 0);
  assert.equal(shapeAxis(1, 0.08), 1);
  assert.equal(shapeAxis(-1, 0.08, 1.5), -1);
  assert.ok(Math.abs(shapeAxis(0.54, 0.08) - 0.5) < 1e-12);
  assert.ok(shapeAxis(0.54, 0.08, 1.5) < 0.5); // finer near centre
  let prev = 0; for (let v = 0; v <= 1; v += 0.01) { const s = shapeAxis(v, 0.08, 1.5); assert.ok(s >= prev); prev = s; }
});

test('keyboard throttle ramps to full in 1/rise seconds, independent of step size', () => {
  for (const dt of [1 / 240, 1 / 60, 1 / 30]) {
    const input = createDriverInput();
    const part = run(input, 1 / 15, dt, { ...none, throttle: true });
    assert.ok(Math.abs(part.throttle - 0.4) < 1e-9, `dt ${dt}: ${part.throttle}`);
    assert.equal(run(input, 0.2, dt, { ...none, throttle: true }).throttle, 1);
    // Durations are whole multiples of every dt; fall rate 10/s.
    assert.ok(Math.abs(run(input, 1 / 15, dt, none).throttle - 1 / 3) < 1e-9);
    assert.ok(run(input, 1 / 15, dt, none).throttle < 1e-9);
  }
});

test('keyboard steering ramps to lock, returns faster, and crosses centre without overshoot', () => {
  const input = createDriverInput(), dt = 1 / 240;
  const full = run(input, 0.5, dt, { ...none, left: true });
  assert.equal(full.steer, 1);
  assert.ok(Math.abs(run(input, 0.1, dt, none).steer - 0.5) < 1e-9); // steerReturn 5/s
  assert.equal(run(input, 0.1, dt, none).steer, 0);
  run(input, 0.5, dt, { ...none, left: true });
  // Full left to right: 0.2 s back to centre, then 3/s toward right lock.
  const reversed = run(input, 0.3, dt, { ...none, right: true });
  assert.ok(Math.abs(reversed.steer + 0.3) < 1e-9, String(reversed.steer));
  // A single large step is exact too.
  const big = createDriverInput(); big.update(1, { ...none, left: true }, null);
  assert.ok(Math.abs(big.update(0.3, { ...none, right: true }, null).steer + 0.3) < 1e-12);
});

test('steering authority falls with speed for both keyboard and stick', () => {
  const input = createDriverInput();
  run(input, 0.5, 1 / 240, { ...none, left: true });
  const at = speed => input.update(1 / 240, { ...none, left: true }, null, speed).steer;
  assert.equal(at(0), 1);
  assert.ok(Math.abs(at(22) - 0.5) < 1e-12);
  const stick = createDriverInput().update(1 / 240, none, readGamepad(pad(1, 0, 0)), 44);
  assert.ok(Math.abs(stick.steer + 0.2) < 1e-12); // right stick -> negative (right) steer
});

test('gamepad standard mapping: triggers are analog pedals, left stick steers, others ignored', () => {
  const p = readGamepad(pad(-0.54, 1, 0.54));
  assert.equal(p.brake, 1);
  assert.ok(Math.abs(p.throttle - 0.5) < 1e-12);
  assert.ok(p.steer > 0 && p.steer < 0.5); // left, shaped
  assert.equal(readGamepad(pad(0.5, 0, 0, { mapping: '' })), null);
  assert.equal(readGamepad(pad(0.5, 0, 0, { connected: false })), null);
  assert.equal(readGamepad(null), null);
  const digital = pad(0, 0, 0); digital.buttons[7] = { pressed: true }; // no analog value reported
  assert.equal(readGamepad(digital).throttle, 1);
});

test('gamepad is applied directly; keyboard and pad merge, source follows the last active device', () => {
  const input = createDriverInput();
  const out = input.update(1 / 240, none, readGamepad(pad(0, 0, 0.77)));
  assert.ok(Math.abs(out.throttle - 0.75) < 1e-12); // no ramp for analog inputs
  assert.equal(input.source, 'gamepad');
  const merged = input.update(1 / 240, { ...none, left: true }, readGamepad(pad(1, 0, 0.77)));
  assert.equal(input.source, 'keyboard');
  assert.ok(merged.steer > 0, 'held key overrides stick'); assert.ok(Math.abs(merged.throttle - 0.75) < 1e-12);
  input.reset(); assert.deepEqual(input.keyboard, { throttle: 0, brake: 0, steer: 0 });
  assert.equal(INPUT_DEFAULTS.deadzone, 0.08);
});
