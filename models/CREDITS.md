# 3D model credits

The project code's licence does not cover these files; each keeps its own licence.

## rb22.glb

- Model: "2026 Redbull RB22" by Tyler_Dave (Sketchfab)
- Licence: [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
- Changes: `rb22.mjs` replaces the Red Bull livery at load time: the paint texture is refilled
  in each car's colour, the decal texture is cleared, our sponsor names (AgentiLoop Racing,
  InkPen.io, SuperBox64.com, AgentiLoop.si, github.com/AgentiLoop/F1) and a race number are
  projected onto both, the accent-coloured parts take the car's accent colour and the race
  number mesh is hidden. It also splits the wheels per corner, turns the model's steering
  wheel with the steering and fits it onto the physics car's axles. Every car on the grid
  uses it. In the model file itself, the gold fastener discs in the `redbull_detail` texture
  are painted over in the surrounding dark grey (#212421).

## asphalt_track_*_1k.jpg

- Texture: ["Asphalt Track"](https://polyhaven.com/a/asphalt_track) by Dimitrios Savva (Poly Haven)
- Licence: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Changes: the 2K colour (`diff`), OpenGL normal (`nor_gl`) and roughness maps scaled to 1024×1024.
  `world3d.mjs` tiles them every 2.5 m on the track and pit lane.

## Vendored loaders (MIT)

`vendor/GLTFLoader.js`, `vendor/BufferGeometryUtils.js` (three.js r170, MIT; see
`vendor/LICENSE-three`, imports changed to `./three.module.js`) and
`vendor/meshopt_decoder.module.js` (meshoptimizer, MIT, by Arseny Kapoulkine).
