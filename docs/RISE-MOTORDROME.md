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
  within 160 m of the road cast shadows. No wind sway yet.
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

Not yet (in order):

1. Grade and bank forces in the physics: the cars are only drawn on the hills.
   The physics is still 2D, so climbs, descents and banked corners do not yet
   change speed or grip.
2. Scenery: paddock pavilions, footbridges, floodlights, villages and wind sway
   in the trees (the rest of `scenery.js` and `trees.js`). These use TSL node
   materials and would have to be rewritten for our WebGL renderer.
