import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { savannaPlan, SPECIES } from '../src/savanna.mjs';
import { lakeSdf } from '../src/world3d.mjs';

const track = createCircuitTrack(CIRCUITS.rwanda);
const { x: X, y: Y } = track.samples;
const box = { minX: Math.min(...X), maxX: Math.max(...X), minY: Math.min(...Y), maxY: Math.max(...Y) };
const terrain = { height: track.heightAt, dist: (x, y) => Math.abs(track.offset(x, y)), lake: (x, y) => lakeSdf(x, -y) };
const plan = savannaPlan(track, terrain, box, { margin: 300 });

test('RISE vegetation: every species is planted, papyrus only by the water', () => {
  for (const k of SPECIES) assert.ok(plan[k].length > 20, `${k}: ${plan[k].length}`);
  for (const [x, y] of plan.papyrus) assert.ok(terrain.lake(x, y) < 6);
  for (const k of SPECIES.filter(k => k !== 'papyrus')) for (const [x, y] of plan[k]) assert.ok(terrain.lake(x, y) >= 6, `${k} in the lake`);
});

test('RISE vegetation: trees stay clear of the road and the start straight', () => {
  for (const k of SPECIES) for (const [x, y] of plan[k]) {
    const d = Math.abs(track.offset(x, y));
    assert.ok(d >= track.wallOffset + 10, `${k} ${d.toFixed(1)} m from the centreline`);
    const s = track.progress(x, y);
    if (s > track.length - 260 || s < 380) assert.ok(d >= track.wallOffset + 90, `${k} beside the stands`);
  }
});
