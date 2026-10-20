# Physics and 3D model

Technical notes for AgentiLoop Racing. Back to the [README](../README.md); the cycle-by-cycle notes are in the [development log](DEVLOG.md).

## 3D view and car model

* Every car on the grid is a photo-real 2026 RB22 model (CC BY 4.0, see
  `models/CREDITS.md`), repainted at load time in each car's colours with
  this project's sponsor names and a race number (`rb22.mjs`), with a turning
  steering wheel. In the player's car the mirrors render the scene reflected
  through each glass (`mirror3d.mjs`). If the model fails to load, or with
  `?car=procedural`, the built-in car below is used.
* `car3d.mjs` builds a procedural 2022-era-layout open-wheel car from the physics
  config, so wheelbase (3.6 m), track and wheel radius always match the simulated
  car: superellipse-lofted monocoque/nose, coke-bottle sidepods with inlets,
  airbox and engine cover with fin, cockpit, driver helmet, halo, mirrors,
  NACA-section four-element front wing and endplates, rear wing main plane and
  DRS flap, beam wing, swan-neck pylons, rain light, floor with plank, diffuser
  with strakes, wishbone/push-rod/track-rod suspension, brake drums, lathe-profiled
  18-inch tires with compound stripe, rims and wheel covers. Materials are PBR
  (clear-coated paint, carbon weave, rubber, metal) lit by a sun with soft
  shadows plus an image-based environment.
* Front wheels steer by the physics steer angle; every wheel spins at its own
  simulated wheel speed (so wheelspin and lockup are visible).
* `world3d.mjs` builds the same stadium circuit used by the surface function:
  textured asphalt, edge lines, red/white kerbs, run-off, barriers, a start
  gantry, grandstands, trees and a sky dome. Chase camera (smoothed), a fixed
  overview camera (V) and a cockpit camera (C).
* Cockpit camera: the driver's eye (0.8 m up, just ahead of the helmet centre) is
  carried by the sprung body, so roll, pitch and heave move the view; it looks
  along the car's heading, tilted 4° down, 64° vertical FOV, near plane 3 cm so
  the halo is not clipped. The helmet and visor are hidden while inside. The
  head is displaced opposite to the body-frame acceleration (8 mm/g fore-aft,
  6 mm/g lateral, clamped to 40/30 mm, 80 ms first-order lag) — an illustrative
  neck-compliance cue, not a measured driver model.
* Limits: the shape is hand-modelled from public proportions, not CAD of any real
  car; body roll/pitch/heave are rigid-body rotations of the sprung body (no
  per-corner suspension travel), and there is no tire deformation, damage or
  livery editor. Kerbs are drawn
  but the physics still treats them as off-track grip.

`car3d.test.mjs` checks the model fits a 5.65 × 2.0 × 0.96 m envelope, touches the
ground only with tires and plank, places each wheel hub exactly at the physics
contact position, has outward loft normals, and stays under 200k triangles.

## Stadium track, surfaces and walls

The stadium test circuit is fictional and flat. `track.mjs` defines its surfaces
and barriers to match `world3d.mjs`: asphalt, 1.2 m kerbs, run-off to 8 m past
the road edge, grass, and walls 12 m past each edge. Grip is sampled at each
wheel (assumed multipliers: kerb 0.9, run-off 0.7, grass 0.35).

Walls are rigid. Each step after integration, the body footprint (four corners,
2.95 m ahead of and 2.35 m behind the CG, 1.0 m half-width) is tested against
the walls; the car is pushed out by the deepest penetration and receives one
impulse at the depth-weighted centre of the penetrating corners: 25%
restitution along the wall normal and Coulomb scrub (friction 0.5) along it,
both coupled to yaw. The status line reports the closing speed of the last
impact. There is no damage or reset penalty. Use reverse to back away when
there is room behind; Reset remains available if stranded.

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
  Cornering stiffness grows with wheel load (exponent 0.8, cycle 33).
- Speed-squared aerodynamic load; drag integrated dissipatively after contact
  impulses to avoid reversing a nearly stopped car under braking.
- Ride-height aero map (`aeroMap`): front/rear ride heights from the sprung
  body's heave and pitch (static 40 / 80 mm, clamped at the plank). Downforce
  gains 4% per 10 mm the mean floor height drops below static (ground effect),
  and the floor stalls below 12 mm, losing up to 30% at the ground. Aero
  balance moves forward 1.5% per 10 mm of extra rake, so braking nose-down
  shifts load to the front axle. Body state from the previous step feeds the
  next step's downforce; the heave spring (700 kN/m) is far stiffer than the
  aero gain, so the platform settles without porpoising. All values are
  illustrative, not a measured aero map. The HUD shows ride heights
  (`· plank` when bottoming, `· stall` when the floor stalls) and balance.
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
There is no ABS or traction control (tread wear was added in cycle 8, thermal state in cycle 6; lateral relaxation was added in cycle 4; longitudinal slip has no relaxation).
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
  (0.85), w = `slidingFalloff` (3). The curve and its slope are continuous at the
  peak and decay monotonically to s.

Telemetry adds `combinedDemand` (q) and `sliding` (q > 2); the browser shows
PRE-PEAK / SLIDE / NO GRIP per wheel, and its bars are force / peak capacity.
This is a hand-shaped, isotropic friction-circle substitute, **not** a fitted
Pacejka/brush model: s, w and the peak position are uncalibrated assumptions,
longitudinal and lateral peaks occur at the same normalized demand, and there
is no camber, pressure, speed dependence, or aligning torque (temperature scales
peak grip since cycle 6, see below). The low-speed lateral clamp is still applied after
the envelope. A locked wheel now produces less braking force than the peak and
much less lateral force than a rolling tire at the same steering input.

### Tire temperature (cycle 6)

Each tire has two thermal nodes in `car.tireTemp[i]` (°C): the tread surface and
the carcass. Every step `updateTireTemp` advances them semi-implicitly (stable
at any allowed timestep):

* Surface heat in: `tireSlipHeatShare` (50%) of the contact friction power
  |Fx (r ω − u)| + |Fy v| (the rest is assumed to go into the road).
* Carcass heat in: rolling hysteresis, `rollingResistance` × load × |u|.
* Losses: surface to air (12 + 1.6·u W/K; 0.8·u before cycle 17) and to the 35 °C track (25 W/K);
  carcass to air (8 + 0.4·u W/K); surface↔carcass conduction 250 W/K. Heat
  capacities 2.5 kJ/K (surface) and 16 kJ/K (carcass). Air is 25 °C.
* Grip: `tireTempGrip` blends 60% surface + 40% carcass temperature T and
  multiplies the peak friction by 1 − 0.12 ((T − 100) / 35)², clamped to
  [0.8, 1]. Tires start at 70 °C (blanket temperature).

On the stadium circuit with the autopilot the rears and the outside front reach
~90–100 °C after a few laps and the lightly loaded inside front stays near
70 °C; after ~10 minutes the rears run ~120 °C (overheating from traction out
of the hairpins) and lose ~5% grip. All coefficients are illustrative
assumptions, not compound data; there is no pressure, camber or graining,
and the temperature is uniform across the tread width.
### Tread wear (cycle 8)
`car.tireWear[i]` is the fraction of usable tread used (0 new, 1 worn out;
`tireStartWear` sets the starting value). Every step `updateTireWear` adds the
same contact friction power that heats the tread, divided by `tireWearEnergy`
(200 MJ for a full tire at or below the optimum; 40 MJ before cycle 17) and multiplied by
exp(max(0, Tsurface − 100) / 20), so a tire running 20 °C over the optimum
wears e (~2.7) times faster. Free rolling causes no wear.
`tireWearGrip` multiplies peak friction (alongside the thermal grip) by
1 − 0.08·w − 0.15·c², where c = max(0, w − 0.75) / 0.25: a slow linear fade,
then a cliff that removes a further 15% over the last quarter of the tread.
A fully worn tire has 77% of a fresh tire's grip. The HUD shows wear and the
wear-grip multiplier per wheel; resetting the car fits new tires.
With the autopilot on the stadium circuit the rears use ~1.8% after 20 s
(launch wheelspin plus traction out of the hairpins) and the fronts 0.2–0.4%.
All coefficients are illustrative; wear does not change tread thickness or
heat capacity. Compound grip/wear multipliers and pit stops came in cycle 13.

### Engine and tire sound (`audio.mjs`, cycle 9)
All sound is synthesized from the physics telemetry; there are no recorded
samples. `createSoundModel` is a pure mapping (tested in Node) and
`createAudioEngine` renders it with Web Audio:
- Engine: the firing frequency of a four-stroke V6, rpm / 60 × 3 (200 Hz at the
  4000 rpm idle, 750 Hz at 15000 rpm), as a sawtooth plus a half-order rumble
  and a second harmonic, through a resonant low-pass whose cutoff rises from
  2.5× to 8× the firing frequency with throttle. Level rises with throttle and
  rpm (22% on a closed throttle), drops to 35% during the 30 ms ignition-cut
  shift, and a 22 Hz square gate chops it on the rev limiter.
- Turbo whine: a sine from 1.8 to 7.5 kHz following throttle × rpm with a
  0.35 s exponential spool lag (frame-rate independent).
- Tire squeal: band-passed noise whose level follows the total contact sliding
  power (the same quantity that heats and wears the tires), audible from
  15 kW and full at 150 kW, with pitch rising slightly with intensity.
- Wind: low-passed noise, level and brightness growing with speed squared
  (full at 90 m/s).
Parameters glide (setTargetAtTime) to avoid zipper noise. The mix is quieter
from the overview camera and silent while paused. The levels and frequencies
are illustrative; there is no exhaust/intake modelling, Doppler, spatial
panning, gear whine, or sound of other cars.

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

