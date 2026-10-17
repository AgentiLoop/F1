// Driver input: rate-limited keyboard ramps and analog gamepad (W3C "standard"
// mapping) merged into one { throttle, brake, steer } command for physics.mjs.
// All rates are illustrative, in full-travel units per second.

export const INPUT_DEFAULTS = Object.freeze({
  throttleRise: 6, throttleFall: 10, // keyboard pedal ramps (0 -> 1 in ~0.17 s)
  brakeRise: 6, brakeFall: 10,
  steerRate: 3, steerReturn: 5,      // keyboard steering: toward lock / back toward centre
  deadzone: 0.08,                    // stick and trigger deadzone (fraction of travel)
  steerExponent: 1.5,                // stick response curve: finer control near centre
  steerSpeedScale: 22,               // m/s; steer authority 1 / (1 + (u / scale)^2)
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Deadzone with the remaining travel rescaled to 0..1, then a power curve.
export function shapeAxis(value, deadzone, exponent = 1) {
  const a = Math.abs(value || 0);
  if (a <= deadzone) return 0;
  return Math.sign(value) * Math.min(1, (a - deadzone) / (1 - deadzone)) ** exponent;
}

// Standard mapping: left stick x = axes[0] (+ is right), RT = buttons[7], LT = buttons[6].
export function readGamepad(pad, cfg = INPUT_DEFAULTS) {
  if (!pad || !pad.connected || pad.mapping !== 'standard') return null;
  const trigger = b => shapeAxis(clamp(b?.value ?? (b?.pressed ? 1 : 0), 0, 1), cfg.deadzone);
  return {
    throttle: trigger(pad.buttons[7]), brake: trigger(pad.buttons[6]),
    steer: -shapeAxis(clamp(pad.axes[0] ?? 0, -1, 1), cfg.deadzone, cfg.steerExponent), // + is left in physics
  };
}

// Move value toward target, at most rate * dt (exact for any step size).
function ramp(value, target, up, down, dt) {
  return target > value ? Math.min(target, value + up * dt) : Math.max(target, value - down * dt);
}

export function createDriverInput(cfg = INPUT_DEFAULTS) {
  const key = { throttle: 0, brake: 0, steer: 0 };
  let source = 'keyboard';
  return {
    get keyboard() { return { ...key }; },
    get source() { return source; },
    reset() { key.throttle = key.brake = key.steer = 0; },
    // keys: { throttle, brake, left, right } booleans; pad: readGamepad() result or null.
    update(dt, keys, pad, speed = 0) {
      key.throttle = ramp(key.throttle, keys.throttle ? 1 : 0, cfg.throttleRise, cfg.throttleFall, dt);
      key.brake = ramp(key.brake, keys.brake ? 1 : 0, cfg.brakeRise, cfg.brakeFall, dt);
      const target = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
      // Steering back toward centre uses the faster return rate; the rest of the
      // step after crossing centre ramps toward the opposite lock at steerRate.
      if (key.steer !== 0 && target * key.steer <= 0) {
        const toCentre = Math.abs(key.steer) / cfg.steerReturn;
        key.steer = dt < toCentre ? key.steer - Math.sign(key.steer) * cfg.steerReturn * dt
          : target * Math.min(1, (dt - toCentre) * cfg.steerRate);
      } else key.steer = ramp(key.steer, target, cfg.steerRate, cfg.steerRate, dt);
      const padActive = pad && (pad.throttle > 0 || pad.brake > 0 || pad.steer !== 0);
      const keysActive = keys.throttle || keys.brake || keys.left || keys.right;
      if (keysActive) source = 'keyboard'; else if (padActive) source = 'gamepad';
      const steer = key.steer !== 0 ? key.steer : pad?.steer ?? 0;
      return {
        throttle: Math.max(key.throttle, pad?.throttle ?? 0),
        brake: Math.max(key.brake, pad?.brake ?? 0),
        steer: steer / (1 + (speed / cfg.steerSpeedScale) ** 2),
      };
    },
  };
}
