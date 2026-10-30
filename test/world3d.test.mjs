import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { buildCircuitWorld } from '../src/world3d.mjs';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { setNightGlow } from '../src/sky.mjs';

// Scenery construction needs canvas/image objects, but no renderer or GPU.
const context = new Proxy({
  measureText: () => ({ width: 100 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
}, { get: (target, key) => target[key] ?? (() => {}) });

function scenery(track) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }),
  };
  try { return buildCircuitWorld(track); }
  finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('RISE Motordrome: banded run-off and TecPro on the outside of tight corners only', async () => {
  const dispose = w => w.traverse(m => { m.geometry?.dispose(); m.material?.dispose?.(); });
  const monza = scenery(createCircuitTrack(CIRCUITS.monza));
  assert.equal(monza.getObjectByName('tecpro'), undefined);
  assert.equal(monza.getObjectByName('rise-runoff'), undefined);
  assert.equal(monza.getObjectByName('rise-sky'), undefined);
  // RISE mowing stripes on every circuit, from the run-off to the wall, just over the ground.
  const monzaTrack = createCircuitTrack(CIRCUITS.monza), monzaMow = monza.children.filter(m => m.name === 'mowing');
  assert.ok(monzaMow.length >= 2);
  for (const m of monzaMow) {
    const p = m.geometry.attributes.position;
    for (let k = 0; k < p.count; k += 41) {
      const d = Math.abs(monzaTrack.offset(p.getX(k), -p.getZ(k)));
      assert.ok(d > monzaTrack.roadWidth / 2 + 7 && d < monzaTrack.wallOffset + 0.5, `verge at ${d}`);
      assert.ok(Math.abs(p.getY(k) - monzaTrack.heightAt(p.getX(k), -p.getZ(k)) + (monzaTrack.hasElevation ? 0.1 : 0.02)) < 0.2, `mowing height at ${k}`);
    }
  }
  dispose(monza);
  const track = createCircuitTrack(CIRCUITS.rwanda), world = scenery(track);
  try {
    assert.equal(world.children.filter(m => m.name === 'rise-runoff').length, 2);
    // On terrain the stripes lie 0.15 m over the ground, which sits 0.25 m under the road's level.
    const mow = world.children.filter(m => m.name === 'mowing');
    assert.ok(mow.length >= 2);
    for (const m of mow) {
      const p = m.geometry.attributes.position;
      for (let k = 0; k < p.count; k += 97) assert.ok(Math.abs(p.getY(k) - track.heightAt(p.getX(k), -p.getZ(k)) + 0.1) < 0.2, `mowing height at ${k}`);
    }
    // RISE day sky: one dome (no old gradient sphere), its sun disc where the scene's light shines from.
    const sky = world.getObjectByName('rise-sky');
    assert.ok(sky?.material.isShaderMaterial);
    assert.equal(world.children.filter(m => m.geometry?.type === 'SphereGeometry').length, 1);
    const scene = new THREE.Scene(), light = new THREE.DirectionalLight();
    light.position.set(35, 70, 25); scene.add(light, world);
    sky.onBeforeRender(null, scene);
    assert.ok(sky.material.uniforms.uSunDir.value.distanceTo(new THREE.Vector3(35, 70, 25).normalize()) < 1e-6);
    // Trees sway in the wind (RISE trees.js): crowns more than wood, a trunk's foot not at all.
    const acacia = world.getObjectByName('savanna-acacia-near'), sway = acacia.geometry.attributes.aSway, pos = acacia.geometry.attributes.position, uv = acacia.geometry.attributes.uv;
    let footMax = 0, leafMin = Infinity;
    for (let i = 0; i < sway.count; i++) { if (uv.getX(i) >= 0.7 && pos.getY(i) < 0.5) footMax = Math.max(footMax, sway.getX(i)); if (uv.getX(i) < 0.7) leafMin = Math.min(leafMin, sway.getX(i)); }
    assert.ok(footMax < 0.01 && leafMin >= 0.3, `foot ${footMax}, leaves ${leafMin}`);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    acacia.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /transformed \+= .* aSway \* uWind/);
    // Trees floodlit at night (RISE trees.js aVar.z): near the road only, fading out by 160 m.
    assert.ok(acacia.material.userData.nightGlow?.[1] > 0 && acacia.material.userData.nightGlow[0] === 0);
    assert.match(shader.vertexShader, /vFlood = aFlood/);
    assert.match(shader.fragmentShader, /totalEmissiveRadiance \*= vColor\.rgb \* vFlood/);
    const lit = acacia.geometry.attributes.aFlood.array, far = world.getObjectByName('savanna-acacia-far').geometry.attributes.aFlood.array;
    assert.equal(lit.length, acacia.count);
    assert.ok(Math.max(...lit) > 0.9 && Math.max(...far) === 0, `near ${Math.max(...lit)}, far ${Math.max(...far)}`);
    const t0 = shader.uniforms.uTime.value; await new Promise(r => setTimeout(r, 20)); acacia.onBeforeRender();
    assert.ok(shader.uniforms.uTime.value > t0, 'the wind clock runs');
    const tecpro = world.children.filter(m => m.name === 'tecpro');
    assert.ok(tecpro.length >= 3, `${tecpro.length} TecPro runs`);
    // Every TecPro vertex is at the wall on the outside of a bend: its offset
    // (+ right) has the curvature's sign (+ left turn, outside on the right).
    let checked = 0;
    for (const m of tecpro) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 7) {
        const x = p.getX(i), y = -p.getZ(i), off = track.offset(x, y), k = track.curvatureAt(track.progress(x, y));
        assert.ok(Math.abs(off) > track.wallOffset - 1.5, 'stands at the wall');
        if (Math.abs(k) > 1 / 50) { assert.equal(Math.sign(off), Math.sign(k), 'outside of the bend'); checked++; }
      }
    }
    assert.ok(checked > 0);
    // Floodlit at night (RISE trackmesh.js / terrain.js emissives): run-off,
    // TecPro and the ground glow only at night; the ground's spill fades out.
    for (const m of [world.getObjectByName('rise-runoff'), tecpro[0]]) assert.ok(m.material.userData.nightGlow?.[1] > 0 && m.material.userData.nightGlow[0] === 0);
    const ground = world.children.find(m => m.geometry?.attributes.flood);
    assert.ok(ground?.material.userData.nightGlow);
    const spill = ground.geometry.attributes.flood.array;
    assert.ok(spill.reduce((a, b) => Math.max(a, b)) === 1 && spill.reduce((a, b) => Math.min(a, b)) === 0);
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    ground.material.onBeforeCompile(sh);
    assert.match(sh.fragmentShader, /totalEmissiveRadiance \*= vColor\.rgb \* vFlood/);
    assert.match(sh.vertexShader, /vFlood = flood/);
    // At night only the band round the circuit keeps its colour (RISE terrain.js
    // nightFade): 0.96 by the road, 0.06 far out; trees likewise (trees.js).
    const fade = ground.geometry.attributes.nightFade.array;
    assert.ok(Math.abs(fade.reduce((a, b) => Math.max(a, b)) - 0.96) < 1e-6 && Math.abs(fade.reduce((a, b) => Math.min(a, b)) - 0.06) < 1e-6);
    assert.match(sh.fragmentShader, /diffuseColor\.rgb \*= mix\(1\.0, vFade, uNight\)/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= mix\(1\.0, vFlood \* 0\.9 \+ 0\.07, uNight\)/);
    assert.equal(setNightGlow(world, 1) > 0 && sh.uniforms.uNight.value + shader.uniforms.uNight.value, 2);
    setNightGlow(world, 0);
    assert.equal(sh.uniforms.uNight.value + shader.uniforms.uNight.value, 0);
  } finally { dispose(world); }
});

for (const sloped of [false, true]) test(`roadside signs follow ${sloped ? 'uphill and downhill grades' : 'flat ground'}`, () => {
  const track = createCircuitTrack(CIRCUITS.monza);
  // An analytic ground plane exercises both sign faces without generating terrain.
  const height = (x, y) => sloped ? 12 + 0.12 * x - 0.08 * y : 0;
  track.elevation = (s, off = 0) => height(...track.point(s, off));
  track.heightAt = height;
  const world = scenery(track);
  try {
    const boards = world.children.find(m => m.isInstancedMesh && m.geometry.parameters?.width === 8);
    assert.ok(boards?.count > 0);
    let uphill = 0, downhill = 0;
    for (let i = 0; i < boards.count; i++) {
      const matrix = new THREE.Matrix4(); boards.getMatrixAt(i, matrix);
      const center = new THREE.Vector3().setFromMatrixPosition(matrix);
      const along = new THREE.Vector3().setFromMatrixColumn(matrix, 0);
      const facing = new THREE.Vector3().setFromMatrixColumn(matrix, 2);
      const horizontal = Math.hypot(along.x, along.z);
      const expected = sloped ? (0.12 * along.x + 0.08 * along.z) / horizontal : 0;
      assert.ok(Math.abs(along.y / horizontal - expected) < 1e-5, `sign ${i}: grade ${along.y / horizontal}, expected ${expected}`);
      assert.ok(Math.abs(center.y - height(center.x, -center.z) - 0.75) < 1e-4, `sign ${i}: height`);
      assert.ok(Math.abs(facing.y) < 1e-6, 'sign still faces horizontally toward the road');
      if (expected > 0.03) uphill++;
      if (expected < -0.03) downhill++;
    }
    if (sloped) assert.ok(uphill > 0 && downhill > 0, 'both sides and grade directions exercised');
  } finally {
    world.traverse(m => {
      m.geometry?.dispose();
      for (const material of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) material.dispose();
    });
  }
});
