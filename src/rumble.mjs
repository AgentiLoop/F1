// Gamepad rumble: a pure model maps physics telemetry to dual-rumble motor levels
// (strong = low-frequency motor, weak = high-frequency motor, 0-1), testable in Node,
// and a small player sends them to the pads' vibrationActuator (as in ../bvs).
// Each source has its own feel (motor mix, shape and length), as ../bvs gives each
// event its own strength and duration: engine (a light weak-motor buzz with rpm),
// gear shifts (a short strong thump per shift), sliding tires (a weak-motor scrub
// with a flutter), kerbs (pulses at a rate set by speed), runoff (a faint hum),
// grass (a soft wallowing low rumble), gravel (a heavy, irregular rattle), wall
// impacts (a long heavy hit) and car-to-car contact (a sharp, short knock).
// All constants are illustrative.

export const RUMBLE_DEFAULTS = Object.freeze({
  engineIdle: 0.04,          // weak motor at idle
  engineFull: 0.2,           // weak motor at full throttle and max rpm
  shiftStrong: 0.35, shiftWeak: 0.1,
  shiftDecay: 0.06,          // s, shift thump time constant
  slipThreshold: 15000,      // W of total sliding power before it is felt (as the squeal)
  slipFull: 150000,          // W at full friction rumble
  slipStrong: 0.35, slipWeak: 0.7,
  slipFlutter: 9,            // Hz, tire scrub flutter
  roughSpeed: 30,            // m/s at which rough ground is felt fully
  kerbStrong: 0.75, kerbWeak: 0.35,
  kerbStripe: 2,             // m per kerb pulse...
  kerbMaxRate: 14,           // ...capped at this many pulses per second
  runoffWeak: 0.15,
  grassStrong: 0.6, grassWeak: 0.15,
  grassWobble: 3,            // Hz
  gravelStrong: 0.85, gravelWeak: 0.6,
  crashSpeed: 15,            // m/s closing speed for a full-strength crash
  crashMin: 0.5,             // m/s closing speeds below this are ignored
  wallDecay: 0.35,           // s, wall impact time constant (strong-heavy)
  contactDecay: 0.12,        // s, car contact time constant (weak-heavy)
});

const clamp01 = v => Math.min(1, Math.max(0, v));

// Ground under a wheel from its surface grip (track.mjs SURFACE_GRIP) and rolling drag.
const groundOf = w => (w?.rolling ?? 0) > 0 ? 'gravel' : (w?.grip ?? 1) >= 1 ? null
  : w.grip >= 0.85 ? 'kerb' : w.grip >= 0.6 ? 'runoff' : 'grass';

// car: the car config (idleRpm, maxRpm). update(dt, carState, command) takes the
// physics car (telemetry, impact, contact) and returns { strong, weak }.
export function createRumbleModel(car, cfg = RUMBLE_DEFAULTS) {
  let wall = 0, knock = 0, shift = 0, wasShifting = false, time = 0, kerbPhase = 0, seed = 1;
  let lastImpact = null, lastContact = null;
  const level = e => clamp01((e.speed - cfg.crashMin) / (cfg.crashSpeed - cfg.crashMin));
  const noise = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return {
    reset() { wall = knock = shift = time = kerbPhase = 0; wasShifting = false; lastImpact = lastContact = null; },
    update(dt, state, command) {
      dt = Math.max(0, dt); time += dt;
      const t = state?.telemetry, pt = t?.powertrain, throttle = clamp01(command?.throttle ?? 0);
      const speed = Math.abs(t?.speed ?? 0), atSpeed = clamp01(speed / cfg.roughSpeed);
      // Crashes: a wall impact is a long heavy hit, car contact a short sharp knock.
      wall *= Math.exp(-dt / cfg.wallDecay); knock *= Math.exp(-dt / cfg.contactDecay);
      if (state?.impact && state.impact !== lastImpact) { lastImpact = state.impact; wall = Math.max(wall, level(state.impact)); }
      if (state?.contact && state.contact !== lastContact) { lastContact = state.contact; knock = Math.max(knock, level(state.contact)); }
      // Engine: a light buzz on the weak motor; each new shift is one short thump.
      const rpm = pt?.rpm ?? 0, rpmFrac = clamp01((rpm - car.idleRpm) / (car.maxRpm - car.idleRpm));
      const engineWeak = pt ? cfg.engineIdle + (cfg.engineFull - cfg.engineIdle) * rpmFrac * (0.3 + 0.7 * throttle) : 0;
      shift *= Math.exp(-dt / cfg.shiftDecay);
      if (pt?.shifting && !wasShifting) shift = 1;
      wasShifting = !!pt?.shifting;
      // Sliding tires: a weak-motor scrub that flutters.
      const wheels = t?.wheels ?? [];
      const slip = clamp01((wheels.reduce((s, w) => s + (w?.slipPower ?? 0), 0) - cfg.slipThreshold) / (cfg.slipFull - cfg.slipThreshold));
      const flutter = 0.75 + 0.25 * Math.sin(2 * Math.PI * cfg.slipFlutter * time);
      // Ground: the share of wheels on each rough surface, felt with speed.
      const share = { kerb: 0, runoff: 0, grass: 0, gravel: 0 };
      for (const w of wheels) { const g = groundOf(w); if (g) share[g] += 1 / wheels.length; }
      kerbPhase = (kerbPhase + dt * Math.min(cfg.kerbMaxRate, speed / cfg.kerbStripe)) % 1;
      const kerb = share.kerb * atSpeed * (kerbPhase < 0.5 ? 1 : 0.15);
      const grass = share.grass * atSpeed * (0.85 + 0.15 * Math.sin(2 * Math.PI * cfg.grassWobble * time));
      const gravel = share.gravel * atSpeed, rattle = 0.6 + 0.4 * noise();
      return {
        strong: clamp01(Math.max(shift * cfg.shiftStrong, slip * cfg.slipStrong * flutter, kerb * cfg.kerbStrong,
          grass * cfg.grassStrong, gravel * cfg.gravelStrong * rattle, wall, 0.5 * knock)),
        weak: clamp01(Math.max(engineWeak, shift * cfg.shiftWeak, slip * cfg.slipWeak * flutter, kerb * cfg.kerbWeak,
          share.runoff * atSpeed * cfg.runoffWeak, grass * cfg.grassWeak, gravel * cfg.gravelWeak * (1.4 - rattle), 0.6 * wall, knock)),
      };
    },
  };
}

// Sends levels to every pad with a dual-rumble actuator. Effects are short and
// re-sent while they last (or when the level changes), so a stop is quick.
export function createRumblePlayer({ interval = 80, duration = 150 } = {}) {
  let last = -Infinity, sent = { strong: 0, weak: 0 };
  return {
    play(pads, { strong, weak }, now) {
      const off = strong < 0.02 && weak < 0.02, wasOff = sent.strong < 0.02 && sent.weak < 0.02;
      if (off && wasOff) return;
      const changed = Math.abs(strong - sent.strong) > 0.1 || Math.abs(weak - sent.weak) > 0.1;
      if (!changed && now - last < interval) return;
      for (const p of pads) {
        const a = p?.vibrationActuator;
        if (!a) continue;
        if (off) a.reset?.()?.catch?.(() => {});
        else a.playEffect?.('dual-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
      }
      last = now; sent = off ? { strong: 0, weak: 0 } : { strong, weak };
    },
  };
}
