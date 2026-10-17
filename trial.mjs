// Time trial on a real circuit (circuit.mjs): one car with no opponents,
// start lights, race distance or pit lane. It exposes the same shape as
// createRace (car, entries[0], advance, start, finish, standings...) so the
// browser front end drives either. The car starts `runUp` metres before the
// start/finish line on the racing line, so lap 1 begins with a flying start.
import { Simulation, createCar, fitTires, FIXED_DT } from './physics.mjs';
import { createCircuitAutopilot } from './autopilot.mjs';

export function createTimeTrial(track, { tyre = 'medium', runUp = 150, car: carSpec } = {}) {
  const car = createCar(carSpec);
  fitTires(car, tyre);
  const s0 = track.length - runUp;
  [car.x, car.y] = track.point(s0, track.lineOffset(s0));
  car.heading = track.heading(s0);
  const sim = new Simulation(car), drive = createCircuitAutopilot(track);
  let accumulator = 0;
  const entry = { name: 'You', player: true, index: 0, car, command: null, stops: [], compounds: [tyre], pit: null, pitVisit: null, pitRequest: null,
    jumpStart: false, reaction: null, penalty: 0, lane: 0 };
  return {
    car, entries: [entry], drive, time: 0, pit: null, options: {},
    start: { enabled: false, phase: 'race', lit: 0, lightsOut: 0, sinceLightsOut: Infinity },
    finish: { laps: 0, flag: false, flagTime: null, done: false },
    // input: the player's command, or null to let the circuit autopilot drive
    // (re-planned every physics step). Frames are capped at 0.25 s like Simulation.
    advance(elapsed, input, surfaceAt = track.surfaceAt, barrierAt = track.barrierAt) {
      accumulator += Math.min(elapsed, 0.25);
      let steps = 0;
      while (accumulator + 1e-12 >= FIXED_DT) {
        entry.command = input ?? drive(car);
        sim.advance(FIXED_DT, entry.command, surfaceAt, barrierAt);
        accumulator = Math.max(0, accumulator - FIXED_DT); steps++;
      }
      this.time = car.time;
      return steps;
    },
    standings: () => [], classification: () => [], inPitLane: () => false, requestPit() {},
  };
}
