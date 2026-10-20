import test from 'node:test';
import assert from 'node:assert/strict';
import { createCar, step, FIXED_DT } from '../src/physics.mjs';
import { createStadiumTrack } from '../src/track.mjs';
import { createRace, wakeStrength, resolveCarContact, RACE_DEFAULTS, DEFAULT_GRID } from '../src/race.mjs';

const track = createStadiumTrack({ halfStraight: 220, radius: 90, roadWidth: 15 });
const place = (x, y, heading = 0, speed = 0) => Object.assign(createCar(), { x, y, heading, vx: speed * Math.cos(heading), vy: speed * Math.sin(heading) });

test('the player starts behind every opponent and solo starts stay on pole', () => {
  for (const start of [false, { seed: 7 }]) for (const count of [0, 1, DEFAULT_GRID.length]) {
    const race = createRace(track, { grid: DEFAULT_GRID.slice(0, count), start });
    assert.equal(race.car, race.entries[0].car);
    assert.equal(race.entries[0].player, true);
    assert.equal(race.standings().at(-1).index, 0);
    assert.equal(race.car.x, count ? -RACE_DEFAULTS.gridSpacing * count : 0);
    assert.equal(race.car.y, -(track.radius + (count === 0 ? 0 : (count % 2 ? -1 : 1) * 2.6)));
    assert.ok(race.entries.slice(1).every(e => e.covered > race.entries[0].covered));
    assert.deepEqual(race.standings().map(e => e.index), [...Array.from({ length: count }, (_, i) => i + 1), 0]);
  }
});

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
  assert.ok(minDownforceRatio < 0.95, `downforce ratio ${minDownforceRatio.toFixed(3)}`);
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
  const jumped = runStart(8, race => race.time < 1 ? { throttle: 0.6 } : { brake: 1 }).race;
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

function runPitRace(laps, setup) {
  const race = createRace(track, { laps, compoundRule: true, start: { seed: 3 } });
  setup?.(race);
  let hardestContact = 0, pitSpeed = 0;
  for (let i = 0; i < 400 * 240 && !race.finish.done; i++) {
    race.advance(1 / 240, null, track.surfaceAt, track.barrierAt);
    for (const e of race.entries) {
      if (e.car.contact && Math.abs(e.car.contact.time - e.car.time) < 1e-9) hardestContact = Math.max(hardestContact, e.car.contact.speed);
      const s = track.progress(e.car.x, e.car.y);
      if (e.car.y < 0 && s > track.pit.limitStart + 5 && s < track.pit.limitEnd && track.offset(e.car.x, e.car.y) < -track.pit.inner) pitSpeed = Math.max(pitSpeed, e.car.telemetry.speed);
    }
  }
  return { race, hardestContact, pitSpeed };
}

test('under the two-compound rule every car makes one clean pit stop and changes compound', () => {
  const { race, hardestContact, pitSpeed } = runPitRace(3);
  assert.ok(race.finish.done && race.compoundRule);
  assert.ok(hardestContact < 2, `hardest contact ${hardestContact.toFixed(2)} m/s`);
  assert.ok(pitSpeed <= track.pit.speedLimit + 0.5, `pit lane speed ${pitSpeed.toFixed(2)} m/s`);
  for (const e of race.entries) {
    assert.equal(e.stops.length, 1, e.name);
    const [stop] = e.stops;
    assert.ok(stop.lap >= 1 && stop.lap <= 3, `${e.name} stopped on lap ${stop.lap}`);
    assert.ok(stop.service >= RACE_DEFAULTS.stopTimeMin && stop.service <= RACE_DEFAULTS.stopTimeMax && stop.stationary >= stop.service && stop.stationary < stop.service + 10, `${e.name} serviced ${stop.service} s, stood ${stop.stationary} s`);
    assert.equal(stop.compound, e.tyres[1]);
    assert.equal(e.car.compound, e.tyres[1]);
    assert.notEqual(e.compounds[0], e.compounds[1]);
    assert.equal(e.penalty, 0);
  }
  const result = race.classification();
  assert.ok(result.every(r => r.finished && !r.dsq && r.stops === 1 && r.laps === 3), JSON.stringify(result));
});

test('a finisher who never changes compound is disqualified and classified last', () => {
  const { race } = runPitRace(2, r => { r.entries[0].stopLap = null; });
  const result = race.classification(), me = result.find(r => r.player);
  assert.ok(race.finish.done);
  assert.deepEqual([me.position, me.dsq, me.finished, me.stops, me.gap], [5, true, true, 0, null]);
  assert.ok(result.slice(0, -1).every(r => !r.dsq && r.stops === 1));
  // Without the rule nobody stops in a short race on healthy tires.
  const free = createRace(track, { laps: 2 });
  assert.equal(free.compoundRule, false);
  assert.ok(free.entries.every(e => e.stopLap === null));
});

test('the player can request a stop and a compound; the autopilot boxes and fits it', () => {
  const race = createRace(track);
  race.requestPit('soft');
  race.requestPit('intermediate'); // unknown compounds are ignored
  assert.equal(race.entries[0].pitRequest, 'soft');
  for (let i = 0; i < 70 * 240 && !race.entries[0].stops.length; i++) race.advance(1 / 240, null, track.surfaceAt, track.barrierAt);
  const me = race.entries[0];
  assert.equal(me.stops.length, 1);
  assert.equal(me.car.compound, 'soft');
  assert.equal(me.pitRequest, null);
  assert.deepEqual(me.car.tireWear, [0, 0, 0, 0]);
  assert.ok(race.entries.slice(1).every(e => !e.stops.length));
});

test('pit lane: the limiter cuts drive, speeding costs a penalty, a car stopped in its box is serviced', () => {
  const { pit } = track, at = (car, s, offset, speed) => Object.assign(car, { x: s - 220, y: -(90 + offset), heading: 0, vx: speed, vy: 0 });
  const fast = createRace(track);
  at(fast.car, pit.limitStart + 20, pit.lane, 30);
  fast.advance(0.2, { throttle: 1 }, track.surfaceAt, track.barrierAt);
  assert.equal(fast.entries[0].command.throttle, 0);
  assert.equal(fast.entries[0].penalty, RACE_DEFAULTS.pitSpeedingPenalty);
  fast.advance(0.2, { throttle: 1 }, track.surfaceAt, track.barrierAt);
  assert.equal(fast.entries[0].penalty, RACE_DEFAULTS.pitSpeedingPenalty); // once per visit
  const box = createRace(track), me = box.entries[0];
  box.requestPit('hard');
  at(box.car, me.box, pit.boxOffset, 0);
  for (let i = 0; i < 5 * 240; i++) box.advance(1 / 240, { brake: 1 }, track.surfaceAt, track.barrierAt);
  assert.equal(me.stops.length, 1);
  assert.equal(me.car.compound, 'hard');
  assert.ok(me.compounds.includes('medium') && me.compounds.includes('hard'));
});

test('a race with a distance fuels every car for it; the burn-off lightens the car', () => {
  const race = createRace(track, { grid: [{ name: 'A', cornerSpeed: 43, brakeDecel: 26 }, { name: 'B', cornerSpeed: 43, brakeDecel: 26, car: { fuelLoad: 20 } }], laps: 10 });
  const o = RACE_DEFAULTS, load = 10 * o.fuelPerLap * (1 + o.fuelMargin) + o.fuelReserve;
  assert.ok(Math.abs(race.entries[0].car.fuel - load) < 1e-9 && Math.abs(race.entries[1].car.fuel - load) < 1e-9);
  assert.equal(race.entries[2].car.fuel, 20); // an explicit load is kept
  assert.equal(createRace(track, { grid: [], laps: 0 }).car.fuel, null);
  assert.equal(createRace(track, { grid: [], laps: 5, fuel: false }).car.fuel, null);
  for (let i = 0; i < 240 * 40; i++) race.advance(FIXED_DT, null, track.surfaceAt, track.barrierAt);
  // About one lap: burn close to the planned per-lap figure.
  const burnt = load - race.car.fuel, lap = race.entries[0].covered / track.length;
  assert.ok(Math.abs(burnt / lap - o.fuelPerLap) < 0.08, `${(burnt / lap).toFixed(3)} kg/lap`);
  assert.ok(race.standings().every(s => s.fuel > 0));
});

test('an AI car stuck for retireAfter seconds retires: classified after running cars, and the race can end without it', () => {
  const race = createRace(track, { grid: [{ ...DEFAULT_GRID[0], car: { fuelLoad: 0 } }], laps: 1 }), out = race.entries[1];
  race.advance(0.25, null, track.surfaceAt, track.barrierAt);
  for (let t = 0; t < RACE_DEFAULTS.retireAfter + 3; t += 0.25) race.advance(0.25, null, track.surfaceAt, track.barrierAt);
  assert.ok(out.retired && out.retired.lap === 1, JSON.stringify(out.retired));
  assert.equal(out.command.brake, 1);
  let rows = race.classification();
  assert.equal(rows[0].player, true); assert.equal(rows[1].retired, true);
  assert.equal(race.standings().find(s => !s.player).retired, true);
  while (!race.finish.done && race.time < 120) race.advance(0.25, null, track.surfaceAt, track.barrierAt);
  assert.ok(race.finish.done, 'done once the player finishes');
  rows = race.classification();
  assert.ok(rows[0].finished && rows[1].retired && !rows[1].finished);
});
