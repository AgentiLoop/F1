# F1 Dynamics Lab

A playable browser testbed for an open-wheel vehicle model, rendered in 3D with
Three.js (r170, vendored under `vendor/`, MIT licence in `vendor/LICENSE-three`).
**Prototype, not a validated Formula 1 simulator.** All vehicle parameters are
illustrative assumptions, not measured F1 data or a season's regulations.

## Run

From this directory, run `python3 -m http.server 5188 --bind 127.0.0.1`, then open
`http://127.0.0.1:5188`. ES modules require HTTP; do not open the HTML as a file.
Three.js is served from `vendor/`, so there are no runtime downloads, npm
dependencies, or bundler. A WebGL-capable browser is required.

Run validation with `node --test` (all `*.test.mjs` files).
Node's built-in test runner is the only test dependency.

## 3D view and car model

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

## Controls

- W / Up: throttle; S / Down: brake.
- A / Left and D / Right: steering.
- Gamepad (browser "standard" layout, e.g. Xbox/PlayStation pads): right
  trigger throttle, left trigger brake, left stick steering. P toggles
  autopilot off to drive.
- Space: pause/resume; R: reset (restarts the race from the grid); V:
  overview/chase view; C: cockpit/chase camera; M: sound on/off (the audio
  starts on the first key press or click); O: opponents on/off (restarts).
- Race start (with opponents): hold still while the five red lights come on;
  go when they go out. Moving before lights out is a jump start (+5 s).
  Add `?nostart` to the URL to skip the start sequence.
- Race distance: 10 laps by default; `?laps=N` sets another. At the chequered
  flag the side panel shows the classification; R starts a new race.
- Pit stops: B cycles the pit request (box for Soft → Medium → Hard →
  cancel). On autopilot the car pits at the next pit entry; when driving, take
  the pit lane on the inside of the main straight (80 km/h limiter, +5 s for
  speeding) and stop in your box (the first one, painted green). `?tyre=soft`
  (or `medium`/`hard`) picks the start compound. With opponents every finisher
  must use two compounds (one stop) or is disqualified.
- Buttons provide the same pause/reset/view actions. Driving keys are ignored
  while a button has focus; click the circuit to return focus to driving.
- Losing window focus or hiding the tab pauses and releases held inputs.

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
impact. There is no damage or reset penalty. Use Reset if stranded.

### Opponents and racing (`race.mjs`, cycle 10)

The player starts on pole with four AI opponents (fictional names and liveries)
lined up 8 m apart behind, alternating 2.6 m either side of the centreline.
Every car runs the full single-car physics, stepped in lockstep at 240 Hz, and
the AI cars use the same autopilot as the player with their own corner speed
(42.4–43.9 m/s vs 43) and braking target. Per step:

* **Wake.** Behind a leader, w = e^(−(d − 4 m)/30 m) · e^(−(l/1.4 m)²) for a gap
  d ≥ 4 m along the leader's heading and lateral offset l (strongest leader
  wins). The follower's drag area is scaled by 1 − 0.35w (tow) and its
  downforce by 1 − 0.25w (dirty air). Both are illustrative, not CFD.
* **Contact.** Body footprints are oriented boxes (2.95 m ahead of / 2.35 m
  behind the CG, 1.0 m half-width). A separating-axis test gives the minimum
  overlap normal; cars are pushed apart by mass and get one impulse at the
  middle of the touching features (restitution 0.3, Coulomb friction 0.4),
  coupled to both yaw rates. Square rear-ends cause no spin; momentum is
  conserved and energy never rises. No damage.
* **AI traffic.** Lanes are the racing line and a passing lane 3 m either side.
  Each lane's speed cap lets the car stop 14 m behind the nearest car in it
  (18 m/s² planning deceleration, look-ahead grows with speed²). A car moves to
  a lane at least 3 m/s faster when no car is alongside across the swept strip
  and no nearby car is heading there, and returns to the line when it is no
  worse. New moves start only on a straight more than 60 m before the braking
  zone (or below 30 m/s, e.g. behind a stopped car); from the braking zone to
  the exit a car not ahead backs out behind one alongside. Corner speed is
  scaled for dirty air (√(1 − 0.45 · downforce loss)) and for a tighter line.
* **Autopilot changes** (player and AI): line offset and speed cap inputs; the
  throttle backs off as rear slip ratio passes 0.10 (gone at 0.25), like a
  driver catching wheelspin; a cross-track term 0.012 rad/m (falling with
  speed² above 40 m/s) and a 1.5 m/s lift per metre beyond 2 m wide of the line.
  The lone autopilot covers 2901 m in 60 s (2903 m before the cycle 13 slide-catching; the existing test needs > 2891 m).
* **Standings.** Order is by distance covered since the start line; the
  interval is the time since the leader passed the car's latest 10 m mark.

The timing box shows the race position (P1 / 5) and the side panel the order
with intervals; the status line reports car-to-car contact speed. Lap timing,
sound and telemetry remain the player's. Rival models use the same pose code as
the player's car (body roll/pitch/heave, wheel spin and steer). There are no
blue flags yet, and AI cars do not defend. Pit stops and tyre-state pace came in
cycle 13.

### Standing start (`race.mjs`, cycle 11)

With opponents on, `createRace(track, { start: true | { seed } })` runs a
standing start: one red light comes on per second (five in total), then they
go out after a random hold of 0.2-3 s (seeded PRNG, so tests are
reproducible). AI cars and the player's autopilot hold the brake until lights
out plus a per-driver reaction time drawn from 0.18-0.3 s. Moving more than
0.5 m before lights out is a jump start: a 5 s time penalty, shown in the
status line and the race order (`+5s pen`), and added to the race time in the
final classification. The player's reaction (lights out to throttle above 50%) is shown in
the status line. The light timing follows the familiar F1 pattern; the hold,
reaction range, 0.5 m threshold and 5 s penalty are illustrative choices.

### Race distance, chequered flag and classification (`race.mjs`, cycle 12)

`createRace(track, { laps })` sets a race distance (the page uses 10 laps,
`?laps=N` to change; 0 = endless). The start line is the chequered strip; the
flag falls when the leader completes the distance, and every other car finishes
the next time it crosses the line, so lapped cars finish a lap or more short,
as in F1. Finish times are interpolated within the 240 Hz step and measured
from lights out. After the flag a car cruises at most 45 m/s (cool-down lap).
`classification()` orders finishers by laps completed, then race time plus
time penalties (the jump-start penalty is applied here); cars still running
follow in road order. The side panel switches to the classification (winner's
time, gaps, `+N laps`, `incl. 5s pen`), the timing box to `Finished P2 / 5`
and the status line to the result. Before the flag the timing box shows the
lap (`P1 / 5 · Lap 3/10`). Race lengths here are short (a lap is ~30 s).

### Tyre compounds, pit lane and pit stops (cycle 13)

**Compounds** (`physics.mjs`): `TIRE_COMPOUNDS` scales peak grip and the wear
rate relative to the medium: soft ×1.015 grip and ×2 wear, hard ×0.985 grip and
×0.55 wear (illustrative, not supplier data). `car.compound` is set from
`tireCompound` and `fitTires(car, compound)` fits a new set: unworn tread at the
blanket temperature (70 °C).

**Pit lane** (`track.mjs`, `stadiumPitLane`): an asphalt apron on the inside of
the circuit, from 31 m into the main straight to 176 m into the back straight.
Cars cross a solid white line into the fast lane (11.5 m inside the
centreline). An 80 km/h limit applies between two lines at 145 m and 321 m.
There are five boxes 30 m apart, each 15.5 m inside the centreline, painted in
each car's colour, with a garage block behind the wall. Like many real pit
exits, the exit lane runs round the inside of the first hairpin and rejoins on
the back straight.

**Rules and service** (`race.mjs`):
- In the speed-limited zone a limiter cuts drive above the limit. Exceeding it
  by more than 0.5 m/s costs +5 s once per visit.
- A car that stops within 3 m of its box marks is serviced for 2.1–3.2 s
  (seeded random) and gets the requested or planned compound.
- The crew holds the car while another car approaches in the fast lane or is
  pulling out of a box behind (safe release). `stops[]` records the lap,
  compound, service time and total stationary time.
- With `compoundRule` (the page enables it with opponents; it applies to races
  of 2+ laps), a finisher who never ran a second compound is disqualified and
  classified after the running cars.

**AI strategy and driving**:
- Each car has a planned stop lap at 35–65% of the race distance, and a
  start/second compound (`tyres`: Kovač, Hart, Tanaka and the player
  medium→hard, Ferreira soft→hard). A planned stop is put off a lap if a car
  less than 200 m ahead is already boxing, unless it is the last chance.
- Without the rule, cars stop only when tread wear passes 60% with 3+ laps to go.
- A stopping car follows a path into the fast lane, across to its box and back.
  It brakes to reach the limit 15 m before the line and stops on its marks.
- In the pit lane it queues at a constant time headway (1.2 s + 8 m), so a
  bunch of cars boxing on the same lap does not concertina into each other.
- It rejoins only when no car on the circuit is alongside or closing within
  5 s; otherwise it waits at the end of the exit lane.
- Cars on either side of the pit-lane line are separate traffic. A car heading
  for the pit entry blocks every lane on its inside for cars behind it.
- `requestPit(compound)` sets the player's request (on autopilot the car boxes
  at the next entry). `inPitLane(car)` reports the limiter zone.

**Driver-model changes made while adding stops** (they affect all AI cars and
the player's autopilot):
- The AI's corner speed now scales with compound grip, the coldest tire's
  thermal grip (so out-laps on new tyres are slower) and the most worn tire's
  wear grip.
- The autopilot lifts as the rear slip angle grows past 0.08 rad, and stops
  adding lock (and lifts) when the fronts slide past 0.16 rad.
- No new passing move starts in the first 40 m after a hairpin. A lane change
  needs no car closing from behind within 2.5 s.
- Followers anticipate a braking car ahead (0.4 s of its deceleration).
- Lanes count cars moving into them. Cars also respect the strip they actually
  occupy, down to a nose-to-tail gap, then creep.

In 24 seeded 10-lap races (four seeds; default, hard-start and all-soft
grids; with and without the rule) there was one car-to-car contact over 2 m/s.
A stop costs ~15 s of race time here, about half a lap, which is a larger
share of a lap than in F1 (~20 s on a ~90 s lap). Stops now reshuffle the
order, and AI cars sometimes win. There is no tyre-change or
wheel-gun failure model, no pit-lane speed trap timing, and no undercut logic
beyond the planned lap.

### Fuel load (`physics.mjs`, `race.mjs`, cycle 14)

- `fuelLoad` (kg, default `null` = not modelled) sets `car.fuel`. The fuel adds
  to the mass at the CG: wheel loads, body modes, acceleration, wall and
  car-to-car impulses all use `carMass(car)`. Yaw inertia is unchanged.
- Burn is proportional to positive ICE crank work (the ERS burns none):
  `fuelPerJoule` 4.8e-8 kg/J gives ~99 kg/h at the ~575 kW ICE peak (the F1
  flow limit is 100 kg/h). Coasting and
  braking burn nothing (no idle flow). `telemetry.powertrain.fuel` / `fuelFlow`
  (kg/h).
- An empty tank starves the engine: no drive, whatever the pedal.
- A race with a distance (`laps`) fuels every car for it, no refuelling:
  laps x 0.38 kg (the autopilot's measured burn here, ~0.26 kg/km against
  roughly 0.35 kg/km in a real Grand Prix) + 3% + a 1 kg reserve (the sample a
  car must keep). `createRace({ fuel: false })` or a spec `car.fuelLoad`
  overrides it. The HUD shows the fuel left; standings rows carry `fuel`.
- Measured with the autopilot on this circuit: 40 kg costs only ~0.06 s on a
  28.7 s lap (~0.015 s per 10 kg), much less than the ~0.3 s per 10 kg
  usually quoted for a ~90 s Grand Prix lap: this stadium
  lap is dominated by two drag-limited straights and two hairpins. In 12
  seeded 10-lap races with the compound rule every car finished with
  1.2-1.4 kg left and no car-to-car contact. A 10-lap race carries only
  ~5 kg, so the effect grows with `?laps=N`.

### ERS hybrid deployment (`physics.mjs`, cycle 16)

Modelled after the 2014–25 power-unit rules; the numbers are illustrative.

- The torque curve is the ICE alone (~575 kW peak). The MGU-K adds up to
  `ersPower` 120 kW at the crank (at most 200 N·m) in proportion to the
  throttle. It fades in over 5 m/s above `ersMinSpeed` 100 km/h: the real rule
  only applies at the race start, but here it applies everywhere, which also
  keeps the MGU-K out of first-gear wheelspin. The limiter cuts it with the ICE,
  and it is off during a shift.
- The energy store holds `ersCapacity` 4 MJ (full at the start). Per lap at
  most `ersDeployPerLap` 4 MJ goes to the MGU-K, and it harvests at most
  `ersHarvestPerLap` 2 MJ. `newErsLap(car)` resets both counts. The race and
  the time trial call it when a car crosses the line.
- Harvest: under braking the MGU-K recovers up to 120 kW of the rear brake
  power. The total brake force is unchanged, as with brake-by-wire. The MGU-H
  puts 6% of the ICE power into the store, with no lap limit (an assumption).
- `input.ers === false` holds deployment back; `ers: false` in the car spec
  removes the system. Telemetry: `powertrain.iceTorque`, `ersTorque` and
  `powertrain.ers` (`charge`, `deployed`, `harvested`, instantaneous `deploy`
  and `harvest` W). The HUD shows the store, the live deploy/harvest power and
  the energy deployed this lap.
- The autopilot and AI deploy whenever they are on the throttle. They do not
  plan where to spend the energy.
- Measured, stadium track: laps drop from 28.7 s to 28.1 s and top speed from 267
  to 282 km/h. The store empties after about 4 laps, because this lap is mostly
  full throttle with little braking. After that each lap deploys only what it
  recovers, about 0.7 MJ, and laps settle near 28.4 s. In 12 seeded 10-lap
  races with the compound rule every car finished, with no car-to-car contact
  and 1.5–1.7 kg of fuel left.
- Measured, real circuits (second flying lap, Node; in brackets the cycle-15
  car without ERS): Monza 96.9 s (98.2 s), Silverstone 115.7 s (116.2 s), Spa
  128.8 s (128.9 s), Interlagos 87.5 s (88.4 s), Red Bull Ring 82.0 s
  (83.3 s). Top speed rises by 9–20 km/h, to 310–324 km/h. Every lap uses the full 4 MJ, and the
  MGU-H keeps the store topped up at Silverstone and Spa.
- The time-trial autopilot now scales its corner speeds by the tyres' grip:
  the compound, the most worn tyre, and any tyre running above its optimum
  temperature (a cold tyre is left to the plan's grip margin). Without that, the
  extra rear power at Spa overheated the rears (~127 °C, 28% worn after 2.4
  laps) and the car spun on lap 3. With it, third flying laps are 1–3 s slower
  as the rears go off.

### Real circuits: time trial (`circuit.mjs`, `circuits.mjs`, `trial.mjs`, cycle 15)

Pick a circuit from the menu in the header, or open `?track=<key>`. The keys
are `monza`, `silverstone`, `spa`, `interlagos`, `red-bull-ring`,
`hungaroring`, `catalunya`, `zandvoort`, `cota`, `monaco`, `bahrain`,
`montreal`, `yas-marina`, `imola`, `mexico`, `jeddah`, `miami` and `shanghai`.
A real circuit is a solo time trial. It has no AI field, start lights or pit
lane yet; those stay on the stadium track. The car starts 150 m before the line
and the lap timer starts when it crosses.

* **Layouts:** traced centrelines from
  [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT,
  © 2019–2025 Tomislav Bacinger), converted to local metres. Each trace is
  splined, smoothed and scaled to the official lap length. The first point is
  used as the start/finish line. The source order is assumed to be the race
  direction; this was not checked against official maps.
  The traces are approximate. They have no elevation, no camber and no real
  track width: every circuit is 13 m wide.
* **Surfaces:** the same grip bands as the stadium track: asphalt, a 1.2 m
  kerb, runoff to 8 m past the edge, then grass. Kerbs are only laid where the
  line curves; on straights the road edge runs straight into runoff. Walls sit
  18.5 m from the centreline. Where two parts of a circuit run closer than that,
  the wall is the midline between them. Barrier and surface queries use a
  25 m grid of centreline segments.
* **Racing line:** a minimum-curvature line within ±4.9 m of the centreline,
  solved by relaxation from coarse to fine. On every bundled circuit its ideal
  speed plan is about 10–18% faster than the centreline's. It is the classic geometric
  line. It does not trade curvature for longer braking or earlier throttle the
  way a true minimum-time line does. In hairpins tighter than the traced
  width, it can cut a tighter apex than the centreline.
* **Autopilot (`createCircuitAutopilot`):** pure pursuit on the racing line.
  Corner speed comes from v²|κ| = 0.74·μ·(g + q·v²), where q is the
  downforce-to-mass term, so fast corners with downforce are taken flat. A
  backward braking pass uses 0.62·μ·(g + q·v²) plus drag. The target is the
  lowest planned speed over the next 0.3 s.
* **Scenery (`buildCircuitWorld`):** road, edge lines, kerbs, runoff, walls
  and fence (left out where the circuit doubles back on itself), a
  start/finish gantry, a grandstand, hoardings, trees and hills sized to the
  layout. The overview camera frames the whole circuit.

**Measured** (autopilot, medium tyres, no fuel, second flying lap in Node):
Monza 98.2 s, Silverstone 116.2 s, Spa 128.9 s, Interlagos 88.4 s, Red Bull
Ring 83.3 s. Real dry pole laps are roughly 79 s, 86 s, 102 s, 70 s and 64 s
(approximate, from recent seasons), so this car is about 24–35% slower. The gap comes from the uncalibrated car (about 575 kW and
305 km/h top speed, about 2.8 g in fast corners at the autopilot's grip margin),
the geometric racing line, and corners in the traces that are tighter than the
real ones. Asking the autopilot for more grip (latGrip 0.82–0.9) made laps no
faster and put the car off the road. No car calibration was changed this
cycle.

Not bundled: Suzuka (the figure-of-eight crossover breaks nearest-point
progress); Baku (two parts of the trace lie 9.6 m apart, so the car takes a
shortcut); Albert Park, Losail and Las Vegas (in a probe the autopilot left
the road for 1.5–2.1 s over two laps); Marina Bay (its trace winds clockwise, which I
could not reconcile with the race direction).

### Driver input (`input.mjs`, cycle 7)

Keyboard keys are on/off, so they are rate-limited instead of stepping the
pedals: throttle and brake ramp to full at 6/s (about 0.17 s) and release at
10/s; steering moves toward lock at 3/s and back toward centre at 5/s, and a
reversal crosses centre at the return rate before ramping the other way. The
ramps are exact for any frame time and use the same elapsed time the
simulation accepts (frames are capped at 0.25 s). Gamepad triggers and stick
are analog and applied without a ramp, after an 8% deadzone (remaining travel
rescaled to 0–1); the stick has a 1.5 power curve for finer control near
centre. Both sources share the speed-based steering authority
1 / (1 + (u / 22 m/s)²), and the physics steering-rate limit (1.2 rad/s)
still applies. When both are used, the larger pedal value wins and a held
steering key overrides the stick. The HUD shows the active source and the
throttle/brake commands, including the autopilot's. All rates are illustrative
choices, not measured driver or hardware data. Only the W3C standard mapping
is read; wheels and pedal sets that report a non-standard layout are ignored,
and there is no force feedback, calibration screen or key rebinding yet.

### Lap timing (`laptimer.mjs`)

The start/finish line is the chequered strip on the bottom straight. Progress is
measured along the centreline (`track.progress`, 1445.5 m per lap) and split into
three equal-length sectors. The timer is updated once per rendered frame; each
line or sector crossing is timed by linear interpolation between updates, so
splits do not depend on frame rate. Laps start at the first forward crossing
after a load or reset (out lap); driving backwards over a line never counts.
A lap is deleted when all four tire contact points are beyond the asphalt edge at
the same time (the F1 track-limits convention; kerbs are outside the edge).
Deleted laps cannot set best laps or best sectors. The live delta compares the
current lap with the best lap at the same distance (5 m reference samples).
Reset aborts the lap in progress but keeps completed laps and session bests.
Sector colours: purple = session best, yellow = slower.

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
* Losses: surface to air (12 + 0.8·u W/K) and to the 35 °C track (25 W/K);
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
(40 MJ for a full tire at or below the optimum) and multiplied by
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

## Verification

Deterministic tests (101 in total across all `*.test.mjs` files) cover the original rest, symmetry, aero/load/force,
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

Cycle 6 thermal tests: thermal grip peaks at 100 °C, is symmetric and floors at
0.8; the two-node model matches its analytic steady state within 0.01 °C at
60/240/960 Hz and relaxes between air and track temperature without input;
locked-wheel sliding heats the tread >5 °C in 1 s while free rolling only cools
it; a 50 m/s stop on 40 °C tires is >10% longer than on 100 °C tires.
`/tmp/f1-thermal-smoke.mjs` checks the per-wheel temperature HUD in Chrome.
Cycle 8 wear tests: wear grip is 1 when new, linear to the cliff, steeper past
it, and clamped at both ends; wear equals sliding energy / 40 MJ at
60/240/960 Hz, is e times faster one temperature scale above the optimum and
caps at 1; a 1 s lockup wears every tire while free rolling does not; a 50 m/s
stop on fully worn tires is >10% longer than on new ones.
`/tmp/f1-wear-smoke.mjs` checks the wear HUD in Chrome, that wear grows while
driving and that reset fits new tires; all nine earlier browser checks still pass.

Cycle 9 sound tests (`audio.test.mjs`): V6 firing frequency; engine level and
filter brightness rise with throttle and rpm, shift cut and limiter flag;
turbo spool matches 1 − e^(−t/τ) at 30/60/240 Hz and decays; no squeal while
free rolling, strong squeal in a lockup; wind ∝ speed²; a full-throttle run
gives a rising firing frequency that drops at each upshift; the Web Audio graph
builds against a stand-in context and schedules only finite, sub-Nyquist
values. `/tmp/f1-audio-smoke.mjs` checks in Chrome that no AudioContext exists
before a gesture, that a click starts it, live parameters while the autopilot
drives, the M toggle, and renders the real graph offline at 10000 rpm full
throttle: RMS 0.32, peak 0.62, dominant period 254 Hz (the 250 Hz half-order).

Cycle 10 race tests (`race.test.mjs`): wake geometry (strongest close behind,
none ahead, beside or overlapping); a car 15 m in the tow of an identical car
gains more than 1 m in 3 s at full throttle over one in clean air and loses
over 10% downforce; contacts in three configurations conserve linear momentum,
never add energy and leave the cars separating, and a square rear-end adds no
yaw; a five-car autopilot race runs 240 s with every car inside the kerbs, no
contact above 2 m/s and every car past lap 8 with ordered standings; AI cars
pass a car stopped on the grid without contact. `/tmp/f1-race-smoke.mjs`
checks in Chrome the five-car field and standings HUD, that every rival model
is drawn at its physics position, and that O removes and restores the field.

Cycle 11 start tests (`race.test.mjs`): lights come on at 1..5 s, lights out
falls in 5.2-8 s and is reproducible per seed; no car creeps on the grid; all
five cars react within the 0.18-0.3 s range, launch without contact above
2 m/s and cover more than 900 m in 40 s; throttle before lights out gives a
5 s jump-start penalty only to the player; braking until 0.25 s after lights
out records a 0.25 s reaction and no penalty. `/tmp/f1-start-smoke.mjs` checks
in Chrome the light build-up with the field held, the autopilot launch and
reaction readout, a keyboard jump start with `+5s pen` in the race order, and
a clean manual start. The other browser checks load `?nostart`.

Cycle 12 finish tests (`race.test.mjs`): a two-lap autopilot race ends with
the flag and every car finished, classified 1-5 by total time on the lead lap,
gaps 0-15 s, the winner's time equal to the flag time, no contact above 2 m/s
including the cool-down; a 30 s penalty is added to the player's time and
places it behind every car with a lower total; a player parked on the grid is
unclassified (`finished: false`) at the back while the AI field finishes.
`/tmp/f1-finish-smoke.mjs` runs `?nostart&laps=1` in Chrome: lap counter
`Lap 1/1`, then the classification panel, `Finished P1 / 5`, gaps, the
chequered-flag status, and R restarting the race. The race, start and basic
driving browser checks were rerun and pass.

Cycle 13 tests:
- Softer compounds stop shorter and wear faster, and `fitTires` resets wear
  and temperature.
- The pit apron surface runs from the entry, round the first hairpin, to the
  exit.
- A 3-lap race under the compound rule: every car makes exactly one stop and
  changes compound, the service time is within its range, there is no contact
  over 2 m/s, no pit-lane speed above the limit + 0.5 m/s and no penalties.
- A car that never changes compound is disqualified and classified last.
- A player request on autopilot fits the requested soft tyres.
- Pit-lane rules: the limiter, a one-off speeding penalty, and service for a
  car stopped in its box.

`/tmp/f1-pit-smoke.mjs` (`?nostart&laps=2`) checks in Chrome:
- the pit-info line;
- B cycling the request;
- the limiter and pit-stop status texts;
- the player fitting softs;
- a full classification where every car shows `1 stop`.

The finish, race, start, basic driving and 3D checks were rerun and pass. The
finish check's row regex now allows the ` · 0 stops` suffix.

Cycle 14 tests:
- Fuel: none modelled by default; full throttle burns 60-101 kg/h; coasting
  burns nothing; 100 kg costs acceleration against 1 kg; an empty tank gives
  no drive.
- A 10-lap race fuels every car for the distance (an explicit `fuelLoad` is
  kept; no fuel without a distance or with `fuel: false`), and the burn over
  ~1 lap is within 0.08 kg of the planned per-lap figure.

Cycle 7 input tests (`input.test.mjs`): deadzone/curve shaping and monotonicity;
keyboard throttle ramp identical at 1/240, 1/60 and 1/30 s frames; steering
lock, return and centre crossing exact for small and single large steps;
speed-scaled authority for keyboard and stick; standard-mapping trigger/stick
reading (non-standard or disconnected pads ignored, digital-only triggers
read as full); merging and source selection. `/tmp/f1-input-smoke.mjs` drives
a fake standard gamepad in Chrome: keyboard throttle ramps (0.10 seen
mid-ramp), the HUD switches to gamepad, RT 0.77 gives throttle 0.75 and the car
moves; all eight earlier browser checks still pass.

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
   hand-shaped envelope, pressure, camber and measured brake/tire/thermal parameters.
2. Suspension travel per corner, road elevation, roll-sensitive aero, plank
   wear/friction and porpoising from a measured aero map.
3. Engine/transmission, differential, setup controls, and ERS deployment
   strategy (where to spend the energy each lap, overtake mode).
4. Measured validation targets for acceleration, braking, steady-state cornering,
   and transient handling before making realism claims.
5. Wheel/pedal calibration and
   force feedback, damage, kerb geometry and bumps, race
   rules (safety car, blue flags), undercut/overcut strategy and smarter AI racecraft.
6. Real circuits: elevation, camber and surveyed track widths, a minimum-time
   racing line, pit lanes and the AI field on real layouts, and car calibration
   so lap times can be compared with real pole times.

## Repository / parity

This repository was initialized from an empty project directory in cycle 1.
No parity directory was supplied in the task or declared in the local tab
registry. Only the primary directory was changed; no mirror path was invented.
`.agent/` contains local agent state and is excluded from version control.
