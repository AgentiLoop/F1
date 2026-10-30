import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { buildSky, setSkyTime, TIMES, TIME_ORDER } from '../src/sky.mjs';

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
