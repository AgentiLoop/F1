import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { lakesidePlan, JETTY } from '../src/lakeside.mjs';
import { lakeSdf } from '../src/world3d.mjs';

const track = createCircuitTrack(CIRCUITS.rwanda), wallAt = track.wallOffset;
const terrain = {
  height: (x, y) => lakeSdf(x, -y) < 0 ? track.lakeLevel - 2 : track.lakeLevel + 1.4 + lakeSdf(x, -y) * 0.06,
  dist: (x, y) => { let d = Infinity; for (let s = 0; s < track.length; s += 5) { const [px, py] = track.point(s); d = Math.min(d, Math.hypot(x - px, y - py)); } return d; },
  lake: (x, y) => lakeSdf(x, -y), lakeLevel: track.lakeLevel,
};
const plan = lakesidePlan(terrain);

test('RISE lakeside pods: on the shore, clear of the track and of each other, jetties out over the water', () => {
  assert.ok(plan.pods.length >= 6, `${plan.pods.length} pods`);
  for (const p of plan.pods) {
    assert.ok(Math.abs(track.offset(p.x, p.y)) > wallAt, `pod at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`);
    const sdf = lakeSdf(p.x, -p.y);
    assert.ok(sdf >= 0 && sdf < 4, `on the waterline: ${sdf.toFixed(1)} m from it`);
    // the far end of the jetty stands on the lake
    assert.ok(lakeSdf(p.x + p.jx * (p.r + JETTY), -(p.y + p.jy * (p.r + JETTY))) < 0, 'jetty reaches the water');
    for (const o of plan.pods) if (o !== p) assert.ok(Math.hypot(o.x - p.x, o.y - p.y) >= 26);
  }
  const p = plan.pods[0];
  assert.equal(plan.clear(p.x, p.y), false);
  assert.equal(plan.clear(p.x + p.jx * (p.r + 20), p.y + p.jy * (p.r + 20)), false);
  assert.equal(plan.clear(p.x - p.jx * 40, p.y - p.jy * 40), true);
});
