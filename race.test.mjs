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
