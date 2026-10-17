# F1 Dynamics Lab

A dependency-free, playable browser testbed for an open-wheel vehicle model.
**Prototype, not a validated Formula 1 simulator.** All vehicle parameters are
illustrative assumptions, not measured F1 data or a season's regulations.

## Run

From this directory, run `python3 -m http.server 5188 --bind 127.0.0.1`, then open
`http://127.0.0.1:5188`. ES modules require HTTP; do not open the HTML as a file.
The application has no runtime downloads, npm dependencies, or bundler.

Run validation with `node --check physics.mjs && node --test physics.test.mjs`.
Node's built-in test runner is the only test dependency.

## Controls

- W / Up: throttle; S / Down: brake.
- A / Left and D / Right: steering. Keyboard steering has a speed-based scaling
  assist; steering angle also has a rate limit.
- Space: pause/resume; R: reset; V: overview/chase view.
- Buttons provide the same pause/reset/view actions. Driving keys are ignored
  while a button has focus; click the circuit to return focus to driving.
- Losing window focus or hiding the tab pauses and releases held inputs.

The stadium test circuit is fictional and flat. Asphalt and off-track grip are
sampled separately at each wheel. The surrounding area is open: there are no
walls, collisions, lap timing, or reset penalties. Use Reset if stranded.

## Implemented model

`physics.mjs` is independent of the browser. SI units throughout; world and body
coordinates are right-handed, with body x forward, y left, and positive yaw left.

- Fixed 240 Hz stepping, independent of rendering. Frames longer than 250 ms
  discard excess time rather than attempting unbounded catch-up.
- Planar translation and yaw inertia, four contact points, front steering,
  rear-wheel drive, power/force-limited propulsion, and front/rear brake bias.
- Saturating lateral force from slip angle, load-sensitive grip, and a combined
  longitudinal/lateral friction-circle limit.
- Speed-squared aerodynamic load; drag integrated dissipatively after contact
  impulses to avoid reversing a nearly stopped car under braking.
- Quasi-static longitudinal/lateral normal-load transfer with filtered
  acceleration, nonnegative wheel loads, and conserved total normal load.
- Rolling resistance and low-speed force regularization.
- Live speed, acceleration, steering, distance, normal loads, downforce, and
  per-wheel combined-force utilization.

These are deliberate simplifications, not a tire manufacturer's model. In
particular, braking is force-commanded: **there are no wheel angular velocities,
longitudinal slip ratios, locking, wheelspin, ABS, or traction control**. Combined
forces are radially limited rather than derived from measured combined-slip
curves. Quasi-static transfer does not model roll/pitch motion or suspension.

## Verification

Eleven deterministic tests cover rest stability, straight-line symmetry and
power limiting, aero scaling, load conservation/transfer, tire-force limits,
nonreversing braking and grip-dependent stopping distance, mirrored steering,
coast energy dissipation, render-rate independence, bounded hitches, and a
120-second mixed-input numerical stress run.

Cycle 1 also ran headless Chrome against the actual page, checking keyboard
acceleration/steering, pause, overview, reset, focus-loss input release, and a
700 x 700 viewport without JavaScript page errors. The temporary browser harness
and screenshots were written under `/tmp/f1-*`; they are not repository tests.
Numerical regression checks establish internal consistency, not real-car accuracy.

## Next realism milestones

1. Wheel rotational dynamics, longitudinal slip, calibrated combined-slip tire
   data, tire thermal/wear state, and physically meaningful brake/drive torque.
2. Suspension travel, roll/pitch/heave, road elevation, and aero platform effects.
3. Engine/transmission, differential, hybrid energy, fuel mass, and setup controls.
4. Measured validation targets for acceleration, braking, steady-state cornering,
   and transient handling before making realism claims.
5. 3D cockpit/track rendering, sound, gamepad/wheel input and force feedback,
   collisions, circuit geometry, timing, opponents, and race rules.

## Repository / parity

This repository was initialized from an empty project directory in cycle 1.
No parity directory was supplied in the task or declared in the local tab
registry. Only the primary directory was changed; no mirror path was invented.
`.agent/` contains local agent state and is excluded from version control.
