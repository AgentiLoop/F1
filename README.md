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
- Q: select reverse; E: select forward. Hold the direction key while stopped,
  braking and off throttle, then release the brake and use W / Up (or gamepad
  RT) to drive in the selected direction. The HUD shows R for reverse.
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
- DRS: hold F (gamepad RB). It opens only where the race allows it (see
  below); braking closes it. In a time trial it is free to use in the DRS
  zones. The autopilot opens it wherever it is allowed.
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
impact. There is no damage or reset penalty. Use reverse to back away when
there is room behind; Reset remains available if stranded.

### Reverse recovery (cycle 18)

In manual mode (P turns autopilot off), stop, release the throttle and hold
brake + Q until the HUD shows **R**. Release the brake and use the normal
throttle to back up. Stop and hold brake + E to return to first gear. Q/E
also work alongside gamepad pedals; there is no gamepad-only gear selector.
Pressing P while reversing makes the player brake and select forward before
handing control back to the path-following autopilot.

`physics.mjs` represents reverse as `car.gear === -1`. An explicit
`input.reverse: true` requests reverse, `false` requests forward, and an
omitted request preserves the selected direction. A direction change requires
chassis speed and every wheel's tangential speed below 0.2 m/s, brake above
50%, no throttle and no shift already in progress. It uses the existing shift
torque interruption. Forward automatic shifting is disabled in reverse.

The illustrative overall reverse ratio is 45:1, not measured gearbox data.
Engine speed is measured in the selected drive direction; signed rear-wheel
torque drives backwards through the tyre/contact model rather than reversing
chassis velocity directly. Engine braking, wheel brakes and fuel consumption
remain active; ERS deployment is disabled in reverse. There is no neutral or
manual clutch simulation.

### AI wall recovery (cycle 19)

An AI car stopped (below 1 m/s, out of the pits, not finished) for
`recoveryDelay` (2 s) with a barrier just ahead of its nose (probed 0.5 m past
the body front, normal facing the car) tries to back out instead of waiting to
retire. It brakes and requests reverse through the same physics interlock as the
player, then reverses at up to `recoverySpeed` (2 m/s), steering so the nose
swings towards the direction of travel. It selects forward once it has moved at
least `recoveryMinDistance` (3 m) and points within `recoveryAlign` (0.35 rad)
of the track, or a barrier is behind it, or it has moved `recoveryDistance`
(20 m). Then the normal AI takes over again.

Before each reversing step it sweeps the car's footprint up to 2 m back along
the steered arc. A barrier on that path, or another car (or where that car will
be in the next 2 s at its current velocity) within the combined footprint radii
plus 1 m, holds the brakes. There is no teleporting or reset. A car gets
`recoveryAttempts` (2) tries; a try that has not finished in `recoveryTimeout`
(20 s) retires the car (DNF), as does staying stuck afterwards. Fuel-starved
cars, cars pitting or finished, and the player's car (manual or autopilot) never
reverse automatically. A queue behind a stopped car is not a wall, so ordinary
traffic never triggers it.

All thresholds are illustrative choices, not team or marshal procedure. The
recovery only handles a nose-on barrier: cars beached sideways, in gravel or
pointing along a wall still retire, there is no marshal assistance, and the
2 s traffic look-ahead assumes constant velocity.

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

### DRS (`physics.mjs`, `race.mjs`, `trial.mjs`, cycle 20)

Modelled after the 2011–25 rules; the aero numbers and zone placement are
illustrative, not FIA zone maps or wind-tunnel data.

- Physics: `input.drs === true` opens the rear-wing flap (`car.drs`, 0..1) at
  `drsRate` 4 per second (0.25 s full travel). Any brake above 5%, or no
  request, closes it at the same rate. Fully open, it removes `drsDragLoss` 12%
  of the drag and `drsDownforceLoss` 10% of the downforce, all from the rear, so
  the aero balance moves forward (40% → 44% front). Telemetry: `drs`,
  `frontShare`. It stacks with the tow from a car ahead.
- Race rules: each zone has a detection point, an opening point and an end.
  A car whose gap at the detection point to whichever car crossed it last is 1 s
  or less may open the flap in that zone. That car can be a lapped car. Cars
  that are pitting, retired or finished do not count. DRS is enabled once the
  leader has completed 1 lap (since cycle 35; 2 laps before), so from lap 2, and is off after the chequered
  flag. `createRace(track, { drs: false })` turns it off.
- Zones: the stadium gets one on each straight. Each real circuit uses its
  real zones, measured from race telemetry (cycle 31, below), with the
  detection point 150 m before each opening. A circuit without zone data gets
  one on each of its two longest straights of at least 450 m, where a
  straight is where the racing line curves no tighter than 1/200 m⁻¹; each of
  those opens 60 m after the corner exit and runs to the next corner.
  `findDrsZones(track)` lists them.
- The AI and the player's autopilot request DRS wherever it is allowed, and
  the flap closes as they brake. A request from a player who is driving is
  ignored outside an allowed zone. The HUD shows `DRS from lap 2` (`lap 3` until cycle 35), the last
  detection gap, `DRS · hold F` when it is available, and `DRS OPEN`. The
  standings mark rivals running with DRS open. The 3D rear-wing flap swings
  from 35° to 5° as it opens.
- Measured: after 60 s at full throttle (ERS spent), top speed rises from
  308.7 to 322.2 km/h. Time-trial flying laps (autopilot) are 0.04–0.63 s
  faster, with top speed up 0–12 km/h: Monza 97.49 → 97.04 s, Silverstone
  115.69 → 115.47 s, Miami 109.46 → 108.83 s, Monaco 95.09 → 95.00 s. Real
  qualifying gains are of a similar order. Spa's lap was flagged invalid with
  and without DRS (it already was; fixed in cycle 21, below).
- In a seeded 10-lap stadium race the cars ran with DRS open for 7–40 s each;
  everyone finished with no wall impacts. In seeded 5-lap races at Monza,
  Silverstone and the Red Bull Ring the circuit AI field spread out by more
  than 1 s before lap 3, so no car ever qualified for DRS (fixed in cycle 22,
  below).

### Autopilot yaw-rate feedback: Spa's lap is valid again (`autopilot.mjs`, cycle 21)

- **Cause:** at Spa, Blanchimont (racing-line radius ~190 m) is taken flat at
  ~305 km/h. The car understeered there: front slip angles reached ~0.11 rad and
  it ran 3–5 m wide of the line, out to 8.2 m from the centreline. All four
  wheels went past the edge, so every Spa lap was deleted. Pure pursuit
  steers for the path's geometry and leaves out the extra lock an understeering
  car needs. The cross-track correction had faded to ~20% of its strength at
  that speed.
- **Fix:** the circuit autopilot now adds yaw-rate feedback to the steering:
  `yawGain` (2) × wheelbase × (pursuit curvature − yawRate/speed), applied above
  5 m/s. It adds nothing while the car follows the pursuit arc. The
  cross-track pull now keeps full strength up to 60 m/s (was 40).
- **Measured** (time trial, 2 flying laps, all 18 circuits): every lap is now
  valid. The largest distance from the centreline is 5.9 m, at Spa (was 8.2 m);
  the road edge is at 6.5 m. Laps are 0.0–1.1 s faster: Spa 125.83 s, Monza
  95.55 s, Silverstone 113.42 s, Catalunya 92.77 s. Seeded 5-lap races at Monza,
  Silverstone, Spa, Interlagos and the Red Bull Ring, and 3-lap races on all 18
  circuits, finished with no wall impacts. The worst car-to-car contact was
  2.0 m/s, at Interlagos (1.9 m/s before the change). Stadium robustness races
  were unchanged.
- **Assumptions:** the gain and the 60 m/s fade speed were picked from a sweep
  (gains 0.5–5; fade speeds 40–120 m/s, where 120 made the car weave at Spa).
  They are not taken from real driver data.

### Close following and DRS on real circuits (`race.mjs`, `autopilot.mjs`, cycle 22)

- **Cause:** circuit AI cars could not run close behind another car. The follow
  law capped a car's speed so it could stop `followGap` (14 m) behind the car
  ahead braking at a flat 18 m/s². It also took the speed the car ahead would
  have 0.4 s later at its current deceleration. An F1 car with downforce brakes
  at ~40 m/s² from 80 m/s, so the follower braked far too early for every
  corner. A same-spec car behind lost ~0.3 s a lap and was 2.8 s down after 4
  laps at Monza. No car got within 1 s for DRS. The AI's planned grip was also
  cut for tires below their best temperature, but the autopilot's grip margin
  already allows for tires at their 70 °C starting temperature.
- **Fix (circuits only; the stadium is unchanged):**
  - The follow law may brake as the car's own speed plan does,
    `brakeGrip·μ·(g + q·v²)` plus drag, written as a + b·v². The highest
    speed that braking slows to the leader's speed within the gap has a closed
    form, `drive.brakeSpeed`: v0² = ((a + b·v²)·e^(2bd) − a) / b. The flat law
    stays as a floor and is the only law closer than `followGap`.
  - Anticipation counts only braking harder than the plan (a spin, a wall).
  - The tire-temperature grip factor counts only grip lost below the starting
    temperature.
  - The faster follow law caused new light contacts on lap 1, fixed by two
    changes. A car moving across, for example from its grid slot to the racing
    line, now pauses while the strip it still has to cross is not free. A slow
    car may still change lanes anywhere, but no longer in a slow corner such as
    La Source or Hungaroring T1, where this used to let cars run side by side.
- **Measured:** in a 2-car, 4-lap Monza race the follower's detection gaps fell
  from 1.37 to 0.63 s. It finished 0.46 s behind (was 2.76 s) with DRS open for
  44 s (was 0). In seeded 5-lap races with the full field, Monza had 69 s of
  DRS use and Silverstone 90 s (both 0 before). On all 18 circuits, 3-lap races
  had no wall impacts and no car-to-car contact except Monaco's existing
  1.8 m/s lap-1 touch. 5-lap races with 2–3 seeds at Monza, Spa, Silverstone,
  Interlagos, the Red Bull Ring, the Hungaroring, Zandvoort, Jeddah and Monaco
  were also clean apart from that Monaco touch. Race times are faster,
  for example Monaco 3 laps 296.8 → 288.9 s. Time-trial laps are unchanged
  (Spa 125.83 s, Monza 95.55 s).
- **Still missing:** cars now run in DRS range but almost never pass on
  circuits. The AI still has no late-braking or defending moves.

### Overtaking on real circuits: tow, follow gap, passing-lane plans, out-braking (`race.mjs`, `autopilot.mjs`, cycle 23)

- **Cause:** after cycle 22 no car passed on track in 5-lap full-field races
  at nine circuits. In 2-car races, a car 1–3 m/s faster in corners (up to ~7%
  more grip) behind a slower one passed on only 2 of 54 circuit/pace pairs.
  Four things stopped it:
  - A follower pulled out 40–50 m back, as soon as any car was in its lane.
    The lane gain compared a finite speed cap with an empty lane's infinite
    one. Pulling out that early threw the tow away before it built closing speed.
  - The fixed 14 m follow gap is ~0.7 s in a 20 m/s corner. That time gap
    carried down the next straight, out of reach of DRS (~2–3 m/s closing).
  - From 150 m before a corner every car went back to the racing line. From
    60 m the car behind always backed out, so a corner-speed advantage could
    never be used.
  - A passing lane cornered at the racing line's planned speed, although its
    path is tighter.
- **Fix (circuits only; the stadium is unchanged):**
  - *Slipstream first:* a car leaves the line only once it is within
    `pullOutTime` (0.3 s) plus a car length of the car ahead on the line. It
    also needs at least `passRoom` (250 m) to the next corner.
  - *Follow gap grows with speed:* `followMin + followTime·v` (8 m + 0.08 s),
    at most the old 14 m. The full 14 m still applies in three cases: behind a
    car slower than `followSlow` (10 m/s, e.g. one that ran wide in a hairpin),
    while a car is still crossing to its lane (lap-1 grid slots), and when
    backing out from alongside.
  - *Passing-lane speed plans* (`drive.lanePlan`): each ±3 m lane has its own
    plan, from its own curvature and arc lengths. The offsets are smoothed
    first (`laneSmoothing`, 100 passes) so the clamp at the road edge leaves no
    kinks. A car on a passing lane is capped by both plans.
  - *Out-braking:* a car in the passing lane on the inside of the next corner
    can dive. It must be within `diveGap` (20 m) of the car ahead when it
    reaches the laneReturn point. It then stays on the inside and brakes on its
    lane plan alone, at `lateBrake` (1.2×) the plan deceleration.
  - *Yielding:* once the diver's nose is within a car length plus `diveOverlap`
    (1 m), the other car yields. It backs out to `yieldGap` (2 m) nose to tail
    and moves to the outside lane, because the inside lane meets the racing
    line at the apex.
  - *Giving up:* a diver not alongside by `diveTurnIn` (15 m) before the corner
    gives up. The exception is a diver closing fast enough to be alongside
    within `diveReach` (1.5 s since cycle 35; 0.6 s before), because backing out then would run into the
    other car; since cycle 35 that commitment sticks until the dive ends.
  - *Ending:* the move ends once the diver is clearly ahead or no longer
    alongside, or `diveExit` (40 m) down the next straight. The corner's inside
    is the sign of the racing line's tightest curvature in the 60 m after the
    corner start.
- **Measured, 2-car races:** a leader with a 42 m/s corner speed raced a
  follower 1–3 m/s faster, over 5 laps on all 18 circuits.
  - Passes: 22 of 54, none with contact. Before: 2 of 54, one of those with a
    3.6 m/s contact.
  - Monza, Catalunya, Jeddah and Miami see passes even at +1 m/s.
  - Silverstone, Bahrain, Mexico, COTA, Yas Marina, Imola, the Red Bull Ring
    and Monaco still see no pass.
  - The cycle-22 Monza pair (43.6 behind 43 m/s) now ends with the faster car
    winning by 1.5 s after one dive, without contact.
- **Measured, full field:**
  - 5 laps, 2 seeds, nine circuits: 10 passes (3 per race at Monza, 2 at
    Jeddah), no contacts and no wall impacts. Before: 0 passes.
  - All 18 circuits, 3 laps: no wall impacts. The only contact is Monaco's
    lap-1 Ste Dévote crawl, now 1.3 m/s (was 1.8 m/s).
  - Time-trial laps are unchanged (Monza 95.55 s, Silverstone 113.42 s, Spa
    125.83 s).
- **Assumptions:** every number above was chosen by trying values on these
  circuits, not taken from driver data. `lateBrake` 1.3 gave contacts and a
  follower that lost 5.6 s. A 12 m dive gap gave no dives.
- **Limits:** the defender gives up whenever a diver is alongside on its
  inside. There is still no defending, covering the inside or passing around
  the outside. Equal cars rarely pass, because dirty air (up to ~15% downforce
  at 20 m) costs the follower about what the tow and DRS give back.
- **Monaco note:** at Ste Dévote the traced centreline had a radius of about
  8 m, tighter than the car's turning circle. Every car ran wide at ~6 m/s on
  lap 1 and the field crawled round. Cycle 24 (below) fixes this in the track
  model.

### Minimum corner radius for traced circuits (`circuit.mjs`, cycle 24)

- **Problem:** the GeoJSON traces make some corners tighter than any F1 corner.
  Monaco's Ste Dévote came out at a 7.7 m centreline radius. Its racing line
  turned at 2.9 m, against a kinematic turning circle of 9.0 m (wheelbase
  3.6 m / tan 0.38 rad full lock). Bahrain, COTA, Shanghai, Mexico, Yas Marina,
  the Red Bull Ring and Miami also had 8–12 m centrelines and 5–7 m racing
  lines. The real tightest corner, Monaco's Fairmont hairpin, is about a 10 m
  radius, taken at ~14 m/s.
- **Fix:** `createCircuitTrack({ minRadius = 15 })`. After scaling, any sample
  that turns more than its spacing / `minRadius` gives the excess turn to its
  neighbours, repeated until no sample does. The total turn of each corner is
  kept, so a too-tight corner just becomes rounder. The path is rebuilt from
  the new headings, the small closing gap is spread along the lap, and the
  track is rescaled to the official length. `minRadius: 0` turns this off.
  Corners already wider than 15 m are left alone. (A first try that smoothed
  only the tight samples cut hairpins into a V with kinks at both ends.)
- **Result:** every centreline is now at least 15 m and every racing line at
  least 10.0 m (Monaco; was 2.9 m), all wider than the turning circle.
- **Measured, time trial (2nd flying lap):** Monaco 94.20 → 91.05 s, Bahrain
  113.52 → 112.75 s, COTA 125.82 → 125.30 s, Yas Marina 108.30 → 107.68 s,
  Mexico 96.43 → 96.05 s. All others moved by 0.2 s or less (Monza 95.55 →
  95.42 s, Silverstone 113.42 s, Spa 125.83 → 125.78 s). No lap left the road.
- **Measured, races:**
  - All 18 circuits, 3 laps, full field: no contact and no wall impact. The
    Monaco lap-1 touch (1.3 m/s) is gone, and the Monaco race took 292 s
    (was 308 s).
  - 2-car pace pairs on all 18 circuits: 24 of 54 passes (was 22), none with
    contact. Bahrain now sees passes at Turn 1 with +2 and +3 m/s. At Monaco
    the faster car now runs 0.7–0.9 s behind (was 2–3 s) but still cannot pass.
- **Assumption:** 15 m is a chosen floor, not survey data, a little above the
  low-teens centreline radius usually given as the practical minimum for an F1
  hairpin. It leaves a 10 m racing line at Monaco, close to the Fairmont
  hairpin.

### ERS deployment plan (`autopilot.mjs`, cycle 25)
- **Problem:** the circuit autopilot deployed the MGU-K on every throttle
  application, so the 4 MJ lap allowance ran out part way round: at Monza
  after ~3.2 km of 5.8 km (Spa ~3.3 of 7.0 km, Bahrain ~3.5 of 5.4 km). The
  rest of the lap, including the main straight, had no electric power.
- **Model:** extra power P at speed v gives Δv = P·dt/(m·v) for P·dt joules.
  The gain lasts until the next braking point D metres on, fading with drag
  over L = m/(ρ·dragArea) ≈ 520 m. So the lap time saved per joule is
  proportional to L·(1 − e^(−D/L)) / v³ (the score). A forward pass over the
  speed plan (ICE peak + 120 kW, rear-axle traction with downforce, drag,
  rolling resistance) gives each sample's speed, whether the car is
  accelerating there, and the energy (P·ds/v) deploying there costs.
- **Rule:** the MGU-K deploys where the score, rescaled by (plan speed /
  actual speed)³, is at least a threshold. The threshold is set from the
  samples sorted by score so the planned energy matches the lap target. A car
  slower than the plan (traffic, a poor exit) scores higher and deploys more.
  Steady corners (not accelerating in the plan) get none. If the target covers
  the whole plan (Monaco), it deploys on every throttle application as before.
- **Per-lap recalibration:** when the lap count resets, the ratio of energy
  actually deployed to the plan's estimate is measured, counting only the
  samples passed while deploying was still possible. The next target is what
  the store recovered that lap plus half its charge above `ersReserve` (50%)
  of capacity, capped at the allowance. That keeps the store from running
  flat (Monaco used to lose ~0.2 MJ a lap) or sitting full.
- `createCircuitAutopilot(track, { ersPlan: false })` restores the old
  behaviour. The command carries `ers` (physics already honours
  `input.ers === false`). `drive.ers(car)` exposes the plan.
- **Measured, time trial (3rd flying lap, old → new):** Monza 95.42 → 94.90 s,
  Spa 125.92 → 125.37 s, Jeddah 111.72 → 111.05 s, Bahrain 112.67 → 112.27 s,
  Imola 94.97 → 94.52 s, Silverstone 113.40 → 113.07 s, and 0.1–0.3 s on the
  rest. Monaco 90.95 → 91.05 s (the store target holds it back slightly). At
  Monza the allowance now runs out at ~5.37 km (about 0.4 km before the line)
  instead of at 3.2 km.
- **Measured, races:**
  - All 18 circuits, 3 laps, full field: no contact, no wall impact, no spin.
  - 2-car pace pairs (+1/+2/+3 m/s corner speed, 5 laps): 22 of 54 passes (was
    24), none with contact. The leading car now spends its energy as well as
    the chaser does, so a small pace edge is worth less. Variants tried and
    dropped: deploying everywhere when within 1 s of the car ahead (10 of 54:
    it empties the allowance early in the lap) and only while passing (21);
    scoring by plan speed alone (20).
  - The Interlagos out-braking test now uses a +3 m/s car (+2 no longer gets
    alongside within 5 laps).
- **Test:** at Monza, deploying on every throttle application empties the
  allowance before 60% of the lap. The plan lasts past 90%, laps more than
  0.3 s faster and keeps the store above half.
- **Assumptions:** the score is a first-order estimate, not an optimal-control
  solution. The ICE is taken at constant peak power in the forward pass. The
  50% store reserve is a chosen value. There is no overtake or defend mode
  yet.
### Pit lanes on real circuits (`circuit.mjs`, `race.mjs`, `world3d.mjs`, cycle 26)

Races on real circuits had no pit lane, so there were no pit stops, no
two-compound rule and no strategy. The traced layouts carry no pit lane, so
one is laid out beside the start/finish straight. It is a plausible lane, not
the circuit's real one.

* **Layout** (`circuitPitLane` in `circuit.mjs`): the stadium's cross-section,
  measured from the centreline. The apron runs from 7.7 to 17.5 m off the
  centreline (inside the 18.5 m wall), with the fast lane at 11 m, the box marks
  at 15 m and an 80 km/h limit. Positions are in lap progress measured either
  side of the line. The entry is 300 m before the line, then 120 m to the
  limit line, 260 m of boxes (five, 30 m apart, centred), 40 m to the merge
  zone and 130 m of merge zone to the exit.
* **Choosing a side:** each side is checked every 10 m, up to 700 m either
  side of the line. A side has room where a point just past the apron is still
  nearest this part of the circuit, and a bend towards the pits leaves at least
  20 m inside the apron. The layout slides as little as possible to fit; the
  side needing the smaller slide gets it, and the left wins a tie. Every one of
  the 18 circuits gets a lane: 16 on the left (entry 300 m before the line, Yas
  Marina 320 m), Montreal and Miami on the right (entries 230 and 330 m).
  `track.pit.side` is +1 for the left. `createCircuitTrack({ pitLane: false })`
  turns the lane off.
* **Surface:** between the entry and the exit, everything from the road edge
  out to the apron's far side is `pit` (full grip). That covers the entry and
  exit roads, so a car crossing to the lane is not on runoff.
* **Race logic** (`race.mjs`): the stadium code now works in a pit frame. A
  car's offset is multiplied by `pit.side`, so the pit side is always negative,
  and positions are signed lap progress. On a circuit the pit path is a
  centreline offset. It blends from the racing line (plus the lane the car was
  in) into the fast lane, across to the box and back, then out to the racing
  line. The circuit autopilot follows a path function as given, without the
  road-edge clamp.
  * Only cars on the apron beside the pit lane count as separate pit traffic.
    On the stadium that was any car past the white line; on a circuit it would
    have included a car running wide anywhere on the pit side.
  * In the pit lane, cars compare lanes as centreline offsets. The racing
    line's offset changes along the lane (Monaco's by about 2 m in 10 m), so
    offsets from it did not line up. A car leaving its box saw a parked car
    in the next box as in its lane and stopped behind it. The "nobody side by
    side near a corner" rule is also off in the pit lane.
* **Circuit-only driving changes:**
  * A planned stop is decided 150 to 5 m before the entry.
  * The pit-lane queue headway applies only from the entry. Before that, at
    Catalunya's final chicane, it slowed a car following a pitting car to
    9 m/s and ran it wide onto the runoff.
  * The pit path's own bends are taken at no more than `pitCornerAccel`
    (12 m/s²) laterally, braking at `pitDecel` over `pitPreview` (150 m).
  * The approach aims `pitLimitMargin` (1.5 m/s) under the limit. The circuit
    autopilot brakes only when over 1 m/s above its target, and holds 15%
    throttle below that, so cars crossed the line at 83–84 km/h and took the
    5 s speeding penalty.
  * The rejoin is at least `mergeSlope` (6) m long per metre across to the
    racing line. The line can be on the far side of the road, 17 m from the
    fast lane, and a 40 m merge left the car 0.85 rad off the track heading.
  * A car waiting for a gap waits 10 m into the merge zone, not 8 m before
    the exit, so the rest of the zone is left for the rejoin.
* **Scenery** (`buildCircuitWorld(track, { boxColors })`): an asphalt apron
  from the road edge to the far side between entry and exit, and a white line
  along the fast lane between the limit lines. Also the speed-limit lines, box
  marks in each car's colour (the player's first, green), and a garage behind
  the wall at each box where there is room. There are no hoardings along the
  lane. The grandstand now goes across the straight from the pits when it fits.
* **Results:** a 3-lap race with the compound rule on all 18 circuits (seed 1,
  five cars). Every race finished, with 90 stops, every car on two compounds,
  no contact, no time off the road, no wall hits, no spins and no penalties.
  Cars stood still for 2.6–8.8 s (median 4.3 s), longer when held for a safe
  release. Time-trial laps are unchanged (Monza 94.90 s, Monaco 91.05 s, Spa
  125.37 s on the second lap), and a seeded 4-lap stadium race gives the same
  times as before to 0.1 ms.
* **Tests:** two new tests. Every circuit has a pit lane spanning the line,
  with the box marks on `pit` surface, nearest their own part of the circuit
  and inside the walls. In a 2-lap Red Bull Ring race the whole field stops
  once, with no penalty, contact or time off the road. The 1-lap circuit race
  test now expects a pit lane (and still no compound rule for one lap). All 138
  tests pass.
* **Browser check:** `?track=red-bull-ring&race&laps=2&nostart` on autopilot.
  The player's car stopped on `pit` surface 14.4 m off the centreline, with
  the HUD showing "Pit stop · fitting Hard". It rejoined on hards with no
  penalty, and there were no page errors.
* **Assumptions and limits:** the lane's side and position are chosen, not
  real. There is no pit wall or separate pit building geometry, and the
  apron is flat on the circuit's plane. The stop decision window and the
  margins above are tuned values. A queue of cars through the Red Bull Ring's
  turn 1 hairpin on lap 1 still slows some cars below 5 km/h; this happened
  before this change too (same seeds at the previous commit).

### Lap-1 hairpin queues (`race.mjs`, cycle 27)

On lap 1 the field crawled through tight first corners. At the Red Bull Ring,
16 of 20 seeded starts had a car under 15 m/s twelve seconds after lights out
(turn 1's apex is planned at 19 m/s), and cars stopped almost completely
(0.8 m/s). The same happened at Spa (La Source), COTA turn 1 and the
Hungaroring. Two follow-law rules caused it:

* **Backing out the full 14 m.** In a corner nobody runs side by side, so a
  car that is not ahead backs out behind a car alongside. It dropped back the
  full `followGap` (14 m). At 15 m/s in a hairpin that is about 1 s, and the
  car behind it then had to drop back too. On a circuit, backing out now uses
  the speed-scaled gap (`followMin` + `followTime` · speed, as when
  following), so 9 m at 15 m/s.
* **Stopping to make up a small shortfall.** When a car was closer than its
  gap, the flat law `sqrt(v² + 2 · followDecel · d)` (d < 0) set its speed
  cap. That is the speed from which it could still stop behind a car braking
  at 18 m/s². For a car 8 m short behind one doing 15 m/s, it gives zero, so
  the car braked to a standstill. On a circuit the cap is now never below the
  leader's speed minus the shortfall per `backOutTime` (1 s): 7 m/s in that
  example. At speed the flat law is still the lower limit, and it is never
  raised for a stopped car (it gives zero there anyway).

The stadium is unchanged: a seeded stadium race gives the same times to the
last digit.

**Results** (3 seeds per circuit, lap 1 from 5 s after lights out):

| | before | after |
|---|---|---|
| time cars spent under 8 m/s, all 18 circuits | 44.4 s | 12.0 s |
| circuits where some car went under 5 m/s | 5 | 2 (Spa, COTA) |
| RBR seeds with a car under 15 m/s at 12 s (of 20) | 16 | 2 (14 m/s at the apex) |
| slowest car at RBR, lap 1 | 0.8 m/s | 9.6 m/s |
| contacts | 0 | 0 |

* 3-lap races without stops, 18 circuits, 2 seeds: on-track passes after
  lap 1 went from 0 to 4, with no contacts or wall hits. Fewer cars are stuck
  queuing, so they stay close enough to race.
* 3-lap races with the compound rule, 18 circuits: all 90 stops clean. No
  contacts, time off the road, spins, wall hits, penalties or
  disqualifications.
* 2-car pace pairs, 18 circuits: still 22 passes in 54 runs, no contact.
* Monza pair test: the faster car now gets through on lap 2 at the first
  chicane. That is before DRS is enabled, because it is no longer held up
  leaving the grid. The test now checks that it reaches DRS range instead
  of checking how long DRS was open.
* Browser: the Red Bull Ring race check passed 3 runs in a row with random
  seeds (slowest car at 12 s: 64-67 km/h). Before, it failed on most seeds.

**Not done, found while testing:** the standing start is still staggered.
Every car is heading for the racing line (lane 0), so a car counts the car
8 m ahead in the other column as in its lane and waits for it to pull away.
At Shanghai the last car moved 5.6 s after lights out. I tried letting cars
launch from their grid columns together until 30 m/s. That gives a real
start, but the field then reaches turn 1 three or four abreast. The AI
cannot yet run side by side through a corner (the inside lane meets the
racing line at the apex), and lap-1 contacts went from none to dozens (64
light touches over 54 starts in the best variant tried). So the simultaneous launch waits for side-by-side cornering.

**Tests:** a new test checks that on three Red Bull Ring seeds no car drops
under 8 m/s on lap 1, with no contact. It fails on the previous commit. All
139 Node tests pass.

**Spa and COTA (cycle 30).** The queues that remained at La Source and COTA
turn 1 came from a third rule. A car still crossing to its lane (for example
off its grid slot) keeps the full 14 m gap, and "crossing" was judged from
where the car was: more than 1 m from its lane. In a hairpin a car held below
its plan speed by the car ahead runs up to about 2 m inside its line, and a
passing lane is clamped at the road edge (at La Source the outside lane is
1.8 m off the line, not 3 m). Such a car counted as crossing, kept 14 m to a
car 8-9 m ahead and slowed further, and the cars behind followed it down to
1-2 m/s. Crossing is now judged from the car's target offset (still short of
its lane), not its position. Lap 1, 10 seeds per circuit:

| | before | after |
|---|---|---|
| Spa: slowest car / time under 8 m/s | 1.0 m/s / 21.0 s | 6.9 m/s / 0.9 s |
| COTA: slowest car / time under 8 m/s | 2.3 m/s / 18.9 s | 7.2 m/s / 7.3 s |
| Hungaroring: slowest car | 6.1 m/s | 12.7 m/s |
| contacts, 180 starts on 18 circuits | 0 | 0 |

3-lap fields (18 circuits, 2 seeds): no contacts, 4 passes. All 90
compound-rule stops clean. Pace pairs: 22 of 54, no contact. The stadium race
is identical. A new test checks Spa seeds 2 and 6 and COTA seed 8 stay above
5 m/s on lap 1 without contact; it fails on the previous commit. All 142 Node
tests pass, and the Red Bull Ring browser race check passes. (At Spa the same
browser check's "every car above 15 m/s at about 12 s" step catches the field
inside La Source, whose planned apex speed is about 12 m/s, so it does not
apply there.)

### Grip calibrated against real corner speeds (`physics.mjs`, `autopilot.mjs`, cycle 33)

With the real layouts in place (cycle 32), the lap-time gap was down to the
car. Its top speeds matched the 2024 race telemetry, but the circuit
autopilot took slow corners at 0.8–0.9 of the real speed and medium and fast
ones at 0.6–0.85. On the real line's radius the real speeds work out at about
2.5 g in slow corners and 4.5–5 g in fast ones. On a constant-radius test the
car itself (not just the autopilot's margin) held at most 1.6 g at 18 m/s and
2.8 g at 57 m/s:

* **Cornering stiffness grows with load.** It was a constant 85 / 115 kN/rad
  per front / rear tire, so the lightly loaded inside tire reached its slip
  limit long before the loaded outside one. At 72 m/s through Silverstone's
  fast corners the inside front ran at a combined demand of 4–5 (the envelope
  peaks at 2) while the outside one was at 1.2–1.3, and the car understeered
  off the line
  (up to 5.7 m on a timed lap, and off the road with more grip). The constants
  are now quoted at the static wheel load and scale by
  `(load / static)^stiffnessLoadExponent` (0.8), so both tires on an axle
  peak at nearly the same slip angle, and a tire pressed down by downforce
  is stiffer.
* **`tireMu` 1.65 → 2.1.** Raised so the autopilot's corner speeds (same 0.74
  margin) come close to the real ones. Downforce (5.0 m² ClA), drag and power
  are unchanged. Raising downforce to 6 m² as well (with `tireMu` 2.0) ran
  the time-trial car off at Silverstone. Moving the aero balance forward to
  the weight split (0.40 → 0.44, tried before the stiffness change) made the
  car snap loose and leave the road at Spa, Silverstone and Yas Marina, so it
  stays at 0.40.
* **The AI eases off the brake as the rears slide.** With more grip the cars
  brake harder into turns, and in the races a car braking into a turn behind
  another (in its dirty air, the load gone forward) slid its rears and spun
  (Bahrain 8–12 spins a car in 6 laps, Silverstone a car stuck against the
  wall and a 9 m/s hit). The circuit autopilot now cuts the brake by up to 70%
  once a rear tire's combined demand passes 1.6 (the envelope peaks at 2) while
  its slip angle is past half of `rearSlide`. Braking in a straight line is
  left alone: releasing there cost a rear-end into a car slowing for Ascari at
  Monza. Releasing on any locked wheel overshot Bahrain's turn 4 by 9 m.

**Results** (Node, seeded runs; before → after)

| Check | Result |
|---|---|
| Gap to the fastest 2024 race laps, 18 circuits (first flying time-trial lap) | 17.9% → 5.8%: Monaco 84.2 → 74.4 s (real 73.9), Silverstone 104.4 → 92.8 (88.0), Monza 93.1 → 85.8 (81.2), Jeddah 114.3 → 104.0 (91.2) |
| Corner speed / real speed, median of the circuits (range) | slow 0.83 (0.77–1.35) → 0.95 (0.88–1.39); medium 0.72 (0.56–1.04) → 0.85 (0.65–1.24); fast 0.66 (0.58–1.04) → 0.87 (0.71–1.12) |
| Most a time-trial car strays off the line | 0.8–6.1 m → 1.2–2.1 m |
| Lap 1, 18 circuits × 5 starts | 0 contacts and wall hits before and after; slowest car 6.3–19.0 → 9.8–20.4 m/s; time cars spent below 60% of their plan speed 1.9 → 0.0 s |
| 6-lap races, 18 circuits × 2 seeds | all finish, 0 contacts, walls, spins or offs; position changes 39 → 59 |
| 3-lap races with the compound rule, 18 circuits | all finish with no spins or wall hits; one 1.3 m/s touch at Monza's pit entry, where two pitting cars arrive side by side (no contact before) |
| Faster car (+3 m/s corner speed) behind a slower one, 18 circuits | passes 8 → 6, no contact |
| Browser | Monza time trial and Red Bull Ring race with a pit stop pass |

Tests: the time-trial laps at Monaco, Silverstone, Monza and the Hungaroring
are within 8% of the real fastest race laps and within 2.5 m of the line
(fails before: Monaco 84.25 s against 73.9); the loaded outside front's force
per radian is (load ratio)^0.8 times the inside one's. Three tests changed: the
step-steer relaxation test uses 0.02 rad (0.05 rad now reaches the nonlinear
part of the envelope with the stiffer loaded fronts); the locked-wheel stop is
allowed 2.5% between 240 Hz and 960 Hz (2.3% now; the stop is shorter); and the
Monza closing test gives the faster car 44 against 43 (Kovač's 43.6 closes to
0.3–0.5 s and no longer gets by in four laps) and checks the closest gap. 147
Node tests pass.

**Pit-entry follow-up (cycle 34, `race.mjs`):** the 1.3 m/s touch at Monza was
two pitting cars entering from different racing lanes (+3 m and 0 m from the
line, 3 laps, compound rule, seed 1). The pit-lane queue headway starts only at
the pit entry, and before then the path strips of the two cars did not overlap,
so the follower braked late as the paths converged. A car heading in now also
follows any pitting car ahead with the ordinary follow law (`approach`). Monza
seed 1: 262 contact steps → 0; Monza seeds 1–3 clean; seeded 3-lap compound-rule
races on all 18 circuits × 2 seeds finish with every car stopping once and no
penalty; all but Imola seed 2 have no contact. That one has an 8.4 m/s contact
at 120 s that also occurs without this change, with no car in a pit phase, so
it is not a pit-entry problem and is still open. New `pit-entry.test.mjs` fails on the old code.

**Overtaking on the real layouts (cycle 35, `race.mjs`):** fields on the real
circuits hardly ever passed: 16 passes and 8 contacts over 3-lap races on all 18
circuits × 2 seeds, and a car 3 m/s faster through the corners got by its
rival in four laps at only 9 of 18 circuits (27/54 pace pairs at +1/+2/+3 m/s).
Traces of the failures found four things, each fixed:

- The pull-out point: still in the tow within 30 m of the car ahead, a car
  pulled out from 400 m before the corner (`passRoom + laneReturn`), before it
  had closed at all. Out of the tow its surplus went at once and it reached
  the braking zone 15 m back. It now stays in the tow until `pullOutBy`
  (250 m) before the corner.
- The passing lane: lanes run parallel to the racing line and lose their room
  wherever the line swings to that side of the road. The lane was chosen where
  the straight began, and on the real lines the inside of the next corner is
  often the side with no room there (Shanghai's back straight, Catalunya's
  pit straight), so the car was out on the outside, held up where its lane
  closed near the braking zone, while the inside opened. A car out in a lane
  that runs out of room now crosses to the other lane if that is open.
- The commitment: a dive was committed when the diver's closing rate would put
  it alongside within `diveReach` (0.6 s). That was judged afresh every step,
  and inside the corner the diver's tighter line is slower than the other
  car's, so its closing rate went negative, the dive was dropped and the other
  car took its line back ahead of it. `diveReach` is 1.5 s (committing from
  ~10 m at a 2.7 m/s closing rate, as Silverstone's DRS run produced) and a
  commitment now sticks until the dive ends.
- Lane changes at `laneRate` 2.2 m/s took 2.7 s to cross the 6 m between the
  two lanes, so the car was still crossing at the braking zone. A car pulling
  out of a tow (or crossing to the other lane) now moves at `pullOutRate`
  (3 m/s). Ordinary moves (off the grid slots, back to the line) keep 2.2:
  raising them too gave a 24.5 m/s lap-1 contact in a stadium hairpin (seed 5).

DRS is enabled after one lap (`drsEnableLaps` 1), as in the rules since 2024,
so it is available from lap 2 and a 3-lap race has two laps of it. Results:
pace pairs 27/54 → 38/54 (Shanghai, Silverstone, Interlagos and Miami 0 → 3,
Catalunya 0 → 1, Spa 2 → 1; Monaco, Montreal, Hungaroring and Zandvoort still
0), no contact; 3-lap fields on 18 circuits × 2 seeds 16 → 34 passes and 8 → 0
contacts; seeded 10-lap stadium races (6 seeds, compound rule) all clean, with
0–4 passes each (the stadium race is not bit-identical: DRS now opens from lap
2 there too). 163 Node tests pass. The fictional field's pace spread
(42.4–43.9 m/s corner speed, 3.5%) is still small for the model: a +1 m/s
car hovers in DRS range without getting by at most circuits.

**Limits:** the remaining gap is mostly medium and fast corners at Jeddah,
Zandvoort, Yas Marina and the Red Bull Ring (0.65–0.85 of real), and Monaco's
slow corners are now at real speed or slightly faster. `tireMu` 2.1 is a
fitted number for this hand-shaped envelope with a 0.74 autopilot margin, not
a measured tire coefficient. The time trial has no fuel on board. Passing on
the real layouts is still harder than it should be: at Monza a faster car
hovers 0.2–0.4 s behind with DRS open, swapping passing lanes down the
straight where the line runs near the road edge.

### Real circuit geometry from car positions (`circuits.mjs`, `race.mjs`, cycle 32)

The GeoJSON traces (cycle 15) put each circuit in roughly the right place, but
their corners were too tight. Set against the real race speed at each corner,
the old racing line's radius implied 4–7 g at the apex of medium and fast
corners, which no F1 car pulls. The Hungaroring's turn 4 was a 53 m line where
the cars drive about a 100 m arc, and turn 1 was 19 m against about 24 m.

* **Data:** car positions from the OpenF1 API `location` endpoint (x, y, z in
  0.1 m, about 3.7 samples a second). 6 drivers × 12 clean race laps per
  circuit: laps from lap 4 on, not out-laps, within 2% of the driver's median.
  2024 races; 2023 at Silverstone and Interlagos, whose 2024 races were wet.
  Montreal 2024 started wet; only its dry laps pass the 2% filter.
* **Real line:** each lap starts at the timing line, so each sample is placed
  by its fraction of the lap (chord distance along that lap). The 72 laps'
  samples are pooled and Gaussian-smoothed (σ ≈ 5 m along the lap) into one
  path every ~4 m. This is the line the cars drive, not the road centre.
* **Centreline:** found so that the circuit's own racing line (`circuit.mjs`,
  unchanged) runs along the real line. Start with the real line as the
  centreline, build the track, move each centreline sample sideways by 0.8 ×
  the gap between its racing line and the real line, and repeat 12 times. The
  racing line then follows the real one to 0.4–0.6 m rms (Monaco 1.4 m). Using
  the real line itself as the centreline would let the racing line cut every
  corner again, by up to 4.9 m.
* **Placement:** each path is rotated and shifted onto the old trace (least
  squares, never mirrored) and starts at the old trace's first point. The grid,
  pit lane and run to turn 1 therefore stay where cycle 31 left them (moving the
  lap start to the timing line broke lap 1 then). Points are stored every 10 m.
* **Checks on the data:** the rebuilt centrelines are within 1% of the official
  lap lengths (Hungaroring 4417 m against 4381 m, Spa 7034 m against 7004 m).
  The timing line, now read directly from the positions, lands 2–31 m from
  where cycle 31's speed-trace fit put it. The OpenF1 x/y frame matched the
  GeoJSON frame without mirroring on all 18 circuits (4–10 m rms).
* **Time trial** (second flying lap, Node, old → new): Bahrain 112.32 →
  104.18 s, Shanghai 116.48 → 109.17, Catalunya 92.48 → 92.07, Monaco 91.12 →
  84.08, Montreal 87.32 → 83.77, Red Bull Ring 80.87 → 78.45, Silverstone
  113.07 → 103.53, Hungaroring 99.12 → 94.42, Spa 125.80 → 124.83, Monza 95.10
  → 91.72, COTA 125.08 → 114.77, Mexico 95.92 → 87.80, Yas Marina 107.52 →
  104.18, Imola 94.67 → 92.58, Zandvoort 92.10 → 92.10, Jeddah 111.02 →
  113.15, Miami 107.47 → 102.75, Interlagos 86.00 → 82.58. No offs. Against
  the fastest real race lap in the same data, the car was 23.0% slower over
  the 18 circuits; it is now 17.9% slower (13–27% per circuit). The rest of
  the gap is the car and the autopilot's grip margin in medium and fast
  corners, where the sim's apex speeds are 0.6–0.85 of the real ones. That
  can now be compared corner by corner.
* **Race AI changes the new layouts needed (circuits only):** the real racing
  lines swing across the road, out to the edge before a turn-in or in to an
  apex, within 50–100 m. A passing lane is held inside the road edge, so there
  it merges with the line.
  * A car being dived on now moves over to the outside lane as soon as the dive
    is committed (the diving car will be alongside within `diveReach` 0.6 s),
    not only once it is alongside. Before, at Interlagos turn 4 and at Imola,
    it was still on a line that was swinging in to the apex, and turned into
    the diving car (2.9 and 1.6 m/s contacts in the two-car test).
  * Whether a car ahead is in a lane's strip is judged from where that lane
    actually runs beside it (clamped at the edge), except for a car being
    dived on.
  * A car keeps `sideGap` 3.1 m (centre to centre) across the road from any
    car alongside, along its whole path ahead. Before, at Montreal, a car on
    the line squeezed one in the outside lane as the line ran out to the edge
    before turn 1: 28 contacts in 5 lap-1 starts.
* **Pit lane fixes the new layouts needed:** the pit path's own bends are now
  only speed-capped between the pit entry and exit. Before the entry the path
  is the racing line, and capping its corners at `pitCornerAccel` (1.2 g) made
  a car braking into Zandvoort's banked last corner spin into the wall; the
  race never finished. A car heading into the pits now also sees cars already
  on the apron, and judges whether one is on its path from where its own path
  runs at that car (the path swings across into the lane). Before, at the Red
  Bull Ring, a car slowing just past the entry was invisible to the next car
  in, which hit it at 18 m/s.
* **Race checks** (the old layouts with the old AI → the new layouts with this
  cycle's AI; Node, seeded):
  * Lap 1, 18 circuits × 5 starts: 0 → 0 contacts and wall hits. Time any car
    spends under 8 m/s 4.0 → 1.8 s; COTA's turn-1 queue is gone (slowest car
    7.2 → 16.0 m/s).
  * 6-lap races, 18 circuits × 2 seeds: 0 → 0 contacts, wall hits and spins,
    and every race finished. Changes of running order 69 → 39. The new
    layouts with the old AI gave 36 changes and 16 contacts, so the drop in
    passing comes from the layouts, whose lines leave less room beside them.
  * 3-lap races with the two-compound rule, 18 circuits: 90 stops with no
    contact, off, spin, wall hit, penalty or disqualification.
  * Two-car races, a car 3 m/s faster in corners behind, 5 laps on each of
    18 circuits: passes at 10 → 8 circuits, all without contact (the new layouts
    with the old AI: 7, two of them with contact).
  * Browser: the Monza time-trial check and the Red Bull Ring race check pass.
  * Tests: two new ones fail on the old code. They check faster valid laps at
    Monaco, COTA, Silverstone and Mexico, and three Montreal lap-1 starts
    without contact. The Interlagos dive test failed on the new layouts until
    the yield change.
* **Not changed:** track width (13 m everywhere), elevation (the z data is
  there for a later cycle), walls, kerbs and the pit-lane rules. The DRS zones
  keep their cycle-31 lap fractions, and their test now allows an 80 m line
  radius: Zandvoort's real zone runs through its banked last corner, 87 m on
  the new line.

### Real DRS zones from race telemetry (`circuits.mjs`, `circuit.mjs`, `race.mjs`, cycle 31)

Until cycle 31 every circuit got DRS on its two longest straights. That gave
Monaco zones in the tunnel and up Beau Rivage instead of the one on the pit
straight, Monza one through Curva Grande instead of the back straight, and
two zones everywhere where Bahrain, Jeddah, Miami, Montreal, the Red Bull
Ring and Mexico have three.

- Data: car telemetry (speed and DRS state, about 4 samples a second) from
  the 2024 races in the OpenF1 API, for the first 8 drivers on lap 10: laps
  from lap 4 on, not out-laps, within 3% of each driver's median. Interlagos
  uses 2023 because the 2024 race was wet. Speed integrated over each lap gives lap
  distance as a fraction of the lap. A zone is a stretch where the flap was
  open on at least 15% as many samples as at the busiest point. It opens at
  the 10th percentile of where drivers opened the flap and closes at the 90th
  percentile of where they closed it.
- Timing line: the traced layouts do not start at the real timing line.
  Sliding the real median speed trace along a simulated time-trial lap of
  each trace gives the offset with the best correlation. The correlations were
  0.92–0.99, with offsets of 43–382 m on 16 circuits, 881 m at Monaco and
  2839 m at Silverstone. `circuits.mjs` stores this as `timingLine` and the
  zones as `drs: [[open, close], ...]` lap fractions from that line.
  `createCircuitTrack` converts them to `track.drsZones` in lap progress.
  The simulated lap still starts at the trace's first point; moving it to the
  real line moves the grid, pit lane and turn-1 run. Tried this cycle: the
  lap-1 field then had 130 contacts in 180 starts (Monza 90, Miami 40) and COTA
  queues of 2.1 m/s, so that move is left for later.
- Zones now: 1 at Monaco and Imola; 2 at Shanghai, Catalunya, Silverstone,
  Hungaroring, Spa, Monza, COTA, Interlagos, Yas Marina and Zandvoort; 3 at
  Bahrain, Montreal, the Red Bull Ring, Mexico, Jeddah and Miami. All of them are
  304–914 m long. The tightest racing-line radius inside a zone is 118 m (the
  banked last corner at Zandvoort, which the real zone runs through). Every
  other circuit's tightest is at least 132 m.
- Effect, 6-lap races on 18 circuits with 2 seeds each, before → after:
  0 → 0 contacts, 0 → 0 wall hits, 26 → 16 passes (Monza 7 → 4, Miami 2 → 0,
  Catalunya and Jeddah 2 each both times). DRS-open time over all cars was
  6362 → 6266 s. Time-trial laps (3rd lap) change by −0.1 to +0.4 s (Spa
  125.48 → 125.92 s, Miami 107.15 → 107.43 s, Monaco 90.95 → 91.00 s), with no
  offs. The lap-1 field metrics are unchanged, because DRS opens from lap 3
  and the geometry is untouched.
- Not modelled: the real detection points, which the telemetry does not give.

### Real circuits: time trial (`circuit.mjs`, `circuits.mjs`, `trial.mjs`, cycle 15)

Pick a circuit from the menu in the header, or open `?track=<key>`. The keys
are `monza`, `silverstone`, `spa`, `interlagos`, `red-bull-ring`,
`hungaroring`, `catalunya`, `zandvoort`, `cota`, `monaco`, `bahrain`,
`montreal`, `yas-marina`, `imola`, `mexico`, `jeddah`, `miami` and `shanghai`.
A real circuit opens as a solo time trial: the car starts 150 m before the
line and the lap timer starts when it crosses. **O** (or `?race`) brings in the
AI field for a race (cycle 17, below), with a pit lane beside the start/finish
straight (cycle 26, below).

* **Layouts:** traced centrelines from
  [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT,
  © 2019–2025 Tomislav Bacinger), converted to local metres. Each trace is
  splined, smoothed and scaled to the official lap length. The first point is
  used as the start/finish line. The source order is assumed to be the race
  direction; this was not checked against official maps.
  The traces are approximate. They have no elevation, no camber and no real
  track width: every circuit is 13 m wide. Since cycle 32 the layouts are
  rebuilt from real car positions (above) and only placed on these traces.
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
  way a true minimum-time line does. In hairpins it can cut a tighter apex
  than the centreline; since cycle 24 no line is tighter than 10 m.
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

### Racing the AI field on real circuits (`race.mjs`, cycle 17)

`createRace` accepts a circuit track (`track.kind === 'circuit'`). Open
`?track=<key>&race`, or press **O** on a circuit; the default distance is 3
laps (`?laps=N`). What is the same as on the stadium track: the standing start
(`?nostart` skips it), wakes, car contact, standings, the chequered flag,
classification and fuel. What differs:

* **Grid:** the line is at s = 0. Pole is 0.8 m behind it and the slots are
  `gridSpacing` (8 m) apart, alternating 2.6 m either side of the centreline.
* **Lanes:** measured from the racing line, not the centreline. A passing lane
  (±3 m) is offered only if the road edge leaves it at least 80% of that for the
  next 200 m. Offsets are clamped `edgeMargin` (2 m) inside the road edge. A
  car heads back to the line, when that strip is clear, within 150 m of a corner
  or as its lane runs out of room. Here a corner is where the racing line is
  tighter than 1/300 m⁻¹. New passing moves still stop 60 m before a corner and
  start again 40 m after it.
* **Pace:** each AI driver's corner and braking grip margins scale with its
  spec relative to the player's: latGrip = 0.74 × cornerSpeed / 43 and
  brakeGrip = 0.62 × brakeDecel / 26.
* **Pit lane:** since cycle 26 (below); before that the two-compound rule was
  off on circuits and pit requests were ignored.
* **Fuel:** `fuelPerKm` (0.32 kg per km of lap) instead of the stadium's
  per-lap figure. The autopilot burnt about 0.30 kg/km at Monza, Silverstone,
  Spa and the Red Bull Ring.
* **Retirement:** an AI car that stays below 1 m/s for `retireAfter` (10 s)
  after the start, outside the pits, retires, unless it is facing a barrier and
  can back out (see AI wall recovery).
  It is classified DNF after the running cars, and the race can end without it.
  Retirement applies on the stadium track too.

Changes to the circuit autopilot that the races needed (the time trial uses
them as well):

* **Coasting throttle:** at speed it keeps at least 15% throttle when not
  braking. This cancels the closed-throttle engine braking. Lifting fully in a
  corner, when held up in traffic or catching a slide, made the downshift and
  the engine braking lock the rears and spin the car.
* **Understeer check:** it holds the steering for understeer only when the
  fronts slide more than the rears. Before this, the check also fired during a
  spin and held the steering at zero when the car needed to catch it.
* **Turning round:** when pointing more than 90° away from its target, it
  steers on full lock at no more than 8 m/s until within 60° of the target.
  Without this it drove the wrong way round the lap. When it is facing nearly
  backwards, it turns towards the centreline.

Tyre calibration changed this cycle for all tracks. Before, the medium lost
about 18% of its tread per Silverstone lap, so cars hit the wear cliff after
about four laps. Rear surfaces also climbed past 140–150 °C by lap 5 at Spa,
which spun the field. Two changes:

* `tireWearEnergy` is now 200 MJ (was 40 MJ), about 1.5–3% per lap in the time
  trial.
* Surface cooling to the air is now 12 + 1.6·u W/K (was 0.8·u). Over 5 time
  trial laps the rears level off near 115 °C at Silverstone and 121 °C at Spa.

**Measured** (Node, autopilot with the full 5-car field):

* **Robustness:** 5-lap races at Monza, Silverstone, Spa, Interlagos and the
  Red Bull Ring, 2–3 start seeds each, all finished. There were no spins, no
  wall hits and no contact above 2 m/s, and every car spent under 2.1 s off
  the road.
* **10-lap races:** Monza, Silverstone and the Red Bull Ring finished with no
  contact. These ran with an earlier, larger fuel allowance, and every car
  finished with 5.9–9.3 kg left.
* **Racing:** cars rarely change places. The player's autopilot on pole won
  every race.
* **Time trial:** second laps are now Monza 96.3 s, Silverstone 114.8 s, Spa
  127.0 s, Interlagos 86.8 s and the Red Bull Ring 81.7 s. They are also more
  consistent from lap to lap.
* **Stadium:** the 12 seeded 10-lap races with the two-compound rule all
  finished without contact. The flag fell 2–4 s later than before, because the
  tyres now run cooler.

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

## Verification

Deterministic tests (118 in total across all `*.test.mjs` files) cover the original rest, symmetry, aero/load/force,
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
  than straight-line acceleration. (Since cycle 33, with `tireMu` 2.1, the
  stop differs by 2.3% and the bound is 2.5%.)
* Cycle 4 relaxation: exactly e-fold decay per relaxation length at 240 and 960
  Hz substeps; near-rest floor speed. Step steer at 50 m/s: first-step front force
  is 43% of the instantaneous-tire force (bound 30–45%), 98% after 5 steps, and
  settled yaw rate within 1.8% of the instantaneous tire after 1.5 s (bound 2%).
  63% rise time 13.5 ms at 15 m/s vs 5.2 ms at 60 m/s (ratio 2.6, bound 2.5–5;
  coupled chassis response keeps it below the ideal 4). 240 vs 960 Hz step
  steer: yaw rate 0.43%, lateral displacement 0.55% apart. (Since cycle 33
  the first-step test steers 0.02 rad, which keeps the stiffer loaded fronts
  in the near-linear part of the envelope.)

Cycle 6 thermal tests: thermal grip peaks at 100 °C, is symmetric and floors at
0.8; the two-node model matches its analytic steady state within 0.01 °C at
60/240/960 Hz and relaxes between air and track temperature without input;
locked-wheel sliding heats the tread >5 °C in 1 s while free rolling only cools
it; a 50 m/s stop on 40 °C tires is >10% longer than on 100 °C tires.
`/tmp/f1-thermal-smoke.mjs` checks the per-wheel temperature HUD in Chrome.
Cycle 8 wear tests: wear grip is 1 when new, linear to the cliff, steeper past
it, and clamped at both ends; wear equals sliding energy / tireWearEnergy (40 MJ then, 200 MJ since cycle 17) at
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

Cycle 18 reverse tests (`reverse.test.mjs`, five tests): direction-selection
interlocks, shift torque cut, rear-wheel reverse drive, fuel use/starvation,
no ERS deployment, rev limiter, lifting/braking to rest, forward reselection,
backing away from a nose-on wall, reversed steering yaw, zero-grip wheelspin,
and 240/960 Hz straight-line convergence within 3% in the tested scenario.
All 118 Node tests pass. `/tmp/f1-reverse-smoke.mjs` checked manual reverse,
blocked direction changes while driving, the gear/status HUD, forward selection
and autopilot handover in Chrome on the stadium and Monza, with no page errors.
The temporary browser harness is not a repository test.

Cycle 19 AI wall recovery tests (`recovery.test.mjs`, four tests): a nose-on
stadium beaching that reverses, selects forward and covers more than 800 m;
a car parked behind that blocks the reverse with no contact (the beached car
holds the brakes and retires); fuel-starved and manually driven cars never
reverse; and Monza escapes from both walls. Three of the four fail against the
cycle 18 race code. All 122 Node tests pass. Ad hoc checks: 30 of 30 nose-on
wall placements at Monza, Silverstone, Spa, Interlagos and the Hungaroring
recovered with no wall impact; seeded stadium (10 laps, compound rule), Monza
and Silverstone races finished with no retirements and never triggered
recovery.

Cycle 20 DRS tests (`drs.test.mjs`, six tests): the open flap's drag,
downforce and front-load effects and its 8–20 km/h top-speed gain; actuation
rate and closing on the brakes; a follower within 1 s at the detection point
opens it in the zone while the car ahead does not; nothing before the
enabling laps or with `drs: false`; a driving player opens it only on request
and only where it is allowed; Monza's zones, one of them spanning the start
line. All 128 Node tests pass. `/tmp/f1-drs-smoke.mjs` waited in Chrome for a
car to open DRS on lap 3. It checked that open flaps were allowed and drawn
flat and that the standings showed DRS, with no page errors. The race,
circuit-race, circuit and 3D checks still pass.

Cycle 22 follow tests (`follow.test.mjs`, two tests): `brakeSpeed` matches a
numerical integration of the plan's braking over 20, 80 and 250 m and beats
the flat 18 m/s² law from high speed; in a 2-car, 4-lap Monza race the
follower's detection gap falls by more than 0.4 s, DRS opens for more than
10 s, the car finishes less than 1 s behind and there is no contact. The race
test fails against the cycle 21 code. All 132 Node tests pass, and the
circuit and circuit-race browser checks pass.

Cycle 23 overtaking tests (`follow.test.mjs`, now four tests). The Monza pair
test now expects the faster car to win, with its detection gaps falling by more
than 0.4 s, DRS open for more than 10 s and no contact. A lane-plan test checks
that each ±3 m Monza lane is never below half the racing line's planned speed,
that it is slower than the line at more than 50 samples, and that the
late-braking plan is never slower than the normal lane plan. In a 2-car, 5-lap
Interlagos race a car 2 m/s faster in corners must get alongside on the inside
under braking and win, while the slower car moves to the outside lane, without
contact. Both new tests use functions the cycle 22 code does not have. All 134
Node tests pass. The circuit-race, race and DRS browser checks pass.

Cycle 24 corner-radius test (`circuit.test.mjs`): every bundled circuit's
centreline radius is above 14.5 m and its racing line wider than the car's
turning circle (wheelbase / tan(maxSteer)). With `minRadius: 0`, Monaco's
racing line is tighter than the turning circle. All 135 Node tests pass, and
the circuit browser check passes.

## Next realism milestones

1. Fitted (e.g. Pacejka) curves replacing the
   hand-shaped envelope, pressure, camber and measured brake/tire/thermal parameters.
2. Suspension travel per corner, road elevation, roll-sensitive aero, plank
   wear/friction and porpoising from a measured aero map.
3. Engine/transmission, differential, setup controls, and ERS overtake and
   defend modes (saving energy for an attack) on top of the lap plan.
4. Measured validation targets for acceleration, braking, steady-state cornering,
   and transient handling before making realism claims.
5. Wheel/pedal calibration and
   force feedback, damage, kerb geometry and bumps, race
   rules (safety car, blue flags), undercut/overcut strategy, smarter AI racecraft
   (side-by-side cornering, so the whole grid can launch together) and recovery
   from side-on or gravel beachings (marshals).
6. Real circuits: elevation, camber and surveyed track widths, a minimum-time
   racing line, pit lanes (and the compound rule) on real layouts, AI that can
   overtake there, and car calibration so lap times can be compared with real
   pole times.

## Repository / parity

This repository was initialized from an empty project directory in cycle 1.
No parity directory was supplied in the task or declared in the local tab
registry. Only the primary directory was changed; no mirror path was invented.
`.agent/` contains local agent state and is excluded from version control.
