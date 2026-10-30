import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createCar, step, FIXED_DT } from '../src/physics.mjs';
import { createTimeTrial } from '../src/trial.mjs';
import { createLapTimer } from '../src/laptimer.mjs';

const rwanda = createCircuitTrack(CIRCUITS.rwanda);

test('the RISE Motordrome keeps its climb: 1363.5-1415 m above sea level (heights above 1390 m)', () => {
  let lo = Infinity, hi = -Infinity;
  for (let s = 0; s < rwanda.length; s += 2) { const z = rwanda.elevation(s); lo = Math.min(lo, z); hi = Math.max(hi, z); }
  assert.ok(Math.abs(lo + 26.5) < 0.3 && Math.abs(hi - 25) < 0.3, `${lo} .. ${hi}`);
  assert.ok(rwanda.hasElevation && rwanda.lakeLevel === -34);
  // The lake lies below every part of the road.
  assert.ok(lo > rwanda.lakeLevel);
});

test("the road profile's curvature is smooth: flat Monza barely jolts the load, Eau Rouge still compresses", () => {
  const zss = key => { const t = createCircuitTrack({ ...CIRCUITS[key], pitLane: false }), out = [];
    for (let s = 0; s < t.length; s += 2) out.push({ d: s, zss: t.groundAt(...t.point(s)).zss });
    return out; };
  // Under 0.4 g at 90 m/s anywhere at Monza.
  for (const { d, zss: k } of zss('monza')) assert.ok(Math.abs(k) * 90 * 90 < 0.4 * 9.81, `Monza ${d}: ${k}`);
  // Eau Rouge's compression, ~1 km from Spa's line, keeps over 1.5e-3/m (0.4 g at 50 m/s).
  const eau = Math.max(...zss('spa').filter(p => p.d > 900 && p.d < 1150).map(p => p.zss));
  assert.ok(eau > 1.5e-3, `${eau}`);
});

test('banking tilts the road: positive banks raise the left edge, and the verges fall away 2%', () => {
  const banks = CIRCUITS.rwanda.banks;
  // Turn 2's banked section: the source banks peak at 0.12 there.
  const k = banks.indexOf(0.12), s = k * rwanda.length / banks.length;
  const half = rwanda.roadWidth / 2, left = rwanda.elevation(s, -half), right = rwanda.elevation(s, half), mid = rwanda.elevation(s);
  assert.ok(left - right > 1.4 && left - right < 1.9, `${left - right}`);
  assert.ok(Math.abs((left + right) / 2 - mid) < 1e-9);
  assert.ok(Math.abs(rwanda.elevation(s, half + 10) - (right - 0.2)) < 1e-9);
  // heightAt finds the same surface from world coordinates.
  const [x, y] = rwanda.point(s, 3);
  assert.ok(Math.abs(rwanda.heightAt(x, y) - rwanda.elevation(s, 3)) < 0.05);
});

test('Zandvoort and Jeddah bank their real banked corners, outside edge up', () => {
  // [circuit, m from the timing line, design angle (degrees)]
  for (const [key, d, degrees] of [['zandvoort', 810, 19], ['zandvoort', 3720, 18], ['jeddah', 2410, 12]]) {
    const t = createCircuitTrack({ ...CIRCUITS[key], pitLane: false }), s = d;
    const half = t.roadWidth / 2, rise = t.elevation(s, -half) - t.elevation(s, half);
    // Left minus right edge: the outside is raised, tan(angle) per metre across the road.
    assert.ok(Math.sign(rise) === -Math.sign(t.curvatureAt(s)), `${key} ${d}: ${rise}`);
    assert.ok(Math.abs(Math.abs(rise) - 2 * half * Math.tan(degrees * Math.PI / 180)) < 0.2, `${key} ${d}: ${rise}`);
  }
  // Zandvoort's Turn 3 rises about 4.5 m from its inside to its outside edge.
  const z = createCircuitTrack({ ...CIRCUITS.zandvoort, pitLane: false }), s3 = 810;
  assert.ok(Math.abs(z.elevation(s3, z.roadWidth / 2) - z.elevation(s3, -z.roadWidth / 2) - 4.5) < 0.3);
  // Every other real circuit stays flat across.
  for (const key of Object.keys(CIRCUITS)) if (!['zandvoort', 'jeddah', 'rwanda'].includes(key)) assert.equal(CIRCUITS[key].banks, undefined, key);
});

test('circuits without elevation stay flat', () => {
  const monza = createCircuitTrack({ ...CIRCUITS.monza, heights: null });
  assert.equal(monza.hasElevation, false);
  for (const off of [-30, 0, 30]) assert.equal(monza.elevation(1234, off), 0);
  assert.equal(monza.heightAt(...monza.point(500, 4)), 0);
});

test('the real circuits carry the climbs the cars measured (OpenF1 heights)', () => {
  const range = key => { const t = createCircuitTrack({ ...CIRCUITS[key], pitLane: false }); let lo = Infinity, hi = -Infinity;
    for (let s = 0; s < t.length; s += 5) { const z = t.elevation(s); lo = Math.min(lo, z); hi = Math.max(hi, z); } return hi - lo; };
  // Spa ~100 m, the Red Bull Ring ~65 m, Monaco ~42 m; Jeddah and Miami are flat.
  for (const [key, lo, hi] of [['spa', 95, 106], ['red-bull-ring', 58, 66], ['monaco', 36, 44], ['jeddah', 0, 4], ['miami', 0, 4]]) {
    const r = range(key); assert.ok(r > lo && r < hi, `${key}: ${r}`);
  }
  for (const key of Object.keys(CIRCUITS)) assert.equal(CIRCUITS[key].heights.length, CIRCUITS[key].points.length / 2, key);
  // Spa: down from La Source to Eau Rouge, then up the Kemmel straight.
  const spa = createCircuitTrack({ ...CIRCUITS.spa, pitLane: false }), at = d => spa.elevation(d);
  assert.ok(at(1000) < at(400) - 20 && at(2400) > at(1000) + 50, `${at(400)} ${at(1000)} ${at(2400)}`);
});

test('groundAt gives the ground gradient that heightAt shows (null on flat circuits)', () => {
  assert.equal(createCircuitTrack({ ...CIRCUITS.monza, heights: null }).groundAt, null);
  for (const s of [300, 1500, 2700, 4100, 5200]) for (const off of [-5, 0, 4]) {
    const [x, y] = rwanda.point(s, off), { gx, gy } = rwanda.groundAt(x, y), d = 0.5;
    const ex = (rwanda.heightAt(x + d, y) - rwanda.heightAt(x - d, y)) / (2 * d), ey = (rwanda.heightAt(x, y + d) - rwanda.heightAt(x, y - d)) / (2 * d);
    assert.ok(Math.abs(gx - ex) < 0.01 && Math.abs(gy - ey) < 0.01, `s ${s} off ${off}: ${gx},${gy} vs ${ex},${ey}`);
  }
});

// Lap progress of the steepest climb and descent along the centreline.
function steepest(sign) {
  let best = 0, at = 0;
  for (let s = 0; s < rwanda.length; s += 5) { const g = (rwanda.elevation(s + 5) - rwanda.elevation(s - 5)) / 10; if (g * sign > best) { best = g * sign; at = s; } }
  return { at, grade: best };
}

test('gravity on the grade: a car coasting uphill slows faster than one coasting downhill', () => {
  const speedAfter = (s0, groundAt) => {
    const car = createCar();
    [car.x, car.y] = rwanda.point(s0); car.heading = rwanda.heading(s0);
    car.vx = 30 * Math.cos(car.heading); car.vy = 30 * Math.sin(car.heading);
    car.wheelOmega.fill(30 / car.config.wheelRadius);
    for (let i = 0; i < 240; i++) step(car, { steer: 0 }, FIXED_DT, rwanda.surfaceAt, null, groundAt);
    return car.telemetry.speed;
  };
  const up = steepest(1), down = steepest(-1);
  assert.ok(up.grade > 0.03 && down.grade > 0.03, `${up.grade} ${down.grade}`);
  const upFlat = speedAfter(up.at - 15, null), upHill = speedAfter(up.at - 15, rwanda.groundAt);
  const downFlat = speedAfter(down.at - 15, null), downHill = speedAfter(down.at - 15, rwanda.groundAt);
  // About g × grade × 1 s either way.
  assert.ok(upFlat - upHill > 0.25, `uphill ${upFlat} -> ${upHill}`);
  assert.ok(downHill - downFlat > 0.25, `downhill ${downFlat} -> ${downHill}`);
});

test('a braked car stays put on the banking and the steepest grade', () => {
  const banks = CIRCUITS.rwanda.banks, sBank = banks.indexOf(0.125) * rwanda.length / banks.length;
  for (const s0 of [sBank, steepest(1).at]) {
    const car = createCar();
    [car.x, car.y] = rwanda.point(s0, 3); car.heading = rwanda.heading(s0);
    const x0 = car.x, y0 = car.y;
    for (let i = 0; i < 240 * 5; i++) step(car, { brake: 1 }, FIXED_DT, rwanda.surfaceAt, rwanda.barrierAt, rwanda.groundAt);
    assert.ok(Math.hypot(car.x - x0, car.y - y0) < 0.3, `s ${s0}: drifted ${Math.hypot(car.x - x0, car.y - y0)} m`);
  }
});

test('the time trial laps the RISE Motordrome with gravity on its hills and banking', () => {
  const sim = createTimeTrial(rwanda), timer = createLapTimer(rwanda, { lineProgress: 0 });
  for (let i = 0; i < 60 * 200 && !timer.state.lastLap; i++) { sim.advance(1 / 60, null); timer.update(sim.car); }
  const lap = timer.state.lastLap;
  assert.ok(lap?.valid, 'lap within track limits');
  assert.ok(lap.time > 80 && lap.time < 140, `lap ${lap.time.toFixed(2)} s`);
});
// A car on the centreline at lap progress s, heading down the road at v m/s.
const carAt = (t, s, v) => {
  const car = createCar(); [car.x, car.y] = t.point(s); car.heading = t.heading(s);
  car.vx = v * Math.cos(car.heading); car.vy = v * Math.sin(car.heading);
  car.wheelOmega.fill(v / car.config.wheelRadius); car.gear = 8;
  return car;
};

test('the hills act on the car: the climb out of Eau Rouge slows a coasting car, the drop to it speeds one up', () => {
  const spa = createCircuitTrack({ ...CIRCUITS.spa, pitLane: false }), s0 = 0;
  assert.equal(createCircuitTrack({ ...CIRCUITS.spa, heights: null, pitLane: false }).groundAt, null);
  // Steepest climb and drop (over 40 m) in the first 2.4 km: Raidillon and the run down to Eau Rouge.
  let up = null, down = null;
  for (let d = 400; d < 2400; d += 5) {
    const g = (spa.elevation(s0 + d + 20) - spa.elevation(s0 + d - 20)) / 40;
    if (!up || g > up.g) up = { s: s0 + d, g };
    if (!down || g < down.g) down = { s: s0 + d, g };
  }
  assert.ok(up.g > 0.1 && down.g < -0.05, `${up.g} ${down.g}`);
  for (const { s, g } of [up, down]) {
    // Coast for 0.5 s at 40 m/s with and without the ground: the difference is the slope's pull.
    const coast = ground => { const car = carAt(spa, s, 40); for (let i = 0; i < 120; i++) step(car, {}, FIXED_DT, spa.surfaceAt, null, ground); return car.telemetry.speed; };
    const pull = (coast(spa.groundAt) - coast(null)) / 0.5, expected = -9.81 * g / (1 + g * g);
    assert.ok(Math.abs(pull - expected) < 0.2 * Math.abs(expected), `${s}: ${pull} vs ${expected}`);
  }
});

test("Zandvoort's banked Turn 3 presses the car into the road; crests unload it", () => {
  const z = createCircuitTrack({ ...CIRCUITS.zandvoort, pitLane: false }), s3 = 810;
  const load = (s, v, ground) => {
    const car = carAt(z, s, v), k = z.curvatureAt(s), gr = z.groundAt(car.x, car.y);
    // Steady cornering: the tyres supply what the slope's pull does not.
    const cos2 = 1 / (1 + gr.gx ** 2 + gr.gy ** 2), across = -gr.gx * Math.sin(car.heading) + gr.gy * Math.cos(car.heading);
    car.ay = v * v * k + 9.81 * across * cos2;
    step(car, {}, FIXED_DT, z.surfaceAt, null, ground);
    return { total: car.telemetry.wheels.reduce((a, w) => a + w.load, 0), a: v * v * Math.abs(k), across, zss: gr.zss };
  };
  // N = m (g cos θ + a sin θ + zss v² cos θ): the banking's share of the cornering, less the tilt's.
  const v = 45, flat = load(s3, v, null), banked = load(s3, v, z.groundAt);
  const theta = Math.atan(Math.abs(banked.across)), m = 800;
  const expected = m * banked.a * Math.sin(theta) - m * 9.81 * (1 - Math.cos(theta)) + m * banked.zss * v * v * Math.cos(theta);
  assert.ok(theta > 15 * Math.PI / 180, `${theta}`);
  assert.ok(Math.abs(banked.total - flat.total - expected) < 0.15 * expected, `${banked.total - flat.total} vs ${expected}`);
  // Over the sharpest crest on a straight the car is lighter than on the flat.
  let crest = null;
  for (let s = 0; s < z.length; s += 5) { const g = z.groundAt(...z.point(s)); if (Math.abs(z.curvatureAt(s)) < 0.002 && (!crest || g.zss < crest.zss)) crest = { s, zss: g.zss }; }
  const top = load(crest.s, 60, z.groundAt).total, level = load(crest.s, 60, null).total;
  assert.ok(crest.zss < 0 && top < level - 0.5 * m * 3600 * -crest.zss, `${crest.zss}: ${top} vs ${level}`);
});
