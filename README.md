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
  rear-wheel drive, power/torque-limited propulsion, and front/rear brake bias.
- Four independent wheel angular velocities and inertias. Drive/brake torques
  act on wheels; longitudinal slip generates contact force on the chassis.
- Saturating lateral force from slip angle, load-sensitive grip, and a combined
  longitudinal/lateral friction-circle limit.
- Speed-squared aerodynamic load; drag integrated dissipatively after contact
  impulses to avoid reversing a nearly stopped car under braking.
- Quasi-static longitudinal/lateral normal-load transfer with filtered
  acceleration, nonnegative wheel loads, and conserved total normal load.
- Rolling-resistance torque and low-speed contact regularization.
- Live speed, acceleration, steering, distance, normal loads, downforce,
  per-wheel combined-force utilization, signed slip, RPM, and lockup indicators.

### Wheel/contact integration

Wheel order is FL, FR, RL, RR. `wheelOmega` is persistent state in rad/s, initially
zero. When initializing a moving car, initialize its wheel speeds too (straight
free rolling: omega = vx / wheelRadius); changing chassis velocity alone means
initially sliding, stationary wheels.

The implemented wheel balance is I * delta(omega) / dt = drive torque minus
r * Fx minus resistance torque. Brake and rolling resistance oppose rotation,
bounded so they stop a wheel rather than push its angular velocity through zero.
Brakes can hold a stationary wheel against drive/contact torque. Rear drive uses
equal torque, capped using rear angular speeds and an acceleration margin;
this is not a differential or engine/transmission model.

Longitudinal demand uses linear slip stiffness with an implicit wheel/body
response, then shares the radial friction-circle limit with lateral force.
A conservative diagonal body response (4/m + 4*(x²+y²)/Iz) damps contact coupling;
this is a numerical approximation, not an exact coupled tire solver.
Slip telemetry uses (r*omega - contact forward speed) / max(abs(forward speed),
1 m/s), evaluated after integration. Positive means wheelspin in forward travel;
a forward locked wheel above 1 m/s reads -100%. Reverse travel reverses this
sign interpretation. The low-speed denominator is regularization, not tire data.

Defaults introduced here: radius 0.33 m, wheel inertia 1.6 kg m², longitudinal
stiffness 100000 N per unit slip. **All are illustrative, not measured F1 data.**
There is no peak-to-sliding grip falloff, tire relaxation, thermal/wear state,
ABS, or traction control. A locked tire still uses the simplified radial force
limit, so lockup does not yet reproduce a calibrated loss of braking/cornering
performance. Quasi-static transfer does not model suspension or body roll/pitch.

## Verification

Twenty deterministic tests cover the original rest, symmetry, aero/load/force,
stopping-distance, render-rate, hitch and 120-second stress checks, plus:

- Lossless free rolling, rear wheelspin, zero-grip wheel acceleration.
- Brake lockup/release, stationary brake hold against throttle.
- Forward/reverse stopping down to rest at 60/240/960 Hz integration.
- Wheel torque balance and isolated-wheel power/energy limits.
- Total chassis plus wheel energy dissipation, including 5000 seeded arbitrary
  chassis/wheel states (regression evidence, not a proof).
- Straight-line timestep convergence, with 240-to-960 Hz speed and distance
  differences below 1% in the tested five-second half-throttle scenario.

Cycle 2 reran headless Chrome against the actual page: keyboard acceleration,
steering, pause, overview, reset, focus-loss release, and a 700 x 700 viewport.
An additional browser check verified visible slip/RPM, wheelspin, LOCK/zero RPM,
brake-release recovery, and clearing all four wheel displays on paused reset.
Both passed without JavaScript page errors. Temporary harnesses and screenshots
are under `/tmp/f1-*`; they are not repository tests. Numerical regression checks
establish internal consistency, not real-car accuracy.

## Next realism milestones

1. Calibrated combined-slip curves with peak/sliding behavior, tire relaxation,
   thermal/wear state, and measured brake/tire parameters.
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
