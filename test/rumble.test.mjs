import test from 'node:test';
import assert from 'node:assert/strict';
import { createRumbleModel, createRumblePlayer } from '../src/rumble.mjs';
import { DEFAULT_CAR } from '../src/physics.mjs';

const state = (extra = {}) => ({ telemetry: { speed: 0, wheels: [], powertrain: { rpm: DEFAULT_CAR.idleRpm, shifting: false }, ...extra.telemetry }, impact: extra.impact ?? null, contact: extra.contact ?? null });

test('engine throbs with rpm and throttle, shakes at idle, chops on the limiter; each shift is one short thump', () => {
  const m = createRumbleModel(DEFAULT_CAR);
  const idle = [], full = [];
  for (let i = 0; i < 30; i++) idle.push(m.update(0.016, state(), { throttle: 0 }));
  for (let i = 0; i < 30; i++) full.push(m.update(0.016, state({ telemetry: { speed: 60, powertrain: { rpm: DEFAULT_CAR.maxRpm - 1000 } } }), { throttle: 1 }));
  const avg = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
  assert.ok(avg(idle, 'weak') > 0.05 && avg(full, 'weak') > 2.5 * avg(idle, 'weak'));
  assert.ok(Math.max(...idle.map(x => x.weak)) > Math.min(...idle.map(x => x.weak)), 'the engine throbs');
  assert.ok(avg(idle, 'strong') > 0.05 && Math.max(...idle.map(x => x.strong)) > 2 * Math.min(...idle.map(x => x.strong)), 'lumpy idle shake');
  assert.ok(avg(full, 'right') > 0.05 && avg(idle, 'right') === 0, 'throttle trigger buzzes under power');
  const limiter = [];
  for (let i = 0; i < 30; i++) limiter.push(m.update(0.016, state({ telemetry: { speed: 60, powertrain: { rpm: DEFAULT_CAR.maxRpm } } }), { throttle: 1 }).strong);
  assert.ok(Math.max(...limiter) > 0.4 && Math.min(...limiter) < 0.05);
  const shifting = state({ telemetry: { speed: 60, powertrain: { rpm: 10000, shifting: true } } });
  const thump = m.update(0.016, shifting, { throttle: 1 });
  assert.ok(thump.strong > 0.25);
  assert.ok(m.update(0.2, shifting, { throttle: 1 }).strong < 0.05, 'a held shift does not keep rumbling');
  assert.deepEqual(createRumbleModel(DEFAULT_CAR).update(0.016, { telemetry: { speed: 0, wheels: [] } }, null), { strong: 0, weak: 0, left: 0, right: 0 });
});

const on = (grip, rolling = 0) => [0, 1, 2, 3].map(() => ({ slipPower: 0, grip, rolling }));
const bare = (speed, wheels, extra = {}) => ({ telemetry: { speed, wheels }, ...extra });

test('sliding tires scrub on the weak motor; each rough surface feels different', () => {
  const m = createRumbleModel(DEFAULT_CAR);
  const sliding = m.update(0.016, bare(0, [0, 1, 2, 3].map(() => ({ slipPower: 40000, grip: 1 }))));
  assert.ok(sliding.weak > 0.4 && sliding.weak > sliding.strong);
  const grass = m.update(0.016, bare(40, on(0.35)));
  assert.ok(grass.strong > 0.45 && grass.strong > 2 * grass.weak);
  const gravel = m.update(0.016, bare(40, on(0.45, 0.25)));
  assert.ok(gravel.strong > grass.strong && gravel.weak > grass.weak);
  const runoff = m.update(0.016, bare(40, on(0.7)));
  assert.ok(runoff.strong === 0 && runoff.weak > 0);
  // Kerbs pulse: over a quarter second at speed the strong motor goes both high and low.
  const kerb = [];
  for (let i = 0; i < 16; i++) kerb.push(m.update(0.016, bare(40, on(0.9))).strong);
  assert.ok(Math.max(...kerb) > 0.6 && Math.min(...kerb) < 0.2);
  assert.equal(m.update(0.016, bare(0, on(0.35))).strong, 0);
  // Plain asphalt at speed: only a faint road grain on the weak motor.
  const road = m.update(0.016, bare(40, on(1)));
  assert.ok(road.strong === 0 && road.weak > 0 && road.weak < 0.1);
});

test('wheelspin buzzes the right trigger, lockup judders the left; dirty air buffets', () => {
  const m = createRumbleModel(DEFAULT_CAR);
  const wheels = s => [0, 1, 2, 3].map(() => ({ slipPower: 0, grip: 1, slipRatio: s }));
  const spin = m.update(0.016, bare(10, wheels(0.6)), { throttle: 1 });
  assert.ok(spin.right > 0.5 && spin.left === 0 && spin.weak > 0.2);
  const lock = [];
  for (let i = 0; i < 10; i++) lock.push(m.update(0.016, bare(40, wheels(-0.8)), { brake: 1 }));
  assert.ok(Math.max(...lock.map(x => x.left)) > 0.8 && lock.every(x => x.right === 0) && Math.max(...lock.map(x => x.strong)) > 0.4);
  assert.ok(Math.min(...lock.map(x => x.left)) < 0.6, 'lockup judders');
  const buffet = [];
  for (let i = 0; i < 40; i++) buffet.push(m.update(0.016, bare(60, on(1), { wake: { strength: 1 } })).strong);
  assert.ok(Math.max(...buffet) > 0.2 && Math.min(...buffet) < 0.1);
});

test('layers mix instead of the loudest masking the rest', () => {
  const m = createRumbleModel(DEFAULT_CAR);
  const grass = m.update(0.016, bare(40, on(0.35))).strong;
  const both = m.update(0.016, bare(40, on(0.35), { wake: { strength: 1 } })).strong;
  assert.ok(both > grass && both <= 1);
});

test('a wall impact is a long heavy hit felt in both triggers; car contact a short weak-motor knock', () => {
  const m = createRumbleModel(DEFAULT_CAR), impact = { speed: 20, time: 1 };
  const hit = m.update(0.016, bare(0, [], { impact }));
  assert.ok(hit.strong === 1 && hit.left > 0.4 && hit.right > 0.4);
  let after = m.update(0.5, bare(0, [], { impact }));
  assert.ok(after.strong < 0.3 && after.strong > 0.1);
  const n = createRumbleModel(DEFAULT_CAR), contact = { speed: 20, time: 2 };
  const knock = n.update(0.016, bare(0, [], { contact }));
  assert.ok(knock.weak === 1 && knock.strong < knock.weak);
  assert.ok(n.update(0.5, bare(0, [], { contact })).weak < 0.05);
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
  p.play([pad], { strong: 0.5, weak: 0.4 }, 60);
  assert.equal(calls.length, 2);
  p.play([pad], { strong: 0, weak: 0 }, 70);
  assert.deepEqual(calls.at(-1), ['reset']);
});

test('player drives the impulse triggers on pads with trigger-rumble', () => {
  const calls = [], pad = { vibrationActuator: { effects: ['dual-rumble', 'trigger-rumble'], playEffect: (type, p) => (calls.push([type, p]), Promise.resolve()) } };
  createRumblePlayer().play([pad], { strong: 0.2, weak: 0.1, left: 0.8, right: 0.3 }, 0);
  assert.equal(calls[0][0], 'trigger-rumble');
  assert.equal(calls[0][1].leftTrigger, 0.8);
  assert.equal(calls[0][1].rightTrigger, 0.3);
});


test('events duck the engine bed; kerb stripes alternate motors', () => {
  const m = createRumbleModel(DEFAULT_CAR), rpm = DEFAULT_CAR.maxRpm - 1000;
  const engine = s => ({ ...s, telemetry: { ...s.telemetry, powertrain: { rpm } } });
  const avg = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
  const free = [], kerb = [];
  for (let i = 0; i < 30; i++) free.push(m.update(0.016, engine(bare(40, on(1))), { throttle: 1 }));
  for (let i = 0; i < 60; i++) kerb.push(m.update(0.016, engine(bare(40, on(0.9))), { throttle: 1 }));
  assert.ok(avg(kerb, 'right') < 0.5 * avg(free, 'right'), 'engine trigger buzz ducked on the kerb');
  // Some stripes lead on the strong motor, others on the weak one.
  assert.ok(kerb.some(x => x.strong > 0.6 && x.weak < x.strong) && kerb.some(x => x.weak > 0.5 && x.strong < x.weak));
});

test('dual-rumble pads feel the trigger effects; Atari single-motor pads get both motors on each', () => {
  const calls = [], actuator = { playEffect: (type, p) => (calls.push(p), Promise.resolve()) };
  createRumblePlayer().play([{ id: 'Xbox Wireless Controller', vibrationActuator: actuator }], { strong: 0, weak: 0, left: 0.8, right: 0 }, 0);
  assert.ok(calls[0].strongMagnitude > 0.4 && calls[0].weakMagnitude === 0);
  createRumblePlayer().play([{ id: 'Atari Classic Controller (Vendor: 3250 Product: 1001)', vibrationActuator: actuator }], { strong: 0.5, weak: 0, left: 0, right: 0 }, 0);
  assert.equal(calls[1].strongMagnitude, 0.5);
  assert.equal(calls[1].weakMagnitude, 0.5);
});
