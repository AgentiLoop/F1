import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { buildSky, setSkyTime, TIMES, TIME_ORDER, TIME_BLEND, lerpTime, nightGlow, setNightGlow } from '../src/sky.mjs';

test('RISE times of day: dawn in the east, sunset in the west, day keeps our lighting', () => {
  assert.deepEqual(TIME_ORDER, ['dawn', 'day', 'sunset', 'night']);
  assert.deepEqual(Object.keys(TIMES).sort(), [...TIME_ORDER].sort());
  // Day is the game's original sun (35, 70, 25), colour, intensity and fog.
  assert.ok(TIMES.day.sun.distanceTo(new THREE.Vector3(35, 70, 25).normalize()) < 1e-9);
  assert.equal(TIMES.day.sunIntensity, 2.8); assert.equal(TIMES.day.fogFar, 1700); assert.equal(TIMES.day.night, 0);
  // Low sun: east (+x) at dawn, west (-x) at sunset, 6-7° up.
  for (const [k, sign] of [['dawn', 1], ['sunset', -1]]) {
    const s = TIMES[k].sun;
    assert.ok(Math.abs(s.length() - 1) < 1e-9);
    assert.ok(Math.sign(s.x) === sign && Math.abs(s.x) > 0.9, k);
    assert.ok(s.y > 0.1 && s.y < 0.12, k);
    assert.ok(TIMES[k].sunIntensity < TIMES.day.sunIntensity && TIMES[k].fogFar < TIMES.day.fogFar);
  }
  assert.equal(TIMES.night.night, 1);
  assert.ok(TIMES.night.hemi < TIMES.day.hemi / 2 && TIMES.night.fogFar < 1000);
});

test('setSkyTime puts a time of day on the sky dome', () => {
  const sky = buildSky(1000, 0, 0), u = sky.material.uniforms;
  assert.equal(u.uNight.value, 0);
  assert.match(sky.material.fragmentShader, /uNight/);
  setSkyTime(sky, TIMES.night);
  assert.equal(u.uNight.value, 1);
  assert.equal(u.uZenith.value.getHex(), new THREE.Color(TIMES.night.sky.zenith).getHex());
  assert.equal(u.uCoverage.value, 0.18);
  setSkyTime(sky, TIMES.sunset);
  assert.equal(u.uNight.value, 0);
  assert.equal(u.uHorizon.value.getHex(), new THREE.Color(0xe8946a).getHex());
  assert.equal(u.uSunColor.value.getHex(), new THREE.Color(0xff9a58).getHex());
});

test('nightGlow / setNightGlow switch the RISE night glow on every tagged material once', () => {
  const lamp = nightGlow(new THREE.MeshStandardMaterial(), 0xfff6e0, 4, { day: 0.15 });
  const map = new THREE.Texture(), board = nightGlow(new THREE.MeshStandardMaterial({ map }), 0xffffff, 0.4, { useMap: true });
  const plain = new THREE.MeshStandardMaterial();
  assert.equal(lamp.emissiveIntensity, 0.15); assert.equal(board.emissiveIntensity, 0); assert.equal(board.emissiveMap, map);
  const root = new THREE.Group(), geo = new THREE.BoxGeometry();
  root.add(new THREE.Mesh(geo, [lamp, plain, lamp]), new THREE.Mesh(geo, board), new THREE.Mesh(geo, plain));
  assert.equal(setNightGlow(root, 1), 2);
  assert.equal(lamp.emissiveIntensity, 4); assert.equal(board.emissiveIntensity, 0.4); assert.equal(plain.emissiveIntensity, 1);
  setNightGlow(root, 0);
  assert.equal(lamp.emissiveIntensity, 0.15); assert.equal(board.emissiveIntensity, 0);
});
test('lerpTime fades between times of day like the RISE sim (2.2 s, sun over the top)', () => {
  assert.equal(TIME_BLEND, 2.2);
  for (const a of TIME_ORDER) for (const b of TIME_ORDER) {
    const s = lerpTime(TIMES[a], TIMES[b], 0), e = lerpTime(TIMES[a], TIMES[b], 1);
    for (const [x, t] of [[s, TIMES[a]], [e, TIMES[b]]]) {
      for (const k of ['sunColor', 'hemiSky', 'hemiGround', 'fogColor']) assert.equal(x[k], t[k]);
      for (const k of ['sunIntensity', 'hemi', 'env', 'fogFar', 'exposure', 'night']) assert.ok(Math.abs(x[k] - t[k]) < 1e-9);
      assert.deepEqual(Object.keys(x.sky), Object.keys(t.sky)); assert.equal(x.sky.horizon, t.sky.horizon);
      assert.ok(x.sun.distanceTo(t.sun) < 1e-9); assert.equal(x.label, t.label);
    }
    for (let i = 0; i <= 10; i++) assert.ok(lerpTime(TIMES[a], TIMES[b], i / 10).sun.y > 0.05, `${a}→${b} sun stays up`);
  }
  // dawn (east) to sunset (west): the halfway sun is lifted overhead, not through the ground
  assert.ok(lerpTime(TIMES.dawn, TIMES.sunset, 0.5).sun.y > 0.9);
  const half = lerpTime(TIMES.day, TIMES.night, 0.5);
  assert.equal(half.night, 0.5); assert.ok(half.fogFar < TIMES.day.fogFar && half.fogFar > TIMES.night.fogFar);
});
