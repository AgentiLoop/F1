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
- Load-sensitive grip with a combined longitudinal/lateral demand envelope that
  rises to a peak and falls smoothly to a lower sliding force (see below).
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
There is no thermal/wear state, ABS, or traction control (lateral relaxation was added in cycle 4; longitudinal slip has no relaxation).
Quasi-static transfer does not model suspension or body roll/pitch.

### Combined-slip peak and sliding envelope (cycle 3)

`tireForce` first forms unsaturated demands: Fx_d from the implicit longitudinal
slip solve above, and Fy_d = -C_alpha * alpha with alpha = atan2(v, max(|u|, 3 m/s)).
With peak capacity F_peak = mu * grip * load (load-sensitive mu as before), the
normalized combined demand is q = |(Fx_d, Fy_d)| / F_peak. Both components are
scaled by the same factor, so force direction is preserved and lockup/wheelspin
consume cornering authority:

* q <= 2: |F| / F_peak = q (1 - q/4), with unit initial slope and peak 1 at q = 2.
* q > 2: |F| / F_peak = s + (1 - s) exp(-((q - 2) / w)²), s = `slidingGripRatio`
  (0.75), w = `slidingFalloff` (3). The curve and its slope are continuous at the
  peak and decay monotonically to s.

Telemetry adds `combinedDemand` (q) and `sliding` (q > 2); the browser shows
PRE-PEAK / SLIDE / NO GRIP per wheel, and its bars are force / peak capacity.
This is a hand-shaped, isotropic friction-circle substitute, **not** a fitted
Pacejka/brush model: s, w and the peak position are uncalibrated assumptions,
longitudinal and lateral peaks occur at the same normalized demand, and there
is no camber, pressure, temperature, speed dependence, or aligning torque. The low-speed lateral clamp is still applied after
the envelope. A locked wheel now produces less braking force than the peak and
much less lateral force than a rolling tire at the same steering input.

### Lateral slip relaxation (cycle 4)

Each wheel stores a force-producing slip angle `car.slipAngle[i]`. Every step it
relaxes toward the kinematic angle alpha_k = atan2(v, max(|u|, 3 m/s)) with the
exact first-order update

    alpha <- alpha_k + (alpha - alpha_k) exp(-max(|V|, V_floor) dt / sigma)

where |V| is contact speed, sigma = `relaxationLength` (0.45 m) and V_floor =
`relaxationSpeedFloor` (5 m/s). The lag is therefore a fixed travel distance:
63% of a step change after sigma metres, shorter in time at higher speed. The
exponential form is unconditionally stable; the speed floor keeps the state
responsive near rest. The relaxed angle feeds the cycle 3 envelope (so it also
shares grip with longitudinal demand). Telemetry adds `slipAngle` (relaxed) and
`kinematicSlipAngle`; the browser shows both per wheel as `α relaxed / kinematic`.

Passivity guard: the carcass deflection energy is not tracked, so a lateral force
that would push the contact along its slip velocity (relaxed and kinematic angles
of opposite sign) is set to zero instead of returning stored energy. The
existing low-speed lateral impulse clamp still applies. Assumptions: sigma and
V_floor are illustrative (no measured F1 relaxation data); sigma does not vary
with load, slip or speed; there is no longitudinal relaxation.

## Verification

Thirty-two deterministic tests cover the original rest, symmetry, aero/load/force,
stopping-distance, render-rate, hitch and 120-second stress checks, plus:

* Lossless free rolling, rear wheelspin, zero-grip wheel acceleration.
* Brake lockup/release, stationary brake hold against throttle.
* Forward/reverse stopping down to rest at 60/240/960 Hz integration.
* Wheel torque balance and isolated-wheel power/energy limits.
* Total chassis plus wheel energy dissipation, including 5000 seeded arbitrary
  chassis/wheel states (regression evidence, not a proof).
* Straight-line timestep convergence, with 240-to-960 Hz speed and distance
  differences below 1% in the tested five-second half-throttle scenario.
* Cycle 3 envelope: zero/unit slope, exact peak, smooth peak derivative,
  monotonic rise/fall, sliding plateau, reverse-travel symmetry, radial direction
  preservation, grip/load scaling, zero load/grip.
* Locked front wheels below 25% of rolling lateral force at 60/240/960 Hz in
  both directions; torque balance through sliding and release; passive energy
  through 6000 steps with discontinuous grip (0, 0.1, 1, 2) and sustained slides.
* Locked-wheel stop from 30 m/s: falloff lengthens the stop by more than 15%
  versus a no-falloff envelope. Measured 30.71 m at 240 Hz vs 31.12 m at
  960 Hz (1.3%); the test bound is 2%, so high-slip braking is less converged
  than straight-line acceleration.
* Cycle 4 relaxation: exactly e-fold decay per relaxation length at 240 and 960
  Hz substeps; near-rest floor speed. Step steer at 50 m/s: first-step front force
  is 43% of the instantaneous-tire force (bound 30–45%), 98% after 5 steps, and
  settled yaw rate within 1.8% of the instantaneous tire after 1.5 s (bound 2%).
  63% rise time 13.5 ms at 15 m/s vs 5.2 ms at 60 m/s (ratio 2.6, bound 2.5–5;
  coupled chassis response keeps it below the ideal 4). 240 vs 960 Hz step
  steer: yaw rate 0.43%, lateral displacement 0.55% apart.

Cycle 4 reran all four headless Chrome checks (new `/tmp/f1-relax-smoke.mjs`:
α readouts visible, relaxed angle nonzero while steering, reset clears state);
all passed without page errors.

Cycle 3 reran all headless Chrome checks against the actual page, and a new
check verified PRE-PEAK at rest, SLIDE during front lockup (q > 2, utilization
below 1), recovery after brake release, reset clearing, and compact layout.
All passed without JavaScript page errors. Temporary harnesses and screenshots
are under `/tmp/f1-*`; they are not repository tests. Numerical regression checks
establish internal consistency, not real-car accuracy.

## Next realism milestones

1. Fitted (e.g. Pacejka) curves replacing the
   hand-shaped envelope, thermal/wear state, and measured brake/tire parameters.
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
