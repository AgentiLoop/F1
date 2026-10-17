import test from 'node:test';
import assert from 'node:assert/strict';
import { createStadiumTrack } from './track.mjs';
import { createCircuitTrack } from './circuit.mjs';
import { CIRCUITS } from './circuits.mjs';
import { createRace, DEFAULT_GRID, RACE_DEFAULTS } from './race.mjs';

const track = createStadiumTrack({ halfStraight: 220, radius: 90, roadWidth: 15 });
// Nose-on to the outer wall of the main straight, 5 cm short of it.
const wallY = car => -(90 + track.wallOffset) + car.config.bodyFront + 0.05;
const place = (t, e, x, y, heading) => { Object.assign(e.car, { x, y, heading }); e.last = t.progress(x, y); e.covered = e.last - (t.kind === 'circuit' ? 0 : 220.8); };

function run(race, t, seconds, input, watch) {
  for (let i = 0; i < seconds * 240; i++) { race.advance(1 / 240, input, t.surfaceAt, t.barrierAt); watch?.(); }
}
const impact = (car, max) => car.impact && car.impact.time === car.time ? Math.max(max, car.impact.speed) : max;

test('an AI car beached nose-on against a wall reverses out, selects forward and races on', () => {
  const race = createRace(track, { grid: [DEFAULT_GRID[0]] }), e = race.entries[1];
  place(track, e, 80, wallY(e.car), -Math.PI / 2);
  const start = e.covered;
  let reversed = 0, hardest = 0, phases = new Set();
  run(race, track, 40, { brake: 1 }, () => {
    if (e.car.gear < 0) reversed += 1 / 240;
    if (e.recovery) phases.add(e.recovery.phase);
    hardest = impact(e.car, hardest);
  });
  assert.ok(!e.retired, JSON.stringify(e.retired));
  assert.deepEqual([...phases], ['reverse', 'forward']);
  assert.equal(e.recoveryAttempts, 1);
  assert.ok(reversed > 1 && reversed < RACE_DEFAULTS.recoveryTimeout, `reversed ${reversed.toFixed(1)} s`);
  assert.equal(e.car.gear > 0, true);
  assert.equal(e.recovery, null);
  assert.ok(e.covered - start > 800, `covered ${(e.covered - start).toFixed(0)} m`);
  assert.ok(hardest < 1, `wall impact ${hardest.toFixed(2)} m/s`);
});

test('a car parked behind blocks the reverse: the beached car holds the brake and retires without contact', () => {
  const grid = [DEFAULT_GRID[0], { ...DEFAULT_GRID[1], car: { fuelLoad: 0 } }];
  const race = createRace(track, { grid }), e = race.entries[1], blocker = race.entries[2];
  place(track, e, 80, wallY(e.car), -Math.PI / 2);
  place(track, blocker, 80, e.car.y + 7, 0);
  let closest = Infinity;
  run(race, track, 26, { brake: 1 }, () => {
    closest = Math.min(closest, Math.hypot(e.car.x - blocker.car.x, e.car.y - blocker.car.y));
    assert.ok(!e.car.contact && !blocker.car.contact, 'no car contact');
  });
  assert.ok(e.recoveryAttempts >= 1);
  assert.ok(closest > 6.5, `closest ${closest.toFixed(2)} m`);
  assert.ok(e.retired && blocker.retired);
  assert.equal(e.command.brake, 1);
});

test('fuel-starved cars and the manually driven player never reverse automatically', () => {
  const race = createRace(track, { grid: [{ ...DEFAULT_GRID[0], car: { fuelLoad: 0 } }] }), me = race.entries[0], e = race.entries[1];
  place(track, e, 80, wallY(e.car), -Math.PI / 2);
  place(track, me, -80, wallY(me.car), -Math.PI / 2);
  run(race, track, RACE_DEFAULTS.retireAfter + 4, { brake: 1 }, () => {
    assert.ok(e.car.gear > 0 && me.car.gear > 0);
    assert.ok(!e.recovery && !me.recovery);
  });
  assert.ok(e.retired && !me.retired);
});

test('wall recovery on a real circuit, against both walls, keeps the car in the race', () => {
  const t = createCircuitTrack(CIRCUITS.monza);
  for (const side of [1, -1]) {
    const race = createRace(t, { grid: [DEFAULT_GRID[0]] }), e = race.entries[1], s = 0.3 * t.length;
    const [x, y] = t.point(s, side * (t.wallOffset - e.car.config.bodyFront - 0.05));
    assert.ok(t.barrierAt(...t.point(s, side * (t.wallOffset + 0.2))));
    place(t, e, x, y, t.heading(s) - side * Math.PI / 2);
    const start = e.covered;
    let hardest = 0;
    run(race, t, 30, { brake: 1 }, () => { hardest = impact(e.car, hardest); });
    assert.ok(!e.retired && e.recoveryAttempts === 1, `side ${side}`);
    assert.ok(e.covered - start > 500, `side ${side} covered ${(e.covered - start).toFixed(0)} m`);
    assert.ok(hardest < 1, `side ${side} impact ${hardest.toFixed(2)} m/s`);
  }
});
