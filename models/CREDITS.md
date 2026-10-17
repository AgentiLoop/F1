# 3D model credits

The project code's licence does not cover these files; each keeps its own licence.

## f222.glb

- Model: ["Formula F222 Ultimate"](https://sketchfab.com/3d-models/formula-f222-ultimate-de780743451748d6b5567b1e190c7908)
  by [CarlosCG31](https://sketchfab.com/CarlosCG31)
- Licence: [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
- A generic 2022-regulation car, with no team or sponsor logos.
- Changes: the web version from [BadCodesGG/interactive-f1](https://github.com/BadCodesGG/interactive-f1)
  (`public/models/f222.d2c1885a.glb`). That project grouped the parts into named nodes,
  replaced the textures with plain materials, and compressed the file with meshopt.
  `carmodel.mjs` replaces those materials at load time (livery paint, satin carbon,
  rubber, dark rims) and turns and moves the model onto the physics car's axles.

## Vendored loaders (MIT)

`vendor/GLTFLoader.js`, `vendor/BufferGeometryUtils.js` (three.js r170, MIT; see
`vendor/LICENSE-three`, imports changed to `./three.module.js`) and
`vendor/meshopt_decoder.module.js` (meshoptimizer, MIT, by Arseny Kapoulkine).
