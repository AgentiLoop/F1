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

## mclaren-wheel.glb

- Model: ["McLaren Formula 1 Steering Wheel"](https://sketchfab.com/3d-models/mclaren-formula-1-steering-wheel-4dc0ce4effbe43d0a027aa072b437818)
  by [dhimasdc9](https://sketchfab.com/dhimasdc9)
- Licence: [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
- Changes: taken from the Sketchfab glTF export in [divitkashyap/f1-sim](https://github.com/divitkashyap/f1-sim)
  (`assets/cockpit/mclaren_formula_1_steering_wheel.glb`, 10.9 MB, 332k triangles), simplified
  to 56k triangles, its plain colours packed into a palette texture and compressed with
  meshopt using `@gltf-transform/cli optimize --simplify-ratio 0.15` (755 KB).
  `carmodel.mjs` puts it in place of the car model's own steering wheel and turns it with the steering.

## Vendored loaders (MIT)

`vendor/GLTFLoader.js`, `vendor/BufferGeometryUtils.js` (three.js r170, MIT; see
`vendor/LICENSE-three`, imports changed to `./three.module.js`) and
`vendor/meshopt_decoder.module.js` (meshoptimizer, MIT, by Arseny Kapoulkine).
