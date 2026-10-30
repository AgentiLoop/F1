import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { wildlifePlan, ANIMALS } from '../src/wildlife.mjs';
import { lakeSdf } from '../src/world3d.mjs';

const track = createCircuitTrack(CIRCUITS.rwanda);
const { x: X, y: Y } = track.samples;
const box = { minX: Math.min(...X), maxX: Math.max(...X), minY: Math.min(...Y), maxY: Math.max(...Y) };
const terrain = { height: track.heightAt, dist: (x, y) => Math.abs(track.offset(x, y)), lake: (x, y) => lakeSdf(x, -y) };
const plan = wildlifePlan(track, terrain, box, { tries: 400 });

test('RISE wildlife: every species has a herd, hippos in the lake, the rest on land', () => {
  for (const [kind, cfg] of Object.entries(ANIMALS)) {
    assert.ok(plan.herds[kind].length >= 1, `${kind}: no herd`);
    for (const g of plan.herds[kind]) {
      const l = terrain.lake(g.x, g.y);
      if (cfg.water) assert.ok(l < -7 && l > -40, `${kind} ${l.toFixed(0)} m from the shore`);
      else assert.ok(l > 20, `${kind} in the lake`);
    }
  }
});

test('RISE wildlife: herds lie wholly beyond the barriers and away from the start straight', () => {
  for (const g of Object.values(plan.herds).flat()) {
    assert.ok(Math.abs(track.offset(g.x, g.y)) >= track.wallOffset + g.r + 4, `${g.kind} too close`);
    const s = track.progress(g.x, g.y);
    assert.ok(!(s > track.length - 320 || s < 420), `${g.kind} beside the start straight`);
    if (!g.water) assert.ok(plan.glade(g.x, g.y), 'herd range left open for trees');
  }
});
