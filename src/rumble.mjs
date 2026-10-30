// Gamepad rumble: a pure model maps physics telemetry to dual-rumble motor levels
// (strong = low-frequency motor, weak = high-frequency motor, 0-1) plus impulse
// trigger levels (left = brake, right = throttle), testable in Node, and a small
// player sends them to the pads' vibrationActuator (as in ../bvs).
// Each source has its own feel (motor, rhythm and length) and the layers are
// mixed (1 - Π(1 - x)) rather than the loudest one masking the rest:
// engine (a weak-motor throb whose beat rises with rpm, a lumpy strong-motor shake
// at idle, a hard chop on the limiter), gear shifts (a short strong thump per
// shift), wheelspin (a right-trigger buzz), brake lockup (a left-trigger and
// strong-motor judder), sliding tires (a weak-motor scrub with a flutter), road
// texture (a faint weak-motor grain with speed), dirty air (a slow strong-motor
// buffet), kerbs (pulses at a rate set by speed), runoff (a faint hum), grass (a
// soft wallowing low rumble), gravel (a heavy, irregular rattle), wall impacts (a
// long heavy hit that shakes as it fades, felt in both triggers) and car-to-car
// contact (a sharp, short knock). Any of these events ducks the always-on engine
// and road bed so it stands out instead of blurring into one constant buzz; kerbs
// alternate motors stripe by stripe and a wall hit slams once, then shakes. All
// constants are illustrative.

export const RUMBLE_DEFAULTS = Object.freeze({
  engineIdle: 0.1,           // weak motor at idle
  engineFull: 0.3,           // weak motor at full throttle and max rpm
  engineBeatIdle: 5,         // Hz, engine throb at idle...
  engineBeatMax: 14,         // ...and at max rpm
  idleShake: 0.18,           // strong motor, standing at idle
  limiterStrong: 0.45, limiterRate: 11, // Hz, fuel-cut chop
  engineTrigger: 0.12,       // right trigger at full throttle and max rpm
  duck: 0.8,                 // share of the engine/road bed removed during an event
  duckRelease: 0.25,         // s, how long the bed takes to come back after one
  shiftStrong: 0.35, shiftWeak: 0.1,
  shiftDecay: 0.06,          // s, shift thump time constant
  spinSlip: 0.12,            // slip ratio where wheelspin / lockup starts...
  spinFull: 0.5,             // ...and where it is felt fully
  spinTrigger: 0.8, spinWeak: 0.3,
  lockTrigger: 0.9, lockStrong: 0.45, lockRate: 16, // Hz, lockup judder
  slipThreshold: 15000,      // W of total sliding power before it is felt (as the squeal)
  slipFull: 150000,          // W at full friction rumble
  slipStrong: 0.3, slipWeak: 0.6,
  slipFlutter: 9,            // Hz, tire scrub flutter
  roadWeak: 0.07,            // weak-motor grain at roughSpeed
  wakeStrong: 0.3, wakeRate: 4, // Hz, dirty air buffet
  roughSpeed: 30,            // m/s at which rough ground is felt fully
  kerbStrong: 0.75, kerbWeak: 0.6, kerbOther: 0.3, // other motor's share on each stripe
  kerbStripe: 2,             // m per kerb pulse...
  kerbMaxRate: 14,           // ...capped at this many pulses per second
  runoffWeak: 0.15,
  grassStrong: 0.6, grassWeak: 0.15,
  grassWobble: 3,            // Hz
  gravelStrong: 0.85, gravelWeak: 0.6,
  crashSpeed: 15,            // m/s closing speed for a full-strength crash
  crashMin: 0.5,             // m/s closing speeds below this are ignored
  wallDecay: 0.35,           // s, wall impact time constant (strong-heavy)
  wallSlam: 0.08,            // s of solid strong motor before the hit starts to shake
  wallTrigger: 1,            // both triggers at a full-strength wall impact
  contactDecay: 0.12,        // s, car contact time constant (weak-heavy)
});

const clamp01 = v => Math.min(1, Math.max(0, v));
// Layers add up without exceeding 1, so a quiet one still shows through a loud one.
const mix = (...xs) => 1 - xs.reduce((p, x) => p * (1 - clamp01(x)), 1);
// 0/1 square wave at the given phase (cycles).
const square = (phase, duty = 0.5) => (phase % 1) < duty ? 1 : 0;

// Ground under a wheel from its surface grip (track.mjs SURFACE_GRIP) and rolling drag.
const groundOf = w => (w?.rolling ?? 0) > 0 ? 'gravel' : (w?.grip ?? 1) >= 1 ? null
  : w.grip >= 0.85 ? 'kerb' : w.grip >= 0.6 ? 'runoff' : 'grass';

// car: the car config (idleRpm, maxRpm, limiterBand). update(dt, carState, command)
// takes the physics car (telemetry, impact, contact, wake) and returns
// { strong, weak, left, right }.
export function createRumbleModel(car, cfg = RUMBLE_DEFAULTS) {
  let wall = 0, knock = 0, shift = 0, wasShifting = false, time = 0, kerbPhase = 0, kerbFlip = false, beatPhase = 0, seed = 1, wallAge = Infinity, duckEnv = 0;
  let lastImpact = null, lastContact = null;
  const level = e => clamp01((e.speed - cfg.crashMin) / (cfg.crashSpeed - cfg.crashMin));
  const noise = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return {
    reset() { wall = knock = shift = time = kerbPhase = beatPhase = duckEnv = 0; wallAge = Infinity; wasShifting = kerbFlip = false; lastImpact = lastContact = null; },
    update(dt, state, command) {
      dt = Math.max(0, dt); time += dt;
      const t = state?.telemetry, pt = t?.powertrain, throttle = clamp01(command?.throttle ?? 0), brake = clamp01(command?.brake ?? 0);
      const speed = Math.abs(t?.speed ?? 0), atSpeed = clamp01(speed / cfg.roughSpeed);
      // Crashes: a wall impact is a long heavy hit, car contact a short sharp knock.
      wall *= Math.exp(-dt / cfg.wallDecay); wallAge += dt; knock *= Math.exp(-dt / cfg.contactDecay);
      if (state?.impact && state.impact !== lastImpact) { lastImpact = state.impact; wall = Math.max(wall, level(state.impact)); wallAge = 0; }
      if (state?.contact && state.contact !== lastContact) { lastContact = state.contact; knock = Math.max(knock, level(state.contact)); }
      const shake = 0.5 + 0.5 * noise();
      // Engine: a throb on the weak motor whose beat rises with rpm, a lumpy
      // strong-motor shake standing at idle, a chop on the limiter, one thump per shift.
      const rpm = pt?.rpm ?? 0, rpmFrac = clamp01((rpm - car.idleRpm) / (car.maxRpm - car.idleRpm));
      beatPhase = (beatPhase + dt * (cfg.engineBeatIdle + (cfg.engineBeatMax - cfg.engineBeatIdle) * rpmFrac)) % 1;
      const throb = 0.35 + 0.65 * square(beatPhase, 0.4);
      const engineWeak = pt ? (cfg.engineIdle + (cfg.engineFull - cfg.engineIdle) * rpmFrac * (0.3 + 0.7 * throttle)) * throb : 0;
      const idle = pt ? cfg.idleShake * (1 - rpmFrac) * (1 - atSpeed) * (0.4 + 0.6 * square(beatPhase, 0.3)) : 0;
      const onLimiter = pt && rpm > car.maxRpm - (car.limiterBand ?? 250) && throttle > 0.5;
      const limiter = onLimiter ? cfg.limiterStrong * square(time * cfg.limiterRate) : 0;
      shift *= Math.exp(-dt / cfg.shiftDecay);
      if (pt?.shifting && !wasShifting) shift = 1;
      wasShifting = !!pt?.shifting;
      // Tires: wheelspin buzzes the throttle trigger, lockup judders the brake trigger,
      // sliding scrubs the weak motor with a flutter.
      const wheels = t?.wheels ?? [];
      let spin = 0, lock = 0;
      for (const w of wheels) {
        const s = w?.slipRatio ?? 0, over = clamp01((Math.abs(s) - cfg.spinSlip) / (cfg.spinFull - cfg.spinSlip));
        if (s > 0 && throttle > 0.05) spin = Math.max(spin, over);
        if (s < 0 && brake > 0.05 && speed > 2) lock = Math.max(lock, over);
      }
      const judder = 0.5 + 0.5 * square(time * cfg.lockRate);
      const slip = clamp01((wheels.reduce((s, w) => s + (w?.slipPower ?? 0), 0) - cfg.slipThreshold) / (cfg.slipFull - cfg.slipThreshold));
      const flutter = 0.75 + 0.25 * Math.sin(2 * Math.PI * cfg.slipFlutter * time);
      // Road grain with speed and a slow buffet in another car's dirty air.
      const road = cfg.roadWeak * atSpeed * (0.5 + 0.5 * noise());
      const buffet = cfg.wakeStrong * clamp01(state?.wake?.strength ?? 0) * atSpeed * (0.5 + 0.5 * Math.sin(2 * Math.PI * cfg.wakeRate * time + 2 * Math.sin(1.7 * time)));
      // Ground: the share of wheels on each rough surface, felt with speed.
      const share = { kerb: 0, runoff: 0, grass: 0, gravel: 0 };
      for (const w of wheels) { const g = groundOf(w); if (g) share[g] += 1 / wheels.length; }
      kerbPhase += dt * Math.min(cfg.kerbMaxRate, speed / cfg.kerbStripe);
      if (kerbPhase >= 1) { kerbPhase %= 1; kerbFlip = !kerbFlip; }
      const kerb = share.kerb * atSpeed * (kerbPhase < 0.5 ? 1 : 0.15);
      const grass = share.grass * atSpeed * (0.85 + 0.15 * Math.sin(2 * Math.PI * cfg.grassWobble * time));
      const gravel = share.gravel * atSpeed, rattle = 0.6 + 0.4 * noise();
      // Events duck the engine and road bed; a wall hit slams solid, then shakes.
      duckEnv = Math.max(clamp01(Math.max(shift, onLimiter ? 1 : 0, spin, lock, slip, kerb, grass, gravel, wall, knock)), duckEnv * Math.exp(-dt / cfg.duckRelease));
      const bed = 1 - cfg.duck * duckEnv;
      const slam = wall * (wallAge < cfg.wallSlam ? 1 : 0.6 + 0.4 * shake);
      return {
        strong: mix(idle * bed, limiter, shift * cfg.shiftStrong, lock * cfg.lockStrong * judder, slip * cfg.slipStrong * flutter, buffet,
          kerb * cfg.kerbStrong * (kerbFlip ? cfg.kerbOther : 1), grass * cfg.grassStrong, gravel * cfg.gravelStrong * rattle, slam, 0.5 * knock),
        weak: mix(engineWeak * bed, shift * cfg.shiftWeak, spin * cfg.spinWeak * flutter, slip * cfg.slipWeak * flutter, road * bed, kerb * cfg.kerbWeak * (kerbFlip ? 1 : cfg.kerbOther),
          share.runoff * atSpeed * cfg.runoffWeak, grass * cfg.grassWeak, gravel * cfg.gravelWeak * (1.4 - rattle), 0.6 * wall * (1.5 - shake), knock),
        left: mix(lock * cfg.lockTrigger * judder, wall * cfg.wallTrigger * shake, 0.5 * knock),
        right: mix(pt ? cfg.engineTrigger * rpmFrac * throttle * throb * bed : 0, spin * cfg.spinTrigger * flutter, wall * cfg.wallTrigger * shake, 0.5 * knock),
      };
    },
  };
}

// Sends levels to every pad: 'trigger-rumble' (motors plus impulse triggers) where
// the pad has it, 'dual-rumble' otherwise, with the trigger effects (lockup,
// wheelspin, crash) folded into the motors so they are not lost. Single-motor pads
// (the Atari joysticks) get both motors mixed onto each magnitude, so whichever
// motor they drive feels everything; the rhythms keep the sources apart. Effects are short and re-sent while they
// last (or when a level changes), so rhythms come through and a stop is quick.
export const SINGLE_MOTOR_PAD = /atari|3250/i; // Gamepad.id: name or USB vendor 0x3250

export function createRumblePlayer({ interval = 50, duration = 100, threshold = 0.04, triggerFold = 0.6 } = {}) {
  let last = -Infinity, sent = { strong: 0, weak: 0, left: 0, right: 0 };
  return {
    play(pads, { strong = 0, weak = 0, left = 0, right = 0 }, now) {
      const levels = { strong, weak, left, right }, keys = Object.keys(levels);
      const off = keys.every(k => levels[k] < 0.02), wasOff = keys.every(k => sent[k] < 0.02);
      if (off && wasOff) return;
      const changed = keys.some(k => Math.abs(levels[k] - sent[k]) > threshold);
      if (!changed && now - last < interval) return;
      for (const p of pads) {
        const a = p?.vibrationActuator;
        if (!a) continue;
        if (off) a.reset?.()?.catch?.(() => {});
        else if (a.effects?.includes?.('trigger-rumble'))
          a.playEffect?.('trigger-rumble', { duration, strongMagnitude: strong, weakMagnitude: weak, leftTrigger: left, rightTrigger: right })?.catch?.(() => {});
        else {
          let s = mix(strong, triggerFold * left), w = mix(weak, triggerFold * right);
          if (SINGLE_MOTOR_PAD.test(p.id ?? '')) s = w = mix(s, w);
          a.playEffect?.('dual-rumble', { duration, strongMagnitude: s, weakMagnitude: w })?.catch?.(() => {});
        }
      }
      last = now; sent = off ? { strong: 0, weak: 0, left: 0, right: 0 } : levels;
    },
  };
}

