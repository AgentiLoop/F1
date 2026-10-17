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

test('a passing lane has its own speed plan: slower than the racing line where it is tighter, later braking when diving', () => {
  const drive = createCircuitAutopilot(monza), car = createCar(), line = drive.plan(car);
  for (const lane of [-3, 3]) {
    const plan = drive.lanePlan(car, lane), late = drive.lanePlan(car, lane, true);
    let slower = 0;
    for (let i = 0; i < line.length; i++) {
      // Smoothed path: no corner of the lane is slower than half the line's.
      assert.ok(plan[i] > 0.5 * line[i], `lane ${lane} sample ${i}: ${plan[i].toFixed(1)} vs line ${line[i].toFixed(1)}`);
      assert.ok(late[i] >= plan[i] - 1e-9);
      if (plan[i] < 0.95 * line[i]) slower++;
    }
    assert.ok(slower > 50, `lane ${lane}: ${slower} samples slower than the line`);
  }
});

test('a faster car closes up behind on Monza into DRS range and passes, without contact', () => {
  // cornerSpeed 44 against the player's 43: since tireMu went to 2.1 (cycle 33)
  // Kovač's 43.6 closes to 0.3-0.5 s but no longer gets by in four laps.
  const race = createRace(monza, { grid: [{ ...DEFAULT_GRID[0], cornerSpeed: 44 }], laps: 4 });
  const follower = race.entries[1], gaps = [];
  let drs = 0, contact = 0;
  while (!race.finish.done) {
    race.advance(1 / 60, null, monza.surfaceAt, monza.barrierAt);
    if (follower.car.drs > 0.5) drs += 1 / 60;
    if (follower.car.contact) contact = Math.max(contact, follower.car.contact.speed);
    // Detection gaps to the car ahead (once in front there is none to time).
    if (follower.drsGap !== null && follower.drsGap !== gaps.at(-1) && follower.drsGap < 5) gaps.push(follower.drsGap);
  }
  const [first] = race.classification();
  // It closes at least 0.3 s at the detection points (it then hovers at
  // 0.25-0.4 s until the pass, which comes late in the race).
  assert.ok(Math.min(...gaps) <= gaps[0] - 0.3, `detection gaps ${gaps.map(g => g.toFixed(2)).join(' ')}`);
  // In DRS range at a detection point (it now passes on lap 2, before DRS is enabled).
  assert.ok(Math.min(...gaps) <= race.options.drsGap, `detection gaps ${gaps.map(g => g.toFixed(2)).join(' ')}, DRS open ${drs.toFixed(1)} s`);
  assert.equal(first.index, 1, 'the faster car wins');
  assert.equal(contact, 0);
});

test('a much faster car out-brakes a slower one down the inside at Interlagos, and the slower car yields, without contact', () => {
  const track = createCircuitTrack(CIRCUITS.interlagos);
  const race = createRace(track, { player: { cornerSpeed: 42, brakeDecel: 26 }, grid: [{ ...DEFAULT_GRID[0], cornerSpeed: 45, brakeDecel: 26 }], laps: 5 });
  const [slow, fast] = race.entries;
  let contact = 0, overlaps = 0, yieldedOutside = false, was = false;
  while (!race.finish.done) {
    race.advance(1 / 60, null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) if (e.car.contact) contact = Math.max(contact, e.car.contact.speed);
    const alongside = !!fast.dive?.overlap;
    if (alongside && !was) overlaps++;
    // The car dived on moves to the lane on the other side to leave room.
    if (alongside && slow.lane === -Math.sign(fast.lane) * race.options.passLane) yieldedOutside = true;
    was = alongside;
  }
  const [first] = race.classification();
  assert.equal(first.index, 1, 'the faster car wins');
  assert.ok(overlaps >= 1, 'it gets alongside on the inside under braking');
  assert.ok(yieldedOutside, 'the slower car leaves room');
  assert.equal(contact, 0);
});

test('the lap-1 queue through the Red Bull Ring turn 1 hairpin keeps moving, without contact', () => {
  // Backing out behind a car alongside (or closing on one in a hairpin) slows a
  // car by at most the shortfall per backOutTime: before, the field crawled
  // through turn 1 at under 5 km/h on most seeds.
  const track = createCircuitTrack(CIRCUITS['red-bull-ring']);
  for (const seed of [2, 5, 6]) {
    const race = createRace(track, { grid: DEFAULT_GRID, start: { seed }, laps: 2 });
    let slowest = Infinity, contact = 0;
    while (Math.max(...race.entries.map(e => e.covered)) < track.length) {
      race.advance(1 / 60, null, track.surfaceAt, track.barrierAt);
      if (race.start.sinceLightsOut > 5) for (const e of race.entries) slowest = Math.min(slowest, e.car.telemetry.speed);
      for (const e of race.entries) if (e.car.contact) contact = Math.max(contact, e.car.contact.speed);
    }
    assert.ok(slowest > 8, `seed ${seed}: slowest ${slowest.toFixed(1)} m/s on lap 1`);
    assert.equal(contact, 0, `seed ${seed}`);
  }
});

test('lap-1 queues through Spa La Source and COTA turn 1 keep moving, without contact', () => {
  // A car running inside its line in the hairpin (below its plan speed) or in
  // a lane clamped at the road edge no longer counts as still crossing to its
  // lane, which kept the full 14 m gap: before, these seeds crawled at 1-2 m/s.
  for (const [key, seeds] of [['spa', [2, 6]], ['cota', [8]]]) {
    const track = createCircuitTrack(CIRCUITS[key]);
    for (const seed of seeds) {
      const race = createRace(track, { grid: DEFAULT_GRID, start: { seed }, laps: 2 });
      let slowest = Infinity, contact = 0;
      while (Math.max(...race.entries.map(e => e.covered)) < track.length) {
        race.advance(1 / 60, null, track.surfaceAt, track.barrierAt);
        if (race.start.sinceLightsOut > 5) for (const e of race.entries) slowest = Math.min(slowest, e.car.telemetry.speed);
        for (const e of race.entries) if (e.car.contact) contact = Math.max(contact, e.car.contact.speed);
      }
      assert.ok(slowest > 5, `${key} seed ${seed}: slowest ${slowest.toFixed(1)} m/s on lap 1`);
      assert.equal(contact, 0, `${key} seed ${seed}`);
    }
  }
});

test('lap 1 at Montreal: a car on the racing line leaves room to one held at the road edge in the outside lane, without contact', () => {
  // The real line swings out to the edge before turn 1; a car on it used to
  // squeeze the car in the outside lane (28 contacts in 5 starts).
  const track = createCircuitTrack(CIRCUITS.montreal);
  for (const seed of [1, 2, 5]) {
    const race = createRace(track, { grid: DEFAULT_GRID, start: { seed }, laps: 2 });
    let contact = 0;
    while (Math.max(...race.entries.map(e => e.covered)) < track.length) {
      race.advance(1 / 60, null, track.surfaceAt, track.barrierAt);
      for (const e of race.entries) if (e.car.contact) contact = Math.max(contact, e.car.contact.speed);
    }
    assert.equal(contact, 0, `seed ${seed}`);
  }
});
