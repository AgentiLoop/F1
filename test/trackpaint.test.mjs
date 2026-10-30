import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { rubberGeometry, rubberDarkness, gridMarks, buildTrackPaint, RUBBER_HALF } from '../src/trackpaint.mjs';

test('RISE rubbered line: up to 45% darker on the racing line, none 1.9 m off it', () => {
  let max = 0, min = 1;
  for (let v = 0; v < 256; v += 0.5) { const a = rubberDarkness(0.5, v); max = Math.max(max, a); min = Math.min(min, a); }
  assert.ok(max <= 0.45 + 1e-9 && max > 0.35, `max ${max}`);
  assert.ok(min >= 0.15 - 1e-9, `min ${min}`);
  assert.equal(rubberDarkness(0, 10), 0); assert.equal(rubberDarkness(1, 10), 0);
});

test('RISE rubbered line: follows the racing line just above the road on every circuit', () => {
  for (const key of ['rwanda', 'monza']) {
    const track = createCircuitTrack(CIRCUITS[key]), p = rubberGeometry(track).attributes.position;
    for (let k = 4; k < p.count; k += 9 * 37) { // centre column of every 37th cross-section
      const x = p.getX(k), y = -p.getZ(k), s = track.progress(x, y);
      assert.ok(Math.abs(track.offset(x, y) - track.lineOffset(s)) < 0.3, `${key} on the line at s ${s.toFixed(0)}`);
      assert.ok(Math.abs(p.getY(k) - track.heightAt(x, y) - 0.006) < 0.05, `${key} on the road at s ${s.toFixed(0)}`);
      assert.ok(Math.abs(track.offset(x, y)) + RUBBER_HALF <= track.roadWidth / 2 + 1.5);
    }
  }
});

test('RISE grid slots: a box at every car of the grid, the pole behind the start line', () => {
  const marks = gridMarks(10);
  assert.equal(marks.length, 2 + 9 * 3);
  for (const m of marks) assert.ok(m.s1 <= -0.8 + 1e-9 || m.s0 >= -0.8 - 8 * 9, 'behind the line');
  assert.ok(marks.slice(0, 2).every(m => m.s1 === -0.8), 'pole side lines start at the line');
  const track = createCircuitTrack(CIRCUITS.rwanda), g = buildTrackPaint(track, { slots: 10 });
  const gm = g.getObjectByName('grid-marks').geometry;
  assert.equal(gm.attributes.position.count, marks.length * 4);
  for (let k = 0; k < gm.attributes.normal.count; k++) assert.ok(gm.attributes.normal.getY(k) > 0.9, 'grid marks face up');
  assert.equal(buildTrackPaint(track).getObjectByName('grid-marks'), undefined);
});
