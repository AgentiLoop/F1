import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, FIXED_DT } from './physics.mjs';
import { createStadiumTrack } from './track.mjs';
import { createRace, wakeStrength, resolveCarContact, RACE_DEFAULTS } from './race.mjs';

const track = createStadiumTrack({ halfStraight: 220, radius: 90, roadWidth: 15 });
const place = (x, y, heading = 0, speed = 0) => Object.assign(createCar(), { x, y, heading, vx: speed * Math.cos(heading), vy: speed * Math.sin(heading) });

test('wake is strongest close behind on the centreline and absent ahead or beside', () => {
  const lead = place(0, 0);
  assert.ok(wakeStrength(lead, place(-RACE_DEFAULTS.wakeMinGap - 0.01, 0)) > 0.99);
  assert.equal(wakeStrength(lead, place(10, 0)), 0);
  assert.equal(wakeStrength(lead, place(-2, 0)), 0); // overlapping, not in the wake
  const near = wakeStrength(lead, place(-10, 0)), far = wakeStrength(lead, place(-40, 0));
  assert.ok(near > far && far > 0.2, `near ${near} far ${far}`);
  assert.ok(wakeStrength(lead, place(-10, 3)) < 0.05 * near);
});

test('a car in the tow gains on an identical car in clean air and loses downforce', () => {
  const lead = place(0, 0, 0, 60), tow = place(-15, 0, 0, 60), clean = place(-15, 50, 0, 60);
  let minDownforceRatio = 1;
  for (let i = 0; i < 3 / FIXED_DT; i++) {
    const w = wakeStrength(lead, tow);
    tow.wake = { drag: 1 - RACE_DEFAULTS.towDragLoss * w, downforce: 1 - RACE_DEFAULTS.dirtyAirLoss * w };
    for (const car of [lead, tow, clean]) step(car, { throttle: 1 }, FIXED_DT);
    minDownforceRatio = Math.min(minDownforceRatio, tow.telemetry.downforce / clean.telemetry.downforce);
  }
  assert.ok(tow.x - clean.x > 1, `tow gained ${(tow.x - clean.x).toFixed(2)} m`);
  assert.ok(tow.telemetry.speed > clean.telemetry.speed);
  assert.ok(minDownforceRatio < 0.9, `downforce ratio ${minDownforceRatio.toFixed(3)}`);
});

test('car-to-car contact separates the cars, conserves momentum and never adds energy', () => {
  for (const [dx, dy, heading] of [[5.0, 0, 0], [4.8, 1.2, 0.3], [0.5, 1.8, -0.2]]) {
    const front = place(dx, dy, heading, 40), rear = place(0, 0, 0, 50);
    rear.yawRate = 0.1;
    const px = front.vx + rear.vx, py = front.vy + rear.vy;
    const energy = car => 0.5 * car.config.mass * (car.vx ** 2 + car.vy ** 2) + 0.5 * car.config.yawInertia * car.yawRate ** 2;
    const before = energy(front) + energy(rear);
    const closing = resolveCarContact(rear, front);
    assert.ok(closing > 0, `contact at ${dx},${dy}`);
    assert.ok(Math.abs(front.vx + rear.vx - px) < 1e-9 && Math.abs(front.vy + rear.vy - py) < 1e-9, 'linear momentum');
    assert.ok(energy(front) + energy(rear) <= before + 1e-6, 'no energy gain');
    // A second resolve finds the cars separating (no second impulse).
    assert.equal(resolveCarContact(rear, front), 0);
  }
  assert.equal(resolveCarContact(place(0, 0), place(20, 0)), 0);
  // Square rear-end: the impulse acts at the face centre, so neither car spins.
  const ahead = place(5, 0, 0, 40), behind = place(0, 0, 0, 50);
  assert.ok(resolveCarContact(behind, ahead) > 9);
  assert.ok(Math.abs(ahead.yawRate) < 1e-9 && Math.abs(behind.yawRate) < 1e-9);
  assert.ok(ahead.vx > 40 && behind.vx < 50 && ahead.vx > behind.vx);
});

function runRace(seconds, input) {
  const race = createRace(track);
  let maxOffset = 0, hardestContact = 0;
  for (let i = 0; i < seconds * 240; i++) {
    race.advance(1 / 240, input?.(race) ?? null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) {
      if (input && e.player) continue;
      maxOffset = Math.max(maxOffset, Math.abs(track.offset(e.car.x, e.car.y)));
      if (e.car.contact && Math.abs(e.car.contact.time - e.car.time) < 1e-9) hardestContact = Math.max(hardestContact, e.car.contact.speed);
    }
  }
  return { race, maxOffset, hardestContact };
}

test('a five-car race runs four minutes on the road without hard contact', () => {
  const { race, maxOffset, hardestContact } = runRace(240);
  const kerbEdge = track.roadWidth / 2 + 1.2;
  assert.ok(maxOffset < kerbEdge, `max offset ${maxOffset.toFixed(2)} m`);
  assert.ok(hardestContact < 2, `hardest contact ${hardestContact.toFixed(2)} m/s`);
  const standings = race.standings();
  assert.deepEqual(standings.map(s => s.position), [1, 2, 3, 4, 5]);
  assert.ok(standings.every((s, k) => k === 0 || s.covered <= standings[k - 1].covered));
  assert.ok(standings.every(s => s.lap >= 8 && s.gap >= 0), JSON.stringify(standings));
});

test('AI cars pass a car stopped on the racing line', () => {
  const { race, maxOffset, hardestContact } = runRace(120, () => ({ brake: 1 }));
  assert.ok(maxOffset < track.roadWidth / 2 + 1.2, `max offset ${maxOffset.toFixed(2)} m`);
  assert.ok(hardestContact < 2, `hardest contact ${hardestContact.toFixed(2)} m/s`);
  const standings = race.standings();
  assert.equal(standings.at(-1).name, 'You');
  assert.ok(standings.slice(0, -1).every(s => s.lap >= 4), JSON.stringify(standings));
});

function runStart(seconds, input, seed = 7) {
  const race = createRace(track, { start: { seed } });
  const lit = new Map();
  let hardestContact = 0, moved = 0;
  for (let i = 0; i < seconds * 240; i++) {
    race.advance(1 / 240, input?.(race) ?? null, track.surfaceAt, track.barrierAt);
    const s = race.start;
    if (s.phase === 'lights') {
      if (!lit.has(s.lit)) lit.set(s.lit, race.time);
      if (!input) moved = Math.max(moved, ...race.entries.map(e => Math.abs(e.covered - e.grid)));
    }
    for (const e of race.entries)
      if (e.car.contact && Math.abs(e.car.contact.time - e.car.time) < 1e-9) hardestContact = Math.max(hardestContact, e.car.contact.speed);
  }
  return { race, lit, hardestContact, moved };
}

test('standing start: five lights one per second, a random hold, then a clean launch', () => {
  const { race, lit, hardestContact, moved } = runStart(40);
  const { lightsOut } = race.start;
  assert.deepEqual([...lit.keys()], [0, 1, 2, 3, 4, 5]);
  for (let k = 1; k <= 5; k++) assert.ok(Math.abs(lit.get(k) - k) < 0.01, `light ${k} at ${lit.get(k)}`);
  assert.ok(lightsOut >= 5.2 && lightsOut <= 8, `lights out at ${lightsOut}`);
  assert.equal(createRace(track, { start: { seed: 7 } }).start.lightsOut, lightsOut); // seeded
  assert.notEqual(createRace(track, { start: { seed: 8 } }).start.lightsOut, lightsOut);
  assert.ok(moved < 0.05, `cars crept ${moved} m on the grid`);
  assert.ok(hardestContact < 2, `hardest contact ${hardestContact.toFixed(2)} m/s`);
  const standings = race.standings();
  assert.ok(standings.every(s => !s.jumpStart && s.penalty === 0));
  for (const e of race.entries) {
    assert.ok(e.reaction >= RACE_DEFAULTS.reactionMin && e.reaction <= RACE_DEFAULTS.reactionMax + 0.01, `${e.name} reaction ${e.reaction}`);
    assert.ok(e.covered > 900, `${e.name} covered ${e.covered.toFixed(0)} m`);
  }
  assert.equal(race.start.phase, 'racing');
});

test('moving before lights out is a jump start with a time penalty; reacting after is not', () => {
  const jumped = runStart(8, () => ({ throttle: 0.6 })).race;
  assert.equal(jumped.entries[0].jumpStart, true);
  assert.equal(jumped.entries[0].penalty, RACE_DEFAULTS.jumpPenalty);
  assert.equal(jumped.standings().find(s => s.player).penalty, RACE_DEFAULTS.jumpPenalty);
  assert.ok(jumped.entries.slice(1).every(e => !e.jumpStart));
  // Hold the brake, then floor it 0.25 s after the lights go out.
  const clean = runStart(10, race => race.start.phase === 'lights' || race.start.sinceLightsOut < 0.25 ? { brake: 1 } : { throttle: 1 }).race;
  assert.equal(clean.entries[0].jumpStart, false);
  assert.ok(Math.abs(clean.entries[0].reaction - 0.25) < 0.01, `reaction ${clean.entries[0].reaction}`);
  assert.ok(clean.car.telemetry.speed > 10);
});

function runToFlag(laps, input, setup) {
  const race = createRace(track, { laps });
  setup?.(race);
  let hardestContact = 0;
  for (let i = 0; i < 400 * 240 && !race.finish.done; i++) {
    race.advance(1 / 240, input?.(race) ?? null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries)
      if (e.car.contact && Math.abs(e.car.contact.time - e.car.time) < 1e-9) hardestContact = Math.max(hardestContact, e.car.contact.speed);
    if (input && race.time > 200) break;
  }
  return { race, hardestContact };
}

test('a two-lap race ends at the chequered flag with a classification by time', () => {
  assert.deepEqual(createRace(track).finish, { laps: 0, flag: false, flagTime: null, done: false });
  const { race, hardestContact } = runToFlag(2);
  const { finish } = race, result = race.classification();
  assert.ok(finish.flag && finish.done);
  assert.ok(hardestContact < 2, `hardest contact ${hardestContact.toFixed(2)} m/s`);
  assert.deepEqual(result.map(r => r.position), [1, 2, 3, 4, 5]);
  assert.ok(result.every(r => r.finished && r.laps === 2 && r.lapsDown === 0), JSON.stringify(result));
  // The winner's time is the flag; the rest follow in order, a few seconds apart.
  assert.ok(Math.abs(result[0].time - finish.flagTime) < 1e-9 && result[0].gap === 0);
  assert.ok(result.every((r, k) => k === 0 || (r.total >= result[k - 1].total && r.gap > 0 && r.gap < 15)), JSON.stringify(result));
  // Two laps of 2 × 440 m straights and 2 × 283 m arcs at ~45 m/s average.
  assert.ok(finish.flagTime > 2 * track.length / 70 && finish.flagTime < 2 * track.length / 35, `flag at ${finish.flagTime}`);
  // Every car ran the full distance (and is now on its cool-down lap).
  for (const e of race.entries) assert.ok(e.covered > 2 * track.length);
});

test('time penalties are added to the race time; cars that never finish are unclassified at the back', () => {
  const { race } = runToFlag(1, null, r => { r.entries[0].penalty = 30; });
  const result = race.classification(), me = result.find(r => r.player);
  assert.equal(me.total, me.time + 30);
  assert.equal(me.position, 1 + result.filter(r => !r.player && r.total < me.total).length);
  assert.ok(result.every((r, k) => k === 0 || r.total >= result[k - 1].total));
  // The player parks on the grid: the AI field finishes, the player does not.
  const parked = runToFlag(1, () => ({ brake: 1 })).race;
  const final = parked.classification();
  assert.ok(parked.finish.flag && !parked.finish.done);
  assert.equal(final.at(-1).name, 'You');
  assert.equal(final.at(-1).finished, false);
  assert.equal(final.at(-1).time, null);
  assert.ok(final.slice(0, -1).every(r => r.finished && r.laps === 1));
});
