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
  walls, fence posts, hoardings, start line, gantry, grandstand (pitched to the
  straight's grade), pit apron, box marks and garages sit on it, and every car
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

Not yet (in order):

1. Grade and bank forces in the physics: the cars are only drawn on the hills.
   The physics is still 2D, so climbs, descents and banked corners do not yet
   change speed or grip.
2. Scenery: stands with membrane roofs, pit building, villages, wildlife and a
   reflective lake (`scenery.js`, `animals.js`, `water.js`). These use TSL node
   materials and would have to be rewritten for our WebGL renderer.
