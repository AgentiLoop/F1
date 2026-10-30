import test from 'node:test';
import assert from 'node:assert/strict';
import { createRumbleModel, createRumblePlayer } from '../src/rumble.mjs';
import { DEFAULT_CAR } from '../src/physics.mjs';

const state = (extra = {}) => ({ telemetry: { speed: 0, wheels: [], powertrain: { rpm: DEFAULT_CAR.idleRpm, shifting: false }, ...extra.telemetry }, impact: extra.impact ?? null, contact: extra.contact ?? null });

test('engine rumble rises with rpm and throttle; each shift is one short thump', () => {
  const m = createRumbleModel(DEFAULT_CAR);
  const idle = m.update(0.016, state(), { throttle: 0 });
  const full = m.update(0.016, state({ telemetry: { powertrain: { rpm: DEFAULT_CAR.maxRpm } } }), { throttle: 1 });
  assert.ok(idle.weak > 0 && full.weak > 3 * idle.weak);
  assert.equal(idle.strong, 0);
  const shifting = state({ telemetry: { powertrain: { rpm: 10000, shifting: true } } });
  const thump = m.update(0.016, shifting, { throttle: 1 });
  assert.ok(thump.strong > 0.25 && thump.strong > thump.weak);
  assert.ok(m.update(0.2, shifting, { throttle: 1 }).strong < 0.05, 'a held shift does not keep rumbling');
  assert.deepEqual(createRumbleModel(DEFAULT_CAR).update(0.016, { telemetry: { speed: 0, wheels: [] } }, null), { strong: 0, weak: 0 });
});

const on = (grip, rolling = 0) => [0, 1, 2, 3].map(() => ({ slipPower: 0, grip, rolling }));

test('sliding tires scrub on the weak motor; each rough surface feels different', () => {
  const m = createRumbleModel(DEFAULT_CAR);
  const sliding = m.update(0.016, state({ telemetry: { wheels: [0, 1, 2, 3].map(() => ({ slipPower: 40000, grip: 1 })) } }));
  assert.ok(sliding.weak > 0.5 && sliding.weak > sliding.strong);
  const grass = m.update(0.016, state({ telemetry: { speed: 40, wheels: on(0.35) } }));
  assert.ok(grass.strong > 0.45 && grass.strong > 2 * grass.weak);
  const gravel = m.update(0.016, state({ telemetry: { speed: 40, wheels: on(0.45, 0.25) } }));
  assert.ok(gravel.strong > grass.strong && gravel.weak > grass.weak);
  const runoff = m.update(0.016, state({ telemetry: { speed: 40, wheels: on(0.7) } }));
  assert.ok(runoff.strong === 0 && runoff.weak > 0);
  // Kerbs pulse: over a quarter second at speed the strong motor goes both high and low.
  const kerb = [];
  for (let i = 0; i < 16; i++) kerb.push(m.update(0.016, state({ telemetry: { speed: 40, wheels: on(0.9) } })).strong);
  assert.ok(Math.max(...kerb) > 0.6 && Math.min(...kerb) < 0.2);
  assert.equal(m.update(0.016, state({ telemetry: { speed: 0, wheels: on(0.35) } })).strong, 0);
});

test('a wall impact is a long heavy hit; car contact a short weak-motor knock', () => {
  const m = createRumbleModel(DEFAULT_CAR), impact = { speed: 20, time: 1 };
  assert.equal(m.update(0.016, state({ impact })).strong, 1);
  let after = m.update(0.5, state({ impact }));
  assert.ok(after.strong < 0.3 && after.strong > 0.1);
  const n = createRumbleModel(DEFAULT_CAR), contact = { speed: 20, time: 2 };
  const knock = n.update(0.016, state({ contact }));
  assert.ok(knock.weak === 1 && knock.strong < knock.weak);
  assert.ok(n.update(0.5, state({ contact })).weak < 0.05);
});

test('player sends dual-rumble effects and stops when the levels drop to zero', () => {
  const calls = [], pad = { vibrationActuator: { playEffect: (type, p) => (calls.push([type, p]), Promise.resolve()), reset: () => (calls.push(['reset']), Promise.resolve()) } };
  const p = createRumblePlayer();
  p.play([pad], { strong: 0, weak: 0 }, 0);
  assert.equal(calls.length, 0);
  p.play([pad, { connected: true }], { strong: 0.5, weak: 0.4 }, 0);
  assert.equal(calls[0][0], 'dual-rumble');
  assert.equal(calls[0][1].strongMagnitude, 0.5);
  p.play([pad], { strong: 0.5, weak: 0.4 }, 10);
  assert.equal(calls.length, 1);
  p.play([pad], { strong: 0.5, weak: 0.4 }, 100);
  assert.equal(calls.length, 2);
  p.play([pad], { strong: 0, weak: 0 }, 110);
  assert.deepEqual(calls.at(-1), ['reset']);
});
