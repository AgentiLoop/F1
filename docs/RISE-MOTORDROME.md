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
  Played flat for now, like every circuit here.

Not yet (in order):

1. Elevation and banking: the data carries altitude (1,363.5-1,415 m) and
   bank per 5 m. Our physics and world are flat (2D track model), so this
   needs heights in `world3d.mjs` (road, verges, car y / pitch / roll) first,
   then grade and bank forces in the physics.
2. Scenery: terrain with the lake basin, reflective lake, stands with membrane
   roofs, pit building, trees, villages, wildlife (`terrain.js`, `water.js`,
   `scenery.js`, `trees.js`, `animals.js`). These use TSL node materials and
   would have to be rewritten for our WebGL renderer.
