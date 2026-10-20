// Procedural car sound: a pure sound model maps physics telemetry to synth
// parameters (testable in Node), and a small Web Audio graph renders them.
// Everything is synthesized; no samples. All constants are illustrative.

export const SOUND_DEFAULTS = Object.freeze({
  cylinders: 6,              // four-stroke V6: firing frequency = rpm / 60 * cylinders / 2
  idleGain: 0.22,            // engine level on a closed throttle (overrun)
  brightnessBase: 2.5,       // low-pass cutoff in multiples of firing frequency...
  brightnessThrottle: 5.5,   // ...rising with throttle (open exhaust, more harmonics)
  spoolTime: 0.35,           // s, turbo spool / decay time constant
  turboMinHz: 1800, turboMaxHz: 7500, turboGain: 0.05,
  squealThreshold: 15000,    // W of total contact sliding power before tires are heard
  squealFull: 150000,        // W at full squeal level
  squealGain: 0.35, squealBaseHz: 950,
  windSpeed: 90,             // m/s at full wind level (quadratic in speed)
  windGain: 0.3,
  shiftCut: 0.35,            // engine level multiplier during an ignition-cut shift
  limiterHz: 22,             // fuel-cut flutter rate at the rev limiter
});

const clamp01 = v => Math.min(1, Math.max(0, v));

// Firing (fundamental) frequency in Hz for an engine speed in rpm.
export const firingFrequency = (rpm, cfg = SOUND_DEFAULTS) => Math.max(0, rpm) / 60 * cfg.cylinders / 2;

// Stateful only for turbo spool, which lags throttle × rpm with an exponential
// time constant (exact for any dt, so frame rate does not change the result).
export function createSoundModel(car, cfg = SOUND_DEFAULTS) {
  let spool = 0;
  return {
    get spool() { return spool; },
    reset() { spool = 0; },
    update(dt, telemetry, command) {
      const pt = telemetry?.powertrain, throttle = clamp01(command?.throttle ?? 0);
      const rpm = pt?.rpm ?? car.idleRpm, rpmFrac = clamp01((rpm - car.idleRpm) / (car.maxRpm - car.idleRpm));
      const cut = pt?.shifting ? cfg.shiftCut : 1;
      spool += (throttle * rpmFrac * cut - spool) * (1 - Math.exp(-Math.max(0, dt) / cfg.spoolTime));
      const f = firingFrequency(rpm, cfg);
      const slipPower = (telemetry?.wheels ?? []).reduce((s, w) => s + (w?.slipPower ?? 0), 0);
      const squeal = clamp01((slipPower - cfg.squealThreshold) / (cfg.squealFull - cfg.squealThreshold));
      const speed = telemetry?.speed ?? 0, wind = clamp01((speed / cfg.windSpeed) ** 2);
      return {
        rpm, firingHz: f,
        engineGain: (cfg.idleGain + (1 - cfg.idleGain) * throttle) * (0.6 + 0.4 * rpmFrac) * cut,
        cutoffHz: f * (cfg.brightnessBase + cfg.brightnessThrottle * throttle),
        limiter: Boolean(pt?.limiter) && throttle > 0,
        turboHz: cfg.turboMinHz + (cfg.turboMaxHz - cfg.turboMinHz) * spool,
        turboGain: cfg.turboGain * spool,
        squealGain: cfg.squealGain * squeal,
        squealHz: cfg.squealBaseHz * (1 + 0.25 * squeal),
        windGain: cfg.windGain * wind,
        windCutoffHz: 300 + 2700 * wind,
      };
    },
  };
}

// Web Audio renderer. ctx: an AudioContext (or compatible). apply() glides
// each parameter toward the model output to avoid zipper noise.
export function createAudioEngine(ctx, cfg = SOUND_DEFAULTS) {
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
  const osc = (type, to) => { const o = ctx.createOscillator(); o.type = type; o.connect(to); o.start(); return o; };
  // Engine: firing order sawtooth, half-order rumble and a second harmonic, low-passed.
  const engineOut = gain(0, master), limiterGate = gain(1, engineOut);
  const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.Q.value = 3; lowpass.connect(limiterGate);
  const tones = [['sawtooth', 1, 0.5], ['triangle', 0.5, 0.45], ['square', 2, 0.12]]
    .map(([type, order, level]) => ({ order, o: osc(type, gain(level, lowpass)) }));
  // Rev-limiter flutter: a square LFO modulating the gate, depth 0 until limiting.
  const lfoDepth = gain(0, limiterGate.gain), lfo = osc('square', lfoDepth); lfo.frequency.value = cfg.limiterHz;
  const turboGain = gain(0, master), turbo = osc('sine', turboGain);
  // Shared looping white noise for tire squeal (band-pass) and wind (low-pass).
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = noise.getChannelData(0);
  let seed = 1; for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
  const source = ctx.createBufferSource(); source.buffer = noise; source.loop = true;
  const squealGain = gain(0, master), band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 9; band.connect(squealGain);
  const windGain = gain(0, master), windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.connect(windGain);
  source.connect(band); source.connect(windFilter); source.start();
  const glide = (param, value, tau = 0.03) => param.setTargetAtTime(value, ctx.currentTime, tau);
  return {
    master,
    apply(p, volume = 1) {
      glide(master.gain, volume, 0.05);
      for (const t of tones) glide(t.o.frequency, p.firingHz * t.order, 0.015);
      glide(lowpass.frequency, Math.min(p.cutoffHz, ctx.sampleRate / 2 - 100));
      glide(engineOut.gain, p.engineGain);
      // Gate = base ± depth: 1 normally, chopped between 0 and 1 on the limiter.
      glide(limiterGate.gain, p.limiter ? 0.5 : 1, 0.01); glide(lfoDepth.gain, p.limiter ? 0.5 : 0, 0.01);
      glide(turbo.frequency, p.turboHz, 0.05); glide(turboGain.gain, p.turboGain, 0.05);
      glide(band.frequency, p.squealHz); glide(squealGain.gain, p.squealGain, 0.05);
      glide(windFilter.frequency, p.windCutoffHz, 0.1); glide(windGain.gain, p.windGain, 0.1);
    },
    silence() { glide(master.gain, 0, 0.05); },
  };
}
