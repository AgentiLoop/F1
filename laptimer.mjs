// Lap and sector timing with track-limits validation and a live delta to the best lap.
// Call update(car) after each physics advance (any rate): line crossings are found
// from the change in centreline progress and their times interpolated linearly
// between calls. Laps start on the first forward crossing of the start/finish line.
// Track limits follow the F1 convention: a lap is deleted when all four tire
// contact points are beyond the edge of the asphalt at the same time.

const SECTORS = 3, TRACE_STEP = 5;

export function createLapTimer(track, { lineProgress = track.halfStraight + 0.8 } = {}) {
  const L = track.length, half = track.roadWidth / 2;
  const sectorEnd = k => (k + 1) * L / SECTORS;
  // Distance past the start/finish line, in [0, L).
  const along = (x, y) => (((track.progress(x, y) - lineProgress) % L) + L) % L;
  const s = {
    started: false, lap: 0, u: 0, last: null, lapStart: 0, sectorStart: 0, nextSector: 0,
    sectors: [], valid: true, lastLap: null, bestLap: null, bestSectors: Array(SECTORS).fill(null),
    laps: [], trace: [], bestTrace: null, offTrack: false, warnings: 0,
  };
  function wheelsOff(car) {
    const c = car.config, cos = Math.cos(car.heading), sin = Math.sin(car.heading);
    const fx = c.wheelbase * (1 - c.frontWeight), rx = -c.wheelbase * c.frontWeight, hy = c.track / 2;
    return [[fx, hy], [fx, -hy], [rx, hy], [rx, -hy]]
      .every(([bx, by]) => Math.abs(track.offset(car.x + bx * cos - by * sin, car.y + bx * sin + by * cos)) > half);
  }
  // Time at which progress u reached `target`, between the previous and current call.
  const crossTime = (u0, t0, u1, t1, target) => t0 + (t1 - t0) * (u1 === u0 ? 1 : (target - u0) / (u1 - u0));
  function reference(u) {
    const tr = s.bestTrace;
    if (!tr || u < 0 || u > tr[tr.length - 1][0]) return null;
    let lo = 0, hi = tr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr[m][0] <= u) lo = m; else hi = m; }
    const [ua, ta] = tr[lo], [ub, tb] = tr[hi];
    return ta + (tb - ta) * (ub === ua ? 0 : (u - ua) / (ub - ua));
  }
  function update(car) {
    const now = car.time, a = along(car.x, car.y);
    if (!s.last) { s.last = { a, t: now }; s.u = a - L; return s; }
    let d = a - s.last.a;
    if (d < -L / 2) d += L; else if (d > L / 2) d -= L;
    const u0 = s.u, t0 = s.last.t, u1 = u0 + d;
    s.u = u1; s.last = { a, t: now };
    if (!s.started) {
      if (u0 < 0 && u1 >= 0) {
        const t = crossTime(u0, t0, u1, now, 0);
        Object.assign(s, { started: true, lap: s.laps.length + 1, lapStart: t, sectorStart: t, nextSector: 0, sectors: [], valid: true, trace: [[0, 0]] });
        s.u = u1;
      } else return s;
    }
    while (s.nextSector < SECTORS && s.u >= sectorEnd(s.nextSector)) {
      const t = crossTime(u0, t0, u1, now, sectorEnd(s.nextSector));
      const k = s.nextSector, split = t - s.sectorStart;
      s.sectors.push(split);
      if (s.valid && (s.bestSectors[k] === null || split < s.bestSectors[k])) s.bestSectors[k] = split;
      s.sectorStart = t; s.nextSector++;
      if (s.nextSector === SECTORS) {
        const time = t - s.lapStart, valid = s.valid;
        s.trace.push([L, time]);
        s.laps.push({ lap: s.lap, time, sectors: s.sectors, valid });
        s.lastLap = { time, valid };
        if (valid && (s.bestLap === null || time < s.bestLap)) { s.bestLap = time; s.bestTrace = s.trace; }
        s.lap++; s.u -= L;
        Object.assign(s, { lapStart: t, nextSector: 0, sectors: [], valid: true, trace: [[0, 0]] });
      }
    }
    const off = wheelsOff(car);
    if (off) { if (!s.offTrack) s.warnings++; s.valid = false; }
    s.offTrack = off;
    if (s.u - s.trace[s.trace.length - 1][0] >= TRACE_STEP) s.trace.push([s.u, now - s.lapStart]);
    return s;
  }
  return {
    state: s, update, along,
    // Abort the lap in progress (car reset): the next forward line crossing starts a new
    // lap; completed laps and session bests are kept.
    restart() { Object.assign(s, { started: false, last: null, u: 0, nextSector: 0, sectors: [], valid: true, trace: [], offTrack: false }); },
    // Current lap time, and the gap to the best lap at the same distance (null if none).
    current(car) { return s.started ? car.time - s.lapStart : null; },
    delta(car) {
      if (!s.started) return null;
      const ref = reference(s.u);
      return ref === null ? null : car.time - s.lapStart - ref;
    },
  };
}

export function formatLapTime(t) {
  if (t === null || t === undefined || !Number.isFinite(t)) return '–:––.–––';
  const m = Math.floor(t / 60), sec = t - 60 * m;
  return `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}
