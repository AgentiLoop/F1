import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuitTrack } from '../src/circuit.mjs';
import { CIRCUITS } from '../src/circuits.mjs';
import { createRace } from '../src/race.mjs';
import { FIXED_DT } from '../src/physics.mjs';

test('cars entering Monza\'s pit lane from different racing lanes keep apart until their paths merge', () => {
  // Seed 1, three laps with the compound rule: the outside-lane car braked
  // for the pit limit while the inside-lane car ahead had already slowed, and
  // the two touched at the entry (1.3 m/s) as their paths converged.
  const track = createCircuitTrack(CIRCUITS.monza), race = createRace(track, { start: { seed: 1 }, laps: 3, compoundRule: true });
  let touches = 0, boxed = 0;
  while (race.time < 215) {
    race.advance(FIXED_DT, null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) if (e.car.contact?.time === e.car.time) touches++;
  }
  for (const e of race.entries) boxed += e.stops.length + (e.pit ? 1 : 0);
  assert.equal(touches, 0, `${touches} contact steps`);
  assert.ok(boxed >= 4, `only ${boxed} cars had boxed by 215 s`);
});
