// Time trial on a real circuit (circuit.mjs): one car with no opponents,
// start lights, race distance or pit lane. It exposes the same shape as
// createRace (car, entries[0], advance, start, finish, standings...) so the
// browser front end drives either. The car starts `runUp` metres before the
// start/finish line on the racing line, so lap 1 begins with a flying start.
// DRS is free to use in the circuit's DRS zones, as in practice and qualifying.
import { Simulation, createCar, fitTires, newErsLap, tireTempGrip, tireWearGrip, TIRE_COMPOUNDS, FIXED_DT } from './physics.mjs';
import { createCircuitAutopilot } from './autopilot.mjs';
import { findDrsZones, inDrsZone } from './race.mjs';

export function createTimeTrial(track, { tyre = 'medium', runUp = 150, car: carSpec } = {}) {
  const car = createCar(carSpec);
  fitTires(car, tyre);
  const s0 = track.length - runUp;
  [car.x, car.y] = track.point(s0, track.lineOffset(s0));
  car.heading = track.heading(s0);
  const sim = new Simulation(car), drive = createCircuitAutopilot(track);
  // The autopilot's corner speeds scale with what builds up over a run: the
  // compound, the most overheated tyre (one below its optimum is left to the
  // plan's grip margin) and the most worn.
  const tyreGrip = () => TIRE_COMPOUNDS[car.compound].grip
    * Math.min(...car.tireTemp.map(x => x.surface > car.config.tireOptimalTemp ? tireTempGrip(car.config, x) : 1))
    * tireWearGrip(car.config, Math.max(...car.tireWear));
  const drsZones = findDrsZones(track);
  let accumulator = 0, last = track.progress(car.x, car.y);
  const entry = { name: 'You', player: true, index: 0, car, command: null, stops: [], compounds: [tyre], pit: null, pitVisit: null, pitRequest: null,
    jumpStart: false, reaction: null, penalty: 0, lane: 0, drsAllowed: false, drsGap: null };
  return {
    car, entries: [entry], drive, time: 0, pit: null, options: {}, drsZones, drsEnabled: true,
    start: { enabled: false, phase: 'race', lit: 0, lightsOut: 0, sinceLightsOut: Infinity },
    finish: { laps: 0, flag: false, flagTime: null, done: false },
    // input: the player's command, or null to let the circuit autopilot drive
    // (re-planned every physics step). Frames are capped at 0.25 s like Simulation.
    // Crossing the start/finish line forwards starts a new ERS lap.
    advance(elapsed, input, surfaceAt = track.surfaceAt, barrierAt = track.barrierAt, slopeAt = track.slopeAt) {
      accumulator += Math.min(elapsed, 0.25);
      let steps = 0;
      while (accumulator + 1e-12 >= FIXED_DT) {
        // The autopilot opens DRS throughout a zone; the player's request counts only in one.
        entry.drsAllowed = drsZones.some(z => inDrsZone(track, z, track.progress(car.x, car.y)));
        const command = input ?? { ...drive(car, { grip: tyreGrip() }), drs: true };
        entry.command = { ...command, drs: entry.drsAllowed && command.drs === true };
        sim.advance(FIXED_DT, entry.command, surfaceAt, barrierAt, slopeAt);
        const p = track.progress(car.x, car.y);
        if (last - p > track.length / 2) newErsLap(car);
        last = p;
        accumulator = Math.max(0, accumulator - FIXED_DT); steps++;
      }
      this.time = car.time;
      return steps;
    },
    standings: () => [], classification: () => [], inPitLane: () => false, requestPit() {},
  };
}
