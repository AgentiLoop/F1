import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_DEFAULTS, firingFrequency, createSoundModel, createAudioEngine } from './audio.mjs';
import { createCar, step, DEFAULT_CAR, FIXED_DT } from './physics.mjs';

const run = (car, seconds, input) => {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) step(car, input, FIXED_DT);
  return car;
};
const pt = (rpm, extra = {}) => ({ speed: 0, wheels: [], powertrain: { rpm, shifting: false, limiter: false, ...extra } });

test('firing frequency is three pulses per revolution for a four-stroke V6', () => {
  assert.equal(firingFrequency(15000), 750);
  assert.equal(firingFrequency(4000), 200);
  assert.equal(firingFrequency(-100), 0);
  assert.equal(firingFrequency(6000, { ...SOUND_DEFAULTS, cylinders: 8 }), 400);
});

test('engine level and brightness rise with throttle and rpm; shifts and the limiter cut', () => {
  const m = createSoundModel(DEFAULT_CAR);
  const closed = m.update(0, pt(10000), { throttle: 0 }), open = m.update(0, pt(10000), { throttle: 1 });
  assert.ok(open.engineGain > 3 * closed.engineGain);
  assert.ok(open.cutoffHz > 2 * closed.cutoffHz);
  assert.equal(open.firingHz, 500);
  assert.ok(m.update(0, pt(14000), { throttle: 1 }).engineGain > open.engineGain);
  const shifting = m.update(0, pt(10000, { shifting: true }), { throttle: 1 });
  assert.ok(Math.abs(shifting.engineGain - open.engineGain * SOUND_DEFAULTS.shiftCut) < 1e-12);
  assert.equal(m.update(0, pt(14900, { limiter: true }), { throttle: 1 }).limiter, true);
  assert.equal(m.update(0, pt(14900, { limiter: true }), { throttle: 0 }).limiter, false);
  assert.ok(open.engineGain <= 1 && closed.engineGain > 0);
  const idle = m.update(0, { speed: 0, wheels: [] }, {}); // no powertrain yet: idle
  assert.equal(idle.rpm, DEFAULT_CAR.idleRpm);
});

test('turbo spool lags throttle exponentially, independent of frame rate', () => {
  const tau = SOUND_DEFAULTS.spoolTime;
  for (const dt of [1 / 30, 1 / 60, 1 / 240]) {
    const m = createSoundModel(DEFAULT_CAR);
    const n = Math.round(0.7 / dt); // 0.7 s = two time constants at every rate
    let p; for (let k = 0; k < n; k++) p = m.update(dt, pt(DEFAULT_CAR.maxRpm), { throttle: 1 });
    assert.ok(Math.abs(m.spool - (1 - Math.exp(-0.7 / tau))) < 1e-9, `dt ${dt}: ${m.spool}`);
    assert.ok(p.turboHz > SOUND_DEFAULTS.turboMinHz && p.turboGain > 0);
    for (let t = 0; t < 3; t += dt) m.update(dt, pt(DEFAULT_CAR.maxRpm), { throttle: 0 });
    assert.ok(m.spool < 1e-3);
  }
  const m = createSoundModel(DEFAULT_CAR);
  m.update(10, pt(DEFAULT_CAR.maxRpm), { throttle: 1 }); m.reset(); assert.equal(m.spool, 0);
});

test('tires squeal under locked braking but not rolling; wind grows with speed squared', () => {
  const m = createSoundModel(DEFAULT_CAR);
  const rolling = createCar(); rolling.vx = 50; rolling.wheelOmega.fill(50 / rolling.config.wheelRadius); rolling.gear = 8;
  run(rolling, 0.5, {});
  assert.equal(m.update(0, rolling.telemetry, {}).squealGain, 0);
  const locking = createCar(); locking.vx = 50; locking.wheelOmega.fill(50 / locking.config.wheelRadius); locking.gear = 8;
  run(locking, 0.3, { brake: 1 });
  assert.ok(locking.telemetry.wheels.some(w => w.locked));
  const squeal = m.update(0, locking.telemetry, {});
  assert.ok(squeal.squealGain > 0.5 * SOUND_DEFAULTS.squealGain, `${squeal.squealGain}`);
  assert.ok(squeal.squealGain <= SOUND_DEFAULTS.squealGain);
  const w = s => m.update(0, { speed: s, wheels: [] }, {}).windGain;
  assert.equal(w(0), 0);
  assert.ok(Math.abs(w(45) - SOUND_DEFAULTS.windGain / 4) < 1e-12);
  assert.equal(w(200), SOUND_DEFAULTS.windGain);
});

test('a full-throttle run produces rising firing frequency with drops at upshifts', () => {
  const car = createCar(), m = createSoundModel(car.config);
  const freqs = [];
  for (let i = 0; i < 8 / FIXED_DT; i++) { step(car, { throttle: 1 }, FIXED_DT); if (i % 24 === 0) freqs.push(m.update(0.1, car.telemetry, { throttle: 1 }).firingHz); }
  assert.ok(car.gear >= 5);
  assert.ok(freqs.every(f => f >= 200 && f <= 750 + 1e-9));
  const drops = freqs.slice(1).filter((f, i) => f < freqs[i] - 50).length;
  assert.ok(drops >= car.gear - 2, `${drops} drops for gear ${car.gear}`);
});

// Minimal Web Audio stand-in that records the graph and scheduled targets.
function fakeContext() {
  const param = v => ({ value: v, targets: [], setTargetAtTime(x, t, tau) { assert.ok(Number.isFinite(x) && tau > 0); this.targets.push(x); } });
  const node = extra => ({ connected: [], connect(n) { this.connected.push(n); return n; }, ...extra });
  const ctx = { sampleRate: 48000, currentTime: 0, destination: node(), started: 0, nodes: [] };
  const track = n => (ctx.nodes.push(n), n);
  ctx.createGain = () => track(node({ gain: param(1) }));
  ctx.createOscillator = () => track(node({ type: 'sine', frequency: param(440), start() { ctx.started++; } }));
  ctx.createBiquadFilter = () => track(node({ type: 'lowpass', frequency: param(350), Q: param(1) }));
  ctx.createBufferSource = () => track(node({ start() { ctx.started++; } }));
  ctx.createBuffer = (ch, len) => { const d = new Float32Array(len); return { getChannelData: () => d, data: d }; };
  return ctx;
}

test('audio graph builds, starts its sources and schedules finite parameters', () => {
  const ctx = fakeContext(), engine = createAudioEngine(ctx), m = createSoundModel(DEFAULT_CAR);
  assert.equal(ctx.started, 6); // 3 engine tones, limiter LFO, turbo, noise
  assert.ok(ctx.destination === engine.master.connected[0] || engine.master.connected.includes(ctx.destination));
  const noise = ctx.nodes.find(n => n.buffer).buffer.data;
  assert.ok(noise.every(x => x >= -1 && x <= 1) && Math.abs(noise.reduce((s, x) => s + x, 0) / noise.length) < 0.02);
  engine.apply(m.update(1 / 60, pt(14900, { limiter: true }), { throttle: 1 }), 0.8);
  assert.equal(engine.master.gain.targets.at(-1), 0.8);
  const filters = ctx.nodes.filter(n => n.Q);
  assert.ok(filters.every(f => f.frequency.targets.at(-1) < ctx.sampleRate / 2));
  engine.silence();
  assert.equal(engine.master.gain.targets.at(-1), 0);
});
