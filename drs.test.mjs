import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, DEFAULT_CAR } from './physics.mjs';
import { createStadiumTrack } from './track.mjs';
import { createCircuitTrack } from './circuit.mjs';
import { CIRCUITS } from './circuits.mjs';
import { createRace, DEFAULT_GRID } from './race.mjs';

const track = createStadiumTrack({ halfStraight: 220, radius: 90, roadWidth: 15 });

test('an open DRS flap cuts drag and rear downforce and raises top speed', () => {
  const run = drs => { const car = createCar(); for (let i = 0; i < 240 * 60; i++) step(car, { throttle: 1, drs }); return car; };
  const shut = run(false), open = run(true);
  assert.equal(shut.drs, 0); assert.equal(open.drs, 1);
  const gain = (open.telemetry.speed - shut.telemetry.speed) * 3.6;
  assert.ok(gain > 8 && gain < 20, `top speed gain ${gain.toFixed(1)} km/h`);
  // Same speed, flap open vs shut: less drag and downforce, balance forward.
  const at = drs => { const car = createCar(); car.vx = 80; car.drs = drs ? 1 : 0; step(car, { throttle: 1, drs }); return car.telemetry; };
  const a = at(false), b = at(true);
  assert.ok(Math.abs(b.drag / a.drag - (1 - DEFAULT_CAR.drsDragLoss)) < 0.01);
  assert.ok(Math.abs(b.downforce / a.downforce - (1 - DEFAULT_CAR.drsDownforceLoss)) < 0.01);
  assert.ok(Math.abs(b.downforce * b.frontShare - a.downforce * a.frontShare) < 0.01 * a.downforce, 'front downforce unchanged');
});

test('the flap moves at its actuation rate and the brakes close it', () => {
  const car = createCar(); car.vx = 80;
  for (let i = 0; i < 30; i++) step(car, { throttle: 1, drs: true });
  assert.ok(Math.abs(car.drs - 0.5) < 1e-9, 'half open after 1/8 s');
  for (let i = 0; i < 30; i++) step(car, { throttle: 1, drs: true });
  assert.equal(car.drs, 1);
  for (let i = 0; i < 60; i++) step(car, { brake: 0.5, drs: true });
  assert.equal(car.drs, 0, 'braking shuts it even while requested');
});

// Player (entry 0) starts 8 m behind one opponent instead of on pole.
function behind(options = {}, extra = {}) {
  const race = createRace(track, { grid: [DEFAULT_GRID[0]], options, ...extra });
  const [a, b] = race.entries;
  for (const k of ['x', 'y', 'heading']) [a.car[k], b.car[k]] = [b.car[k], a.car[k]];
  for (const k of ['last', 'covered', 'grid', 'offset']) [a[k], b[k]] = [b[k], a[k]];
  return race;
}
function run(race, seconds, input = () => null) {
  const opened = [false, false], allowed = [false, false];
  for (let i = 0; i < seconds * 240; i++) {
    race.advance(1 / 240, input(race), track.surfaceAt, track.barrierAt);
    race.entries.forEach((e, k) => { opened[k] ||= e.car.drs > 0.5; allowed[k] ||= e.drsAllowed; });
  }
  return { opened, allowed };
}

test('a car within a second at the detection point gets DRS in the zone; the car ahead does not', () => {
  const race = behind({ drsEnableLaps: 0 });
  const zone = race.drsZones[1], follower = race.entries[0];
  const { opened } = run(race, 20);
  assert.ok(follower.drsGap > 0 && follower.drsGap < 1, `gap ${follower.drsGap}`);
  assert.deepEqual(opened, [true, false]);
  assert.ok(zone.start > 440 && zone.end > zone.start, 'back straight zone');
});

test('DRS waits for the enabling laps and is absent when the race turns it off', () => {
  assert.deepEqual(run(behind(), 40).opened, [false, false], 'not on the opening laps');
  const off = behind({ drsEnableLaps: 0 }, { drs: false });
  assert.equal(off.drsZones.length, 0);
  assert.deepEqual(run(off, 20).opened, [false, false]);
});

test('a driving player opens DRS only on request and only where it is allowed', () => {
  for (const want of [false, true]) {
    const race = behind({ drsEnableLaps: 0 });
    const { opened } = run(race, 20, r => r.entries[0].drsAllowed ? { ...r.aiCommand(0), drs: want } : null);
    assert.equal(opened[0], want);
  }
  // A request outside a zone (on the first straight, no detection yet) is ignored.
  const race = behind({ drsEnableLaps: 0 });
  const { opened } = run(race, 3, () => ({ throttle: 1, drs: true }));
  assert.equal(opened[0], false);
});

test('circuits without zone data get DRS zones on their longest straights, Monza including the main straight', () => {
  const monza = createCircuitTrack({ ...CIRCUITS.monza, drs: null });
  const race = createRace(monza, { grid: [] });
  assert.equal(race.drsZones.length, 2);
  const length = monza.length, span = z => ((z.end - z.start) % length + length) % length;
  assert.ok(race.drsZones.some(z => ((0 - z.start) % length + length) % length <= span(z)), 'a zone spans the start line');
  for (const z of race.drsZones) assert.ok(span(z) >= 390);
});

test('circuits use their real DRS zones from race telemetry, each on a straight', () => {
  const count = { monaco: 1, imola: 1, monza: 2, spa: 2, silverstone: 2, bahrain: 3, jeddah: 3, 'red-bull-ring': 3, mexico: 3 };
  for (const [key, def] of Object.entries(CIRCUITS)) {
    const t = createCircuitTrack(def), zones = createRace(t, { grid: [] }).drsZones, L = t.length, k = t.samples.lineCurvature;
    assert.equal(zones.length, def.drs.length, key);
    if (count[key]) assert.equal(zones.length, count[key], key);
    for (const z of zones) {
      const span = ((z.end - z.start) % L + L) % L;
      assert.ok(span > 250 && span < 1000, `${key} zone ${span.toFixed(0)} m`);
      // The racing line through the zone bends no tighter than 80 m radius (the
      // tightest is Zandvoort's flat-out banked final corner, 87 m, where the
      // flap is opened before the corner).
      for (let d = 0; d <= span; d += 2) assert.ok(Math.abs(k[Math.floor(((z.start + d) % L) / L * k.length)]) < 1 / 80, `${key} zone at ${z.start.toFixed(0)}+${d}`);
      assert.ok(Math.abs(((z.start - z.detection) % L + L) % L - 150) < 1e-6, 'detection 150 m before');
    }
  }
});
