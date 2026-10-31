# AgentiLoop Racing • F1 Dynamics Lab • ProtoType III

**Play it in your browser: [f1.gokart.games](https://f1.gokart.games)**

<img width="1945" height="1149" alt="Screenshot 2026-10-19 at 6 55 02 PM" src="https://github.com/user-attachments/assets/3438bf84-d85a-4ff9-beeb-89b3ecfdd493" />

Race an open-wheel car against an AI field in 3D, on a stadium test track or on
18 real circuits (Monza, Silverstone, Spa, Monaco and more, with layouts and
hills built from real car positions: Spa climbs 100 m, the Red Bull Ring 63 m; Zandvoort's 19° and 18° banked corners and Jeddah's 12° Turn 13, and each venue's own setting: Spa's conifer forest,
Monza's park, palms and sand at Bahrain, Jeddah and Yas Marina, the dunes at
Zandvoort, the real buildings from OpenStreetMap (Monte Carlo's apartment blocks,
the grandstands, raked with seated crowds and set back behind our barriers where they stand nearer, and pit buildings, the towns around Interlagos and Mexico City), and the real lakes, ponds,
rivers and basins from OpenStreetMap: Montreal's Olympic Basin and St. Lawrence, Interlagos's lakes,
Imola's Santerno, Miami's canals; the real woods, tree rows and single trees from OpenStreetMap; the real land cover from OpenStreetMap: Hungary's and Imola's farmland, Monza's park lawns, Zandvoort's dune heath, gravel traps, car parks and paddocks, which also set the surface beside the road: run wide into a mapped gravel trap and it grips less and drags the car down, paved run-off keeps its grip; the real roads and streets around each circuit from OpenStreetMap: Monte Carlo's streets, Mexico City's and São Paulo's neighbourhoods, the roads through Monza's park and the motorways past Miami and Mexico City; the real walls, fences, hedges, guard rails and railway lines from OpenStreetMap: Silverstone's hedgerows, Monte Carlo's walls, the railway past Shanghai and through Monza's park; the real ground around each circuit from open elevation data: the Ardennes valleys round Spa, the Styrian hills above the Red Bull Ring, the mountainside behind Monaco; and the real coastline: the North Sea at Zandvoort, the Red Sea along Jeddah's Corniche, Port Hercule inside Monaco's lap, the marina at Yas Marina), plus the planned RISE Motordrome in Rwanda
([?track=rwanda](https://f1.gokart.games/?track=rwanda), layout, hills, banking
and lake from the RISE Motordrome sim, with its East African trees, membrane-roofed grandstands and pit building; see [docs/RISE-MOTORDROME.md](docs/RISE-MOTORDROME.md)). It has a standing start, pit stops and tyre
compounds, fuel, ERS and DRS, an automatic or paddle-shift gearbox, plus engine
and tyre sound made from the physics. Drive from the chase or cockpit camera,
where the car's mirrors show the cars behind you. It needs a WebGL browser and
plays with a keyboard or an Xbox (or other standard) controller, with analog
triggers and sticks. See [How to play](#how-to-play) and the
[controls](#controls). Useful URLs:
[a race at Monza](https://f1.gokart.games/?track=monza&race),
[the Spa time trial](https://f1.gokart.games/?track=spa).

A playable browser testbed for an open-wheel vehicle model, rendered in 3D with
Three.js (r170, vendored under `vendor/`, MIT licence in `vendor/LICENSE-three`).
**Prototype, not a validated Formula 1 simulator.** All vehicle parameters are
illustrative assumptions, not measured F1 data or a season's regulations.
3D models and textures keep their own licences; see `models/CREDITS.md`.

## Run

From this directory, run `python3 -m http.server 5188 --bind 127.0.0.1`, then open
`http://127.0.0.1:5188`. ES modules require HTTP; do not open the HTML as a file.
Game modules live in `src/`, tests in `test/`, and Three.js is served from `vendor/`, so there are no runtime downloads, npm
dependencies, or bundler. A WebGL-capable browser is required.

Run validation with `node --test` (runs every `test/*.test.mjs` file).
Node's built-in test runner is the only test dependency.

The site is a Cloudflare Worker that serves only static assets (`wrangler.toml`).
`zsh tools/publish.sh` publishes the committed `main` branch to f1.gokart.games
(via `git archive`, which stamps the version shown in the header subtitle from
`git describe --tags`). Files listed in `.assetsignore` (tests, tools, this
README, desktop) are not uploaded.

### Desktop apps (web-thin)

Each [release](https://github.com/AgentiLoop/F1/releases) has small "web-thin"
apps that open f1.gokart.games in their own window, with no browser tabs or
address bar. They bundle no game files, so they need an internet connection and
always run the latest deployed version.

* **macOS 13+** (`AgentiLoopF1-web-thin-<v>-mac-universal.zip`): a WebKit app,
  Apple silicon and Intel, signed with Developer ID and notarized.
* **Windows 10 / 11** (`…-win.zip`): opens the game in a Microsoft Edge app
  window. Unzip and run `Install.cmd`.
* **Linux x64 / arm64, Raspberry Pi included** (`…-linux.tar.gz`): opens the game
  in a Chrome or Chromium app window (installs one if needed). Run `install.sh`.

Build them with `desktop/macos/build-web-thin.sh notarize`,
`desktop/windows/build-web-thin.sh` and `desktop/linux/build-web-thin.sh`
(output in `desktop/release/`).


## How to play

* **Pick a circuit** from the menu at the right of the header. The stadium
  test track opens as a race against four AI cars (10 laps). A real circuit
  opens as a solo time trial; press **O** (or add `?race`) to race the field
  there (3 laps by default).
* **Take the wheel.** Every session starts on autopilot, so the car drives
  itself until you take over. Press **P** (gamepad right-stick click), touch
  a gamepad, shift gear, or pick a grid slot on the start lights and you are
  driving. P (or the *Autopilot* button) hands the car back at any time.
* **The start.** Five red lights come on one per second, then go out after a
  random 0.2–3 s hold. Stay still until they go out: moving more than 0.5 m
  early is a jump start (+5 s). While the lights are on, **1–5** (gamepad
  **LB / RB**) move you into the car on that grid position (1 = pole); that car
  takes your old slot and you drive on in its colours.
* **The race.** The timing box shows your position and lap, the side panel
  the order with intervals, tyres, fuel and penalties, and the minimap at the
  bottom left every car on the layout. At the chequered flag the panel shows the
  classification; R starts a new race.
* **Tyres and pit stops.** You start on mediums (`?tyre=soft|hard` to change).
  In a race every finisher must run two compounds, so you must stop once or be
  disqualified. **B** cycles the pit request (Soft → Medium → Hard →
  cancel). On autopilot the car boxes at the next pit entry. When you drive,
  take the pit lane (on the inside of the stadium's main straight; on a real
  circuit on the side and stretch of the start/finish straight where the real
  pit lane runs, from OpenStreetMap),
  keep to the 80 km/h limit (+5 s for speeding) and stop on your box, the first
  one, painted green. The crew holds you until it is safe to leave.
* **DRS.** Hold **F** (keyboard only). In a race it opens from
  lap 2, in a DRS zone, when you were within 1 s of the car ahead at the
  detection point; any braking closes it. In a time trial it is free in the
  zones. The HUD shows when it is available and when it is open.
* **Fuel and ERS.** Each car carries the fuel for the race distance and gets
  lighter as it burns off. The hybrid store deploys up to 120 kW whenever you
  are on the throttle above 100 km/h, within 4 MJ a lap, and recharges under
  braking.
* **Gears.** The gearbox is automatic. **X / Z** (gamepad **RB / LB**) shift
  up / down and switch your car to the manual gearbox (an M shows beside the
  gear; the gear flashes red when a shift is refused, e.g. a downshift that
  would over-rev). **G** (gamepad left-stick click) goes back to automatic,
  as does handing the car to the autopilot.
* **Reversing.** Stopped and pointing at a wall? Hold the brake: once the car
  is still it selects reverse (the HUD shows **R**) and the brake pedal backs
  it up. In reverse the throttle brakes, and holding it at a stop selects
  forward again. This works the same with keys or gamepad. Q / E still select
  reverse / forward explicitly (stopped, on the brake, off the throttle).
  Brake-to-reverse is off on the start lights.
* **Off track.** Kerbs, run-off and grass have less grip, and a lap with all
  four wheels past the road edge is deleted. Walls are solid: there is no
  damage, but you lose time. R resets the car (and restarts the race).

## Controls

### Keyboard

| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake (held at a standstill: reverse) |
| A D / ← → | Steer |
| X / Z | Shift up / down (manual gearbox) |
| G | Automatic gearbox |
| F (hold) | DRS |
| Q / E | Select reverse / forward (stopped, on the brake) |
| B | Pit request: Soft → Medium → Hard → cancel |
| 1–5 | On the start lights: drive the car on that grid position |
| P | Autopilot on / off |
| I | Driver assist (traction control + ABS) on / off; on by default. Real F1 cars have neither |
| Space | Pause / resume |
| R | Reset (restarts the race from the grid) |
| C | Camera: chase → close chase → cockpit → driver → halo → T-cam |
| V | Overview / chase camera |
| H | HUD on / off |
| M | Sound on / off (audio starts on the first key press or click) |
| O | Opponents on / off (restarts) |
| L | Racing-line chevrons (real circuits): off → whole line → braking zones only. Green: keep going; amber: braking soon; red: brake now for the corner ahead at your speed (`?line=1` or `?line=2` starts with them on) |
| T | Time of day on the RISE Motordrome: dawn → day → sunset → night race (`?time=night` etc. starts there) |

Keys are on/off, so the pedals and steering ramp (see
[Driver input](docs/DEVLOG.md#driver-input-inputmjs-cycle-7)). The header buttons do the
same as their keys (plus *Units* km/h ↔ mph and *Full screen*). Driving keys are
ignored while a button has focus; click the 3D view to drive again. Losing
window focus or hiding the tab pauses and releases every held input.

### Xbox controller (and other standard gamepads)

Any controller the browser reports with the W3C **standard** layout works:
Xbox Wireless / Series / One pads, and PlayStation or other pads that use the
same layout (PlayStation names in brackets). The first standard pad found is
used. Browsers only expose a pad after one of its buttons is pressed; the first
time a pad appears it takes the car from the autopilot (once per page load;
P still switches the autopilot afterwards).

| Control | Action |
|---|---|
| RT (R2) | Throttle, analog |
| LT (L2) | Brake, analog (never selects reverse) |
| Right stick forward / back | Throttle / brake, analog (alternative to the triggers); back, held at a standstill: reverse |
| Left stick | Steer, analog |
| D-pad ↑ / ↓ | Throttle / brake (on/off, with the keyboard ramps) |
| D-pad ← / → | Steer (on/off, with the keyboard ramps) |
| RB / LB (R1 / L1) | Shift up / down (manual gearbox); on the start lights: the grid slot behind / ahead |
| Left-stick click (L3) | Automatic gearbox |
| Right-stick click (R3) | On autopilot: autopilot off (take the wheel); driving, hold: full brake |
| A (Cross) | Driver assist (traction control + ABS) on / off |
| B (Circle) | Camera: chase → close chase → cockpit → driver → halo → T-cam |
| X (Square) | Full screen on / off (where the browser supports it) |
| Y (Triangle) | Pause / resume |
| Menu ≡ (Options) | HUD on / off |
| View ⧉ (Share / Create) | Reset car (restarts the race) |

* Triggers and sticks have an 8% deadzone with the remaining travel rescaled;
  the steering stick has a 1.5 power curve for finer control near centre.
  Steering authority falls with speed, as for the keyboard.
* Keyboard and gamepad can be used together: the larger pedal value wins, and
  a held steering key or D-pad direction overrides the stick.
* Buttons act once per press. R3 only turns the autopilot off; to hand the
  car back to it use P. DRS, pit request, overview camera, sound, opponents and units have
  no gamepad button; use F, B, V, M and O on the keyboard (Units: the header button).
* Rumble mixes separate effects, each with its own motor and rhythm: engine
  throb, limiter chop, gear-shift thumps, tyre scrub, wheelspin, lockup
  judder, dirty-air buffet, kerbs (alternating motors per stripe), grass,
  gravel, wall crashes (a slam, then shaking) and car contact. Any event ducks
  the engine bed so it stands out. Impulse triggers are used where the browser
  supports them, otherwise trigger effects go to the motors; single-motor
  Atari joysticks get everything on their one motor.
* There is no button remapping or calibration. Racing wheels and pads
  that report a non-standard layout are ignored.

### URL options

| Option | Effect |
|---|---|
| `?track=<key>` | Real circuit (time trial); keys are listed [in the development log](docs/DEVLOG.md#real-circuits-time-trial-circuitmjs-circuitsmjs-trialmjs-cycle-15) |
| `&race` | Race the AI field on a real circuit |
| `?laps=N` | Race distance (default 10 on the stadium, 3 on a real circuit) |
| `?tyre=soft\|medium\|hard` | Start compound |
| `?nostart` | Skip the start lights |
| `?car=procedural` | The built-in procedural car instead of the RB22 |

For example [a race at Monza](https://f1.gokart.games/?track=monza&race) or
[a 5-lap race at Spa on softs](https://f1.gokart.games/?track=spa&race&laps=5&tyre=soft).

## The side panel

The panel on the right shows only what you need while driving; **H** (or the
*HUD* button) hides it. Top to bottom:

* **Speed and gear.** An **M** beside the gear means the manual gearbox; the
  gear flashes red when a shift is refused. The two bars under the speed are
  the throttle and brake commands, labelled with their source (keyboard,
  gamepad or autopilot).
* **Last / best lap and sectors.** Sector bars: purple = session best, yellow =
  slower. A lap is deleted (shown in red) when all four tires are beyond the
  road edge.
* **Race order.** Interval to the leader, the current tyre compound, and
  flags for pit stops (PIT), penalties, retirements (OUT) and an open DRS.
  At the flag it becomes the classification. Hidden when opponents are off.
* **Car.** Longitudinal / lateral g, downforce, the ERS store (with the
  current deploy (+) or harvest (−) power) and the energy deployed this lap
  against the 4 MJ limit.
* **Tyres** (FL / FR / RL / RR; hidden on short or narrow screens). Tread
  temperature and its thermal grip factor (blue cold, green near the 100 °C
  optimum, red hot); a bar of force / peak capacity (not remaining grip); and
  tread wear with its wear grip factor (amber above 37.5%, red above 75%).

### Physics notes (illustrative values)

* **Opponents.** Four AI cars run the same physics. Following within ~30 m
  gives a tow (up to 35% less drag) but dirty air (up to 25% less downforce);
  cars collide as rigid footprints.
* **ERS.** The MGU-K adds up to 120 kW on the throttle above 100 km/h, at most
  4 MJ a lap from a 4 MJ store; braking harvests up to 120 kW (2 MJ a lap) and
  the MGU-H recharges the store from the exhaust.
* **DRS.** Open, it cuts drag 12% and downforce 10% (rear only).
* **Driver input.** Keyboard pedals ramp in ~0.17 s and release in 0.1 s;
  keyboard steering moves toward lock at 3/s and returns at 5/s. Gamepad
  triggers are analog pedals; the left stick steers with a deadzone and a
  progressive curve. Steering authority falls with speed for both.
* **Tyres.** Beyond the force peak (SLIDE) the force falls toward 75% of peak.
  The relaxed slip angle catches up with the kinematic one over 0.45 m of
  travel. Two-node thermal model (tread / carcass): sliding heats the tread,
  airflow cools it; tires start at 70 °C (blanket temperature). Sliding energy
  wears the tread (faster above the optimum); grip fades, then falls off a cliff
  past 75% wear. No pressure or camber model, no ABS or traction control.
  Compounds (assumed): soft +1.5% grip and 2× wear, hard −1.5% grip and 0.55×
  wear relative to the medium; a pit stop fits a new set at blanket temperature
  after a 2.1–3.2 s service. R fits new tires.
* **Body.** Roll, pitch and aero squat are damped spring modes for display;
  wheel loads are still quasi-static.
* **Surfaces** (assumed grip): kerb 90%, run-off 70%, grass 35%, gravel 45%
  plus a ploughing drag of 25% of each wheel's load. On the real circuits the
  ground beside the road follows its OpenStreetMap land cover (sand and gravel
  traps, grass and fields, paved run-off).
* **Walls** are rigid: the body footprint rebounds with 25% restitution and
  scrubs with friction 0.5; no damage model.
* **Sound** is synthesized from engine rpm, throttle, turbo spool, tire
  sliding power and speed (V6 firing frequency; no recorded samples).

Illustrative, uncalibrated dynamics: a handling testbed, not a validated F1
simulator.

## More documentation

* [docs/PHYSICS.md](docs/PHYSICS.md): the vehicle model (tyres, aero, load transfer, temperature, wear, sound), the stadium track and walls, and the 3D car and cockpit camera.
* [docs/DEVLOG.md](docs/DEVLOG.md): per-feature notes by development cycle (AI, race rules, pit stops, fuel, ERS, DRS, real circuits), test verification, and the roadmap.

## Credits

Thanks to everyone whose work this game builds on. Each item below keeps its own
licence; this project's licence does not cover it.

### The African track: RISE Motordrome (Rwanda)

The `?track=rwanda` circuit and its world are adapted from Simon Smyth's
**"African Grand Prix" RISE Motordrome browser sim**
([github.com/mrsmickers/rise-motordrome](https://github.com/mrsmickers/rise-motordrome),
write-up at [simonsmyth.me](https://simonsmyth.me)), a sim of the planned
circuit at Bugesera, Rwanda.

* **Data taken from it:** the 6.0 km, 17-turn layout, its altitude and banking,
  the lake level and the lake outline (its `js/track-data.js` and `LAKE_BLOBS`),
  imported by `tools/import_rise.mjs` into the `'rwanda'` entry of
  `src/circuits.mjs`; its corner positions in `src/structures.mjs`; and its
  sky, time-of-day and night-light values in `src/sky.mjs`.
* **Our own WebGL code, written after its WebGPU/TSL code:** the terrain and lake
  (`buildTerrain` in `src/world3d.mjs`, `src/lake.mjs`, after `js/terrain.js` and
  `js/water.js`), the trees (`src/savanna.mjs`, after `js/trees.js`), the
  wildlife (`src/wildlife.mjs`, after `js/animals.js`), the grandstands, pit
  building, footbridges, floodlights, paddock, villages, boards, marshal posts,
  billboards and lakeside pods (`src/stands.mjs`, `src/structures.mjs`,
  `src/lakeside.mjs`, after `js/scenery.js`), the sky and times of day
  (`src/sky.mjs`, after `js/sky.js`), the racing-line chevrons
  (`src/chevrons.mjs`, after `js/chevrons.js`), and the rubbered line, grid
  slots and mowing stripes (`src/trackpaint.mjs`, after `js/trackmesh.js`).
* Its sponsor branding is replaced by ours throughout.
* That repository does not state a licence. See
  [docs/RISE-MOTORDROME.md](docs/RISE-MOTORDROME.md) for exactly what was
  borrowed and how.

### Real circuits

* **Layouts, heights and DRS zones** (`src/circuits.mjs`, `tools/import_elevation.mjs`):
  car positions and telemetry from the [OpenF1 API](https://openf1.org)
  (api.openf1.org), 2024 races (2023 at Silverstone and Interlagos).
* **Traced circuit layouts** (how each circuit is tied to the globe,
  `tools/osm_frame.mjs`): [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)
  GeoJSON, MIT License, Copyright (c) 2019-2025 Tomislav Bacinger.
* **Banking** at Zandvoort (Turns 3 and 14) and Jeddah (Turn 13)
  (`tools/import_banking.mjs`): the published design angles.
* **Water, sea, buildings, woods, land cover, roads, walls, fences, hedges,
  railways, bridges, viaducts, tunnels and pit lanes** (`src/water.mjs`,
  `src/coast.mjs`, `src/buildings.mjs`, `src/woods.mjs`, `src/landcover.mjs`,
  `src/roads.mjs`, `src/barriers.mjs`, `src/bridges.mjs`, `src/tunnels.mjs`,
  `src/pits.mjs`): [OpenStreetMap](https://www.openstreetmap.org/copyright),
  © OpenStreetMap contributors, under the ODbL, fetched through the Overpass API.
* **The ground around them** (`src/terrain.mjs`): the Mapzen/AWS Terrain Tiles
  (open data from SRTM, NED, EU-DEM, ETOPO1 and others; see
  [tilezen/joerd attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)).

### 3D models and textures

Full details in [`models/CREDITS.md`](models/CREDITS.md).

* **Car:** "2026 Redbull RB22" by **Tyler_Dave** (Sketchfab),
  [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Modified: the Red Bull
  livery is replaced at load time with each car's colours and our sponsor names,
  the wheels and steering wheel are split out and animated, the model is fitted
  to the physics car, and the gold fastener discs in its detail texture are
  painted over (`src/rb22.mjs`).
* **Asphalt:** ["Asphalt Track"](https://polyhaven.com/a/asphalt_track) by
  **Dimitrios Savva** (Poly Haven), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  Modified: scaled to 1024×1024.

### Code libraries (vendored in `vendor/`)

* **[Three.js](https://threejs.org)** r170 (`three.module.js`), MIT licence
  (`vendor/LICENSE-three`).
* **Three.js addons** `GLTFLoader.js`, `BufferGeometryUtils.js` and
  `RoomEnvironment.js` (three.js r170, MIT). Modified: the loader and geometry
  utilities import `./three.module.js`. `RoomEnvironment.js` is three.js's port
  of the environment scene from Google's
  [model-viewer](https://github.com/google/model-viewer).
* **[meshoptimizer](https://github.com/zeux/meshoptimizer)** decoder
  (`meshopt_decoder.module.js`), MIT, © Arseny Kapoulkine.
* The small seeded random-number generator in `src/savanna.mjs`,
  `src/structures.mjs` and `src/wildlife.mjs` is the public-domain **mulberry32**
  by Tommy Ettinger.

