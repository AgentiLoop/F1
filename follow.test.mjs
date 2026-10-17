import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar } from './physics.mjs';
import { createCircuitTrack } from './circuit.mjs';
import { CIRCUITS } from './circuits.mjs';
import { createCircuitAutopilot } from './autopilot.mjs';
import { createRace, DEFAULT_GRID } from './race.mjs';

const monza = createCircuitTrack(CIRCUITS.monza);

test('circuit brakeSpeed inverts the plan braking (a + b·v²) over a distance', () => {
  const drive = createCircuitAutopilot(monza), c = createCar().config;
  assert.ok(Math.abs(drive.brakeSpeed(c, 30, 0) - 30) < 1e-9);
  // Brake numerically from the returned speed: it reaches 30 m/s after ~d metres.
  for (const d of [20, 80, 250]) {
    let v = drive.brakeSpeed(c, 30, d), x = 0;
    while (v > 30) { const dv = 0.001; x += v * dv / drive.brakeDecel(c, v); v -= dv; }
    assert.ok(Math.abs(x - d) < 0.01 * d, `d ${d}: braked ${x.toFixed(2)} m`);
  }
  // With downforce, braking from high speed beats the flat 18 m/s² follow law.
  assert.ok(drive.brakeSpeed(c, 30, 250) > Math.sqrt(30 ** 2 + 2 * 18 * 250));
});

test('a faster car closes up behind on Monza, gets DRS and finishes within a second, without contact', () => {
  const race = createRace(monza, { grid: [DEFAULT_GRID[0]], laps: 4 });
  const follower = race.entries[1], gaps = [];
  let drs = 0, contact = 0;
  while (!race.finish.done) {
    race.advance(1 / 60, null, monza.surfaceAt, monza.barrierAt);
    if (follower.car.drs > 0.5) drs += 1 / 60;
    if (follower.car.contact) contact = Math.max(contact, follower.car.contact.speed);
    if (follower.drsGap !== null && follower.drsGap !== gaps.at(-1)) gaps.push(follower.drsGap);
  }
  const [row] = race.classification().filter(r => r.index === 1);
  assert.ok(gaps.at(-1) < gaps[0] - 0.4, `detection gaps ${gaps.map(g => g.toFixed(2)).join(' ')}`);
  assert.ok(drs > 10, `DRS open ${drs.toFixed(1)} s`);
  assert.ok(row.gap < 1, `finish gap ${row.gap.toFixed(2)} s`);
  assert.equal(contact, 0);
});
