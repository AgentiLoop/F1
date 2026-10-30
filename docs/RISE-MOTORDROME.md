# RISE Motordrome (planned African Grand Prix, Bugesera, Rwanda)

Source: the "African Grand Prix" browser sim (v0.18 beta, write-up at
simonsmyth.me, GitHub `mrsmickers/rise-motordrome`), checked out at
`~/Downloads/rise-motordrome-main`. It is three.js too (WebGPU / TSL with a
WebGL 2 fallback), against our vendored three.js r170 on WebGL.

## Did it use our code? (audit, 2026-10-30)

- **The car model, yes, with credit.** Its `models/rb22.glb` is byte-identical
  to ours (SHA-1 `c29dae45b76f3dd1a7fd2445770fc79921ed2d35`). Its
  `models/CREDITS.md`, `js/car-model.js` header and the credits line in its
  `index.html` say the copy comes from github.com/AgentiLoop/F1 and keep the
  CC BY 4.0 credit to Tyler_Dave. Only the model file is reused; the livery
  code is its own (`js/car-model.js` uses TSL node materials, not our
  `src/rb22.mjs` canvas repaint).
- **No source code.** A normalised line-by-line comparison of every
  `js/*.js` and `index.html` against our `src/*.mjs` and `index.html` (lines of
  35+ characters, comments and imports skipped) finds 11 shared lines out of
  3,028, all generic: three.js `BufferGeometry` / `setAttribute` boilerplate,
  `updateMatrixWorld(true)`, a triangle loop header, and the standard
  mulberry32 PRNG return line. Physics, track model, racing line, audio,
  cameras and HUD are written independently (different structure, names and
  units).
- **Licence.** The repository has no LICENSE file, and its README does not
  state one, so by default its code and data are all rights reserved. Ask the
  author before publishing anything taken from it.

## What we borrow

Done:

- **Layout** (`'rwanda'` in `src/circuits.mjs`, made by
  `node tools/import_rise.mjs <rise>/js/track-data.js`): its 6.0 km,
  17-turn centreline (5 m samples, x east / z south), rotated to start on its
  start line (80.1 m) and written every 10 m as east/north metres. Road width
  15 m (that sim runs 15-19 m). DRS zones are placed by hand on the main
  straight and the back straight (capped at 900 m); there is no race telemetry.
- **Elevation and banking, drawn** (`heights`, `banks` and `lakeLevel` on the
  `'rwanda'` entry, also from `tools/import_rise.mjs`): its altitude every 10 m
  as metres above its 1,390 m base and its cross-slope (height gained per metre
  to the left), carried onto our 2 m samples by lap fraction and lightly
  smoothed (`src/circuit.mjs`: `elevation(s, offset)`, `heightAt(x, y)`). Like
  that sim, the ground beyond the road edges falls 2%. The road, kerbs, runoff,
  walls, fence posts, hoardings, start line, gantry, grandstands, pit building,
  pit apron and box marks sit on it, and every car
  is drawn at the ground height under it, pitched and rolled to the slope, with
  the chase camera and sun following.
- **Terrain and lake** (`buildTerrain` in `src/world3d.mjs`, our own WebGL
  code): a height field 6 m apart over the circuit (coarser further out) that
  sits 0.25 m under the road surface and verges, eases into rolling ground 4-150
  m beyond the barriers, rises to hills towards the horizon and dips into the
  lake. The lake outline is that sim's `LAKE_BLOBS` (discs joined by a smooth
  union) at its 1,356 m level, with a ragged shore of our own; the banks ease
  down to the water over about 140 m as in that sim. Grass, dry grass, red
  laterite on steep ground, sand on the shore.
- **Vegetation** (`src/savanna.mjs`, our own WebGL code after that sim's
  `js/trees.js`): its five species, flat-topped acacia, broadleaf, tall
  eucalyptus, shrub and papyrus, as leaf cards cut out of one canvas leaf atlas
  (broad leaves, fine acacia foliage, bark) with instanced meshes per species.
  Placement follows its rules: forest patches and clumps from noise, gallery
  forest along the lake shore, open acacia savanna far from the road, papyrus
  on the shore and in the shallows, nothing within 10 m of the barriers or
  beside the start straight's stand and garages. About 4,400 trees; those
  within 160 m of the road cast shadows. They sway in the wind as in
  `trees.js`: a slow lean that grows with the square of height (crowns three
  times the wood), each tree on its own phase, leaves fluttering on top; done
  in the vertex shader, so it costs no CPU time. Shadows keep the still shape.
- **Grandstands and pit building** (`src/stands.mjs`, our own WebGL code after
  that sim's `js/scenery.js`): its four 112 m, 30-row grandstands at -185, -62,
  62 and 186 m from the line, across the straight from the pits, each under a
  white membrane roof with rounded ends, scalloped edges and soft pillows (its
  `puffyRoof` shape) on three columns, pitched to the ground's fall along the
  front edge. Spectators in its shirt colours are painted on the risers from a
  canvas texture (four seat bands, about one seat in eight empty) instead of
  its node shader. Its pit building replaces our per-box garages: 20 m deep and
  15 m tall, from 60 m before the first box to 60 m past the last, bent along
  the straight and stepped down to the ground; garage doors with a faint glow
  below a glazed band split by a floor slab, a roof terrace over the pit lane
  and our AgentiLoop Racing sign on its edge (theirs carries their brand).
  Other circuits keep the old stand and garages.
- **Wildlife** (`src/wildlife.mjs`, our own WebGL code after that sim's
  `js/animals.js`): its Akagera species, giraffe, elephant, zebra, impala and
  hippo, built from simple shapes, one instanced mesh per species. Herds sit
  wholly beyond the barriers, away from the start straight, on gentle ground
  where the driver sees them ahead over the terrain; hippos lie 7-40 m out on
  the lake. Their ranges and a view corridor from the track are kept clear of
  trees. Each animal walks to a new spot in its herd's range, stops and grazes;
  the legs swing, heads dip, trunks and tails sway, and the coats (giraffe
  patches, zebra stripes, impala and hippo bellies, wrinkled skin) are drawn in
  a patched MeshStandardMaterial instead of its node shader. About 85 animals.
- **Reflective lake** (`src/water.mjs`, our own WebGL code after that sim's
  `js/water.js`): a planar mirror of the scene (a mirror camera with its near
  plane tilted onto the water, rendered at 45% resolution just before the lake
  is drawn in the main view) broken up by three layers of drifting wind-ripple
  noise, blended by Fresnel from the dark lake colour to the reflection, with a
  sun glint; plus its 46 papyrus islands (same seed, sizes and spacing, 30-260
  m out from the shore). Its TSL nodes are re-done as a GLSL ShaderMaterial
  with our fog and tone mapping. The rear-view mirror shows the last frame's
  reflection rather than drawing its own.
- **Racing-line chevrons** (`src/chevrons.mjs`, after that sim's
  `js/chevrons.js`; every real circuit, not only this one): an arrow painted
  every 5 m along the racing line, pointing along it and lying on the road's
  grade and bank. Near the car (700 m) the colour follows the speed it carries:
  green, amber in the 60 m before braking must start, red from there to the
  slowest point of the corner, where the start comes from your speed, the
  speed plan of the autopilot that drives your car and its braking curve.
  Further on they show the line's usual braking zones. L (or the Line button)
  cycles off / whole line / braking zones only; `?line=1` or `?line=2` starts
  with them on. Off by default. Their TSL material is re-done as a GLSL
  ShaderMaterial, not tone mapped (its 1.8× colour boost washes out to pastel
  through our ACES curve).
- **Footbridges, floodlights, paddock and villages** (`src/structures.mjs`,
  our own WebGL code after the rest of that sim's `js/scenery.js`): its two
  footbridges (135 m before the line, linking the pit building and the first
  grandstand, and on the crest before Turn 8), each a concrete deck 7.5 m over
  the road's centre with steel rails, piers just outside the barriers and our
  AgentiLoop Racing banner on both faces (theirs carries their sponsor);
  159 floodlight masts, 24 m tall, every 34 m on alternating sides 4.5 m
  behind the barrier, lamp heads facing the road, none along the start
  straight, the pit lane, under the bridges or in the lake; its paddock
  behind the pits: the 64 m cone tower with a helical rib (a canvas texture
  instead of its node shader), 23 white tensile domes and 12 thatched huts
  (its rules: 52-187 m behind the pits, 9 m apart); and its villages, about
  390 small houses in clusters 650-1700 m out (its rules, in the same world
  frame: 220 m or more from the road, 60 m from the lake; the random draws
  are ordered differently, so the exact spots differ), plastered, brick or blue walls
  under tin or tile roofs. Trees are kept out of all of them. They glow at
  night (see times of day), except the village houses.
- **Braking boards, corner numbers and marshal posts** (`src/structures.mjs`,
  after that sim's `buildBoards` and `buildMarshalPosts`): 3, 2 and 1 boards
  (white, 1.1 x 1.45 m on two legs) 370, 270 and 170 m before its seven
  heavy-braking corners (Turns 1, 3, 4, 8, 12, 14 and 17), on the run-off 3.5 m
  beyond the road edge on the outside of the approach; a yellow 2.2 m corner
  number on a post 1.5 m behind the outside barrier 25 m before each of its 17
  corners; and 17 orange-and-white marshal posts every 330 m, 2.2 m behind the
  barrier on the outside of the bend (switched across at the pit lane, none on
  the start straight). All face the approaching cars, at that sim's corner
  positions (its `track-data.js`, shifted by our 80.1 m start).
- **Raised billboards** (`src/structures.mjs`, after that sim's
  `buildBillboards`): a 22 x 6.9 m board (its 3.2 : 1) 3.5 m up on two steel
  posts, 5 m behind the outside wall 5 m past Turns 3, 8, 12 and 17, turned to
  face the braking zone 150 m back up the track; none in the lake. Both faces
  carry our AgentiLoop Racing logo (theirs carries their sponsor) and glow at
  night like its sign material (0.55, halved to 0.28). Trees are kept out.
- **Lakeside hospitality pods and jetties** (`src/lakeside.mjs`, after that
  sim's `buildLakeside`): round pods with plastered walls and thatched cone
  roofs on wooden decks, each with a 34 m plank jetty out over the water, on
  its rays from the lakeside lobe's centre (at least 25 m from the road, 26 m
  apart, its radii from mulberry seed 7). Our banks near the road are steeper
  than its, so each pod stands on the waterline itself, its deck 1.2 m over
  the water and its back set into the bank (at most 4 m higher), not 14 m back
  from the shore; 16 pods, every jetty clear of the lake bed. Trees are kept
  out of them; their walls glow warm at night.
- **Times of day** (`TIMES` in `src/sky.mjs`, after that sim's `PRESETS` in
  `js/sky.js`): Dawn 06:30 (low orange sun in the east), Day 10:30, Sunset
  17:45 (low sun over the lake in the west) and Night race 21:00 (dark sky with
  twinkling stars and a faint band of glow, no sun disc, a cool overhead light
  standing in for the floodlights, whose lamp faces glow). Each sets the sun's
  direction, colour and strength, the hemisphere light, reflections, fog and
  exposure and the sky dome's colours and clouds; its light levels are scaled
  to ours and its exponential fog turned into our linear fog's distance. Day
  keeps this game's own lighting. T (or the Time button) cycles them on this
  circuit; `?time=dawn|day|sunset|night` starts there. A switch fades over
  2.2 s with a smoothstep like the sim's (`lerpTime` / `TIME_BLEND`): colours,
  light levels, fog, clouds, stars and night glow blend, the sun swinging over
  the top rather than through the ground; the button shows the new time at
  once. No night sounds.
  At night the sim's emissive night terms light up the buildings
  (`nightGlow` / `setNightGlow` in `src/sky.mjs`, at half its strength,
  as our night light is about half its): the grandstand seats and crowd
  (0.22) and membrane roofs (0.28), the pit building's garages and windows
  (0.35 by day, 1 at night), the paddock tower (0.2) and pavilion domes
  (0.18), the braking boards (0.4) and corner numbers (0.3) and the lakeside
  pods' walls (0.25), besides the floodlight lamp faces (4). Left out: the
  tower's glowing helix ribs (it glows evenly) and the sim's dim glow on a
  few village houses (0.12 on some of them).
  The floodlit circuit (its `js/trackmesh.js` and `js/terrain.js` flood
  terms, flood 0.34 halved to 0.17 x their factor, in `buildCircuitWorld` /
  `buildTerrain` in `src/world3d.mjs`): at night the road, white edge lines
  and pit lane (x1.1), kerbs and painted run-off (x1) and walls and TecPro
  (x0.8) give off their own colour, and the ground gets a spill fading from
  5 m to 160 m off the centreline (a per-vertex `flood` attribute). Left out:
  its per-tree floodlight term and its darkening of the ground far from the
  circuit.

Not yet: the rest of `scenery.js` (airport). Its sponsor boards along the
wall faces are covered by our own hoardings every 36 m.
Grade and bank forces in the physics were added in 1fc5c16.
