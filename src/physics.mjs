// SI units. Body x forward, y left; positive yaw/steer turns left.
// Illustrative parameters, not telemetry-calibrated or a regulatory specification.
export const DEFAULT_CAR = Object.freeze({
  mass: 800, yawInertia: 1600, wheelbase: 3.6, track: 1.6,
  cgHeight: 0.3, frontWeight: 0.46, frontAero: 0.40, frontRollShare: 0.58,
  airDensity: 1.225, downforceArea: 5.0, dragArea: 1.25,
  // Stiffer rear tires (wider, more loaded) give mild understeer at the limit.
  // Cornering stiffness is quoted at the static wheel load and grows with load
  // as (load / static)^stiffnessLoadExponent, so a loaded outside tire (or one
  // pressed down by downforce) builds force at a smaller slip angle than a
  // light inside one, and both reach their peak nearly together. tireMu is set so the
  // circuit autopilot's corner speeds come close to the 2024 race telemetry
  // (OpenF1), where the cars pull ~2.5 g in slow corners and 4.5-5 g in fast ones.
  tireMu: 2.1, loadSensitivity: 0.08, corneringStiffness: 85000, rearCorneringStiffness: 115000,
  stiffnessLoadExponent: 0.8,
  slidingGripRatio: 0.85, slidingFalloff: 3,
  longitudinalStiffness: 100000, wheelRadius: 0.33, wheelInertia: 1.6,
  slipSpeedFloor: 1, relaxationLength: 0.45, relaxationSpeedFloor: 5,
  // ICE crank torque (rpm, N·m) at full throttle; peak ~575 kW (ERS adds up to 120 kW).
  torqueCurve: Object.freeze([[4000, 250], [6000, 330], [8000, 400], [10000, 450],
    [11000, 465], [12000, 455], [13000, 420], [15000, 330]]),
  maxRpm: 15000, limiterBand: 250, idleRpm: 4000, launchRpm: 7000,
  engineBrakeTorque: 80, drivelineEfficiency: 0.95,
  // Overall ratios (gearbox x final drive), engine rpm per wheel rpm.
  gearRatios: Object.freeze([12.9, 10.6, 9.0, 7.8, 6.85, 6.05, 5.35, 4.75]),
  reverseRatio: 45, // Illustrative recovery ratio, not measured gearbox data.
  shiftTime: 0.03, autoShift: true, upshiftRpm: 12800, downshiftRpm: 10500,
  diffPreload: 150, diffRamp: 0.3, diffLockRate: 120,
  maxBrakeForce: 34000,
  brakeBias: 0.59, rollingResistance: 0.015,
  maxSteer: 0.38, steerRate: 1.2,
  // Sprung-body modes (illustrative): roll/pitch about axes near the ground,
  // heave against the aero platform springs. Damping as a ratio of critical.
  rollStiffness: 400000, rollInertia: 120, pitchStiffness: 600000, pitchInertia: 650,
  heaveStiffness: 700000, bodyDampingRatio: 0.6,
  // Ride-height aero map (illustrative): static ride heights at the axles (m),
  // ground-effect downforce gain per metre the floor runs below its static
  // height, floor stall below stallHeight (losing up to stallLoss at the
  // ground), and the front-share shift per metre of rake beyond static.
  frontRideHeight: 0.04, rearRideHeight: 0.08, groundEffectGain: 4,
  stallHeight: 0.012, stallLoss: 0.3, rakeBalanceGain: 1.5,
  // Rigid footprint for barrier contact (m from the CG) and wall impact response.
  bodyFront: 2.95, bodyRear: 2.35, bodyHalfWidth: 1.0, wallRestitution: 0.25, wallFriction: 0.5,
  // Two-node tire thermal model (illustrative, °C, W/K, J/K): tread surface and
  // carcass. Sliding power heats the surface (tireSlipHeatShare of it; the rest
  // goes into the road), rolling hysteresis heats the carcass. Air cooling grows
  // with speed; the surface also conducts to the track. Grip peaks at the
  // optimum temperature and falls quadratically (capped) either side.
  ambientTemp: 25, trackTemp: 35, tireStartTemp: 70, tireOptimalTemp: 100, tireWindow: 35,
  tireTempGripLoss: 0.12, tireMinTempGrip: 0.8, tireSurfaceGripWeight: 0.6,
  tireSurfaceHeatCapacity: 2500, tireCarcassHeatCapacity: 16000, tireSlipHeatShare: 0.5,
  tireSurfaceCooling: 12, tireSurfaceCoolingPerSpeed: 1.6, tireRoadConduction: 25,
  tireCoreConduction: 250, tireCarcassCooling: 8, tireCarcassCoolingPerSpeed: 0.4,
  // Tread wear (illustrative): fraction of usable tread lost per joule of contact
  // sliding energy (tireWearEnergy wears a tire out at the optimum), accelerated
  // exponentially when the surface runs hot. Grip falls linearly with wear and
  // drops off a cliff once the tread is nearly gone.
  tireWearEnergy: 200e6, tireWearTempScale: 20, tireWearGripLoss: 0.08,
  tireCliffWear: 0.75, tireCliffGripLoss: 0.15, tireStartWear: 0,
  tireCompound: 'medium',
  // Fuel (illustrative): fuelLoad kg on board at the start (null = not
  // modelled: no mass, never runs dry), burnt in proportion to positive crank
  // work (fuelPerJoule ≈ the 100 kg/h flow limit at peak power). The fuel adds
  // to the mass at the CG; an empty tank starves the engine of drive.
  fuelLoad: null, fuelPerJoule: 4.8e-8,
  // ERS (illustrative, after the 2014-25 power-unit rules): the MGU-K adds up
  // to ersPower at the crank (at most ersMaxTorque) with the throttle, and
  // harvests up to ersPower of the rear friction braking (brake-by-wire keeps
  // the total brake force). The store holds ersCapacity J; per lap at most
  // ersDeployPerLap goes to the MGU-K and ersHarvestPerLap comes from it
  // (newErsLap resets the lap counts at the line). The MGU-H puts ersHeatShare
  // of the ICE power into the store, not lap-limited. Deployment starts at
  // ersMinSpeed (the 100 km/h race-start rule, applied everywhere here, which
  // also keeps it out of first-gear wheelspin). ers: false = no ERS.
  ers: true, ersPower: 120000, ersMaxTorque: 200, ersCapacity: 4e6, ersStartCharge: 1,
  ersDeployPerLap: 4e6, ersHarvestPerLap: 2e6, ersHeatShare: 0.06, ersMinSpeed: 100 / 3.6, ersSpeedBlend: 5,
  // DRS (illustrative, after the 2011-25 rules): input.drs true opens the
  // rear-wing flap at drsRate of full travel per second; braking (> drsBrake)
  // or no request closes it at the same rate. Fully open it sheds drsDragLoss of
  // the drag and drsDownforceLoss of the downforce, all of it from the rear
  // (the balance moves forward). Where it may open is up to race.mjs.
  drsDragLoss: 0.12, drsDownforceLoss: 0.1, drsRate: 4, drsBrake: 0.05,
});
// Dry compounds (illustrative): peak-grip multiplier and wear-rate multiplier
// relative to the medium. Softer rubber grips more and wears faster.
export const TIRE_COMPOUNDS = Object.freeze({
  soft: Object.freeze({ grip: 1.015, wear: 2 }),
  medium: Object.freeze({ grip: 1, wear: 1 }),
  hard: Object.freeze({ grip: 0.985, wear: 0.55 }),
});
export const FIXED_DT = 1 / 240;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const RPM = 60 / (2 * Math.PI);

export function createCar(overrides = {}) {
  const config = { ...DEFAULT_CAR, ...overrides };
  return {
    config,
    x: 0, y: 0, heading: 0, vx: 0, vy: 0, yawRate: 0,
    steer: 0, ax: 0, ay: 0, time: 0, distance: 0,
    wheelOmega: [0, 0, 0, 0],
    slipAngle: [0, 0, 0, 0],
    gear: 1, shiftTimer: 0, impact: null,
    // Aero multipliers from running in another car's wake (set by race.mjs).
    wake: { drag: 1, downforce: 1 },
    // DRS flap position (0 closed, 1 open).
    drs: 0,
    // roll > 0: left side up; pitch > 0: nose down; heave > 0: body lower (m).
    body: { roll: 0, rollRate: 0, pitch: 0, pitchRate: 0, heave: 0, heaveRate: 0 },
    // FL, FR, RL, RR tread surface and carcass temperatures (°C).
    tireTemp: [0, 1, 2, 3].map(() => ({ surface: config.tireStartTemp, carcass: config.tireStartTemp })),
    // FL, FR, RL, RR tread wear fraction (0 new, 1 worn out).
    tireWear: [0, 1, 2, 3].map(() => config.tireStartWear),
    compound: compoundOf(config.tireCompound),
    fuel: config.fuelLoad,
    // Energy store charge and this lap's MGU-K deployment and harvest (J).
    ers: config.ers ? { charge: config.ersCapacity * config.ersStartCharge, deployed: 0, harvested: 0 } : null,
    telemetry: { speed: 0, downforce: 0, drag: 0, wheels: [], powertrain: null },
  };
}

// Start a new lap for the ERS per-lap deployment and harvest limits.
export function newErsLap(car) {
  if (car.ers) car.ers.deployed = car.ers.harvested = 0;
}

// Total mass: the car (with driver) plus the fuel on board (kg).
export const carMass = car => car.config.mass + (car.fuel ?? 0);

function compoundOf(name) {
  if (!TIRE_COMPOUNDS[name]) throw new RangeError(`Unknown tire compound: ${name}`);
  return name;
}

// Fit a new set of tires (a pit stop): unworn tread at blanket temperature.
export function fitTires(car, compound = car.compound) {
  car.compound = compoundOf(compound);
  car.tireWear.fill(0);
  for (const t of car.tireTemp) t.surface = t.carcass = car.config.tireStartTemp;
}

// Thermal grip multiplier from a surface/carcass blend around the optimum.
export function tireTempGrip(c, temp) {
  const t = c.tireSurfaceGripWeight * temp.surface + (1 - c.tireSurfaceGripWeight) * temp.carcass;
  return clamp(1 - c.tireTempGripLoss * ((t - c.tireOptimalTemp) / c.tireWindow) ** 2, c.tireMinTempGrip, 1);
}

// Wear grip multiplier: linear loss plus a quadratic cliff past tireCliffWear.
export function tireWearGrip(c, wear) {
  const w = clamp(wear, 0, 1), cliff = Math.max(0, w - c.tireCliffWear) / (1 - c.tireCliffWear);
  return 1 - c.tireWearGripLoss * w - c.tireCliffGripLoss * cliff * cliff;
}

// New wear fraction after sliding at slipPower (W) with the given surface temperature.
export function updateTireWear(wear, c, slipPower, surfaceTemp, dt) {
  const heat = Math.exp(Math.max(0, surfaceTemp - c.tireOptimalTemp) / c.tireWearTempScale);
  return Math.min(1, wear + slipPower * heat * dt / c.tireWearEnergy);
}

// Advance one tire's temperatures (semi-implicit, stable for any dt).
// slipPower: frictional power at the contact (W); rollingPower: hysteresis (W).
export function updateTireTemp(temp, c, slipPower, rollingPower, speed, dt) {
  const hs = c.tireSurfaceCooling + c.tireSurfaceCoolingPerSpeed * speed, hr = c.tireRoadConduction, k = c.tireCoreConduction;
  const hc = c.tireCarcassCooling + c.tireCarcassCoolingPerSpeed * speed;
  const as = dt / c.tireSurfaceHeatCapacity, ac = dt / c.tireCarcassHeatCapacity;
  temp.surface = (temp.surface + as * (c.tireSlipHeatShare * slipPower + hs * c.ambientTemp + hr * c.trackTemp + k * temp.carcass))
    / (1 + as * (hs + hr + k));
  temp.carcass = (temp.carcass + ac * (rollingPower + hc * c.ambientTemp + k * temp.surface)) / (1 + ac * (hc + k));
  return temp;
}

// Crank torque: interpolated full-throttle curve with a soft fuel-cut limiter,
// blended with closed-throttle engine braking proportional to rpm.
export function engineTorque(c, rpm, throttle) {
  const curve = c.torqueCurve;
  let full = curve[curve.length - 1][1];
  if (rpm <= curve[0][0]) full = curve[0][1];
  else for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [r0, t0] = curve[i - 1], [r1, t1] = curve[i];
      full = t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
      break;
    }
  }
  full *= clamp((c.maxRpm - rpm) / c.limiterBand, 0, 1);
  return throttle * full - (1 - throttle) * c.engineBrakeTorque * Math.max(rpm, 0) / c.maxRpm;
}

// Driven-axle and road-speed shaft rates (rad/s). Shift logic checks both so
// wheelspin cannot trigger upshifts and locked wheels cannot hide an over-rev.
function shaftOmegas(car) {
  const road = (car.vx * Math.cos(car.heading) + car.vy * Math.sin(car.heading)) / car.config.wheelRadius;
  return [(car.wheelOmega[2] + car.wheelOmega[3]) / 2, road];
}

// Sequential shift with torque interruption; refuses downshifts that over-rev.
export function shift(car, direction) {
  const c = car.config, next = car.gear + Math.sign(direction);
  if (car.gear < 1 || car.shiftTimer > 0 || next < 1 || next > c.gearRatios.length || next === car.gear) return false;
  if (next < car.gear && Math.max(...shaftOmegas(car)) * c.gearRatios[next - 1] * RPM > c.maxRpm) return false;
  car.gear = next;
  car.shiftTimer = c.shiftTime;
  return true;
}

// Axle ride heights from the sprung-body state (pitch about the CG, heave
// down), the floor's ground-effect downforce factor and the aero balance.
// Ride heights are clamped at the plank (0); bottoming flags the contact.
export function aeroMap(car) {
  const c = car.config, b = car.body;
  const frontArm = c.wheelbase * (1 - c.frontWeight), rearArm = c.wheelbase * c.frontWeight;
  const rawFront = c.frontRideHeight - b.heave - b.pitch * frontArm;
  const rawRear = c.rearRideHeight - b.heave + b.pitch * rearArm;
  const front = Math.max(0, rawFront), rear = Math.max(0, rawRear);
  const floor = (front + rear) / 2, reference = (c.frontRideHeight + c.rearRideHeight) / 2;
  const atStall = 1 + c.groundEffectGain * (reference - c.stallHeight);
  const factor = floor >= c.stallHeight ? 1 + c.groundEffectGain * (reference - floor)
    : atStall * (1 - c.stallLoss * (c.stallHeight - floor) / c.stallHeight);
  const rake = rear - front, staticRake = c.rearRideHeight - c.frontRideHeight;
  const frontShare = clamp(c.frontAero + c.rakeBalanceGain * (rake - staticRake), 0.3, 0.55);
  return { front, rear, factor, frontShare, stalled: floor < c.stallHeight,
    bottoming: rawFront <= 0 || rawRear <= 0 };
}

// gravity: the weight's share pressing into the road (m/s², 9.81 on the flat).
export function wheelLoads(car, downforce, frontShare = car.config.frontAero, gravity = 9.81) {
  const c = car.config, m = carMass(car);
  const total = m * gravity + downforce;
  const front = clamp(m * gravity * c.frontWeight + downforce * frontShare
    - m * car.ax * c.cgHeight / c.wheelbase, 0, total);
  const rear = total - front;
  // Quasi-static transfer split by roll stiffness (front-biased for stability).
  const transfer = m * car.ay * c.cgHeight / c.track;
  const frontLeft = clamp(front / 2 - transfer * c.frontRollShare, 0, front);
  const rearLeft = clamp(rear / 2 - transfer * (1 - c.frontRollShare), 0, rear);
  return [frontLeft, front - frontLeft, rearLeft, rear - rearLeft];
}

// Sprung-body roll, pitch and heave as damped oscillators driven by the
// chassis accelerations and downforce. Backward Euler: stable for any dt.
// Pitch and heave set the ride heights of the aero map (next step's
// downforce); wheel loads themselves stay quasi-static.
export function updateBody(car, ax, ay, downforce, dt) {
  const c = car.config, b = car.body, m = carMass(car), h = m * c.cgHeight;
  const mode = (x, rate, force, k, inertia) => {
    const damping = 2 * c.bodyDampingRatio * Math.sqrt(k * inertia);
    const next = (rate + dt * (force - k * x) / inertia) / (1 + dt * damping / inertia + dt * dt * k / inertia);
    return [x + dt * next, next];
  };
  [b.roll, b.rollRate] = mode(b.roll, b.rollRate, h * ay, c.rollStiffness, c.rollInertia);
  [b.pitch, b.pitchRate] = mode(b.pitch, b.pitchRate, -h * ax, c.pitchStiffness, c.pitchInertia);
  [b.heave, b.heaveRate] = mode(b.heave, b.heaveRate, downforce, c.heaveStiffness, m);
  return b;
}

export const steadySlipAngle = (lateralSpeed, forwardSpeed) =>
  Math.atan2(lateralSpeed, Math.max(Math.abs(forwardSpeed), 3));

// First-order carcass lag: the force-producing slip angle approaches the
// kinematic one over relaxationLength metres of travel. Exact exponential
// update stays stable for any dt; a speed floor keeps it responsive near rest.
export function relaxSlipAngle(previous, steady, travelSpeed, c, dt) {
  const speed = Math.max(Math.abs(travelSpeed), c.relaxationSpeedFloor);
  return steady + (previous - steady) * Math.exp(-speed * dt / c.relaxationLength);
}

export function tireForce(longitudinalDemand, lateralSpeed, forwardSpeed, load, grip, c, dt,
  slipAngle = steadySlipAngle(lateralSpeed, forwardSpeed), corneringStiffness = c.corneringStiffness) {
  const referenceLoad = c.mass * 9.81 / 4;
  const mu = c.tireMu * grip * Math.pow(Math.max(load, 1) / referenceLoad, -c.loadSensitivity);
  const capacity = mu * load;
  if (capacity <= 0) return { fx: 0, fy: 0, capacity: 0, utilization: 0, slipAngle,
    combinedDemand: 0, sliding: false };
  // Combine unsaturated demands before shaping either component: lockup or
  // wheelspin consumes lateral authority as well as longitudinal grip.
  const lateralDemand = -corneringStiffness * slipAngle;
  const requested = Math.hypot(longitudinalDemand, lateralDemand);
  const combinedDemand = requested / capacity;
  // C1-continuous illustrative envelope: unit initial slope, peak at q=2,
  // then a smooth decay to slidingGripRatio. Not a fitted tire-data curve.
  const envelope = combinedDemand <= 2
    ? combinedDemand * (1 - combinedDemand / 4)
    : c.slidingGripRatio + (1 - c.slidingGripRatio)
      * Math.exp(-(((combinedDemand - 2) / c.slidingFalloff) ** 2));
  const scale = requested > 0 ? capacity * envelope / requested : 1;
  const fx = longitudinalDemand * scale;
  let fy = lateralDemand * scale;
  // Regularize the low-speed contact damping to avoid a standstill oscillation.
  const lateralLimit = Math.abs(lateralSpeed) * c.mass / (4 * dt);
  fy = clamp(fy, -lateralLimit, lateralLimit);
  return { fx, fy, capacity, utilization: Math.hypot(fx, fy) / capacity, slipAngle,
    combinedDemand, sliding: combinedDemand > 2 };
}

// Rigid barrier contact on the body footprint. barrierAt(x, y) returns
// { depth, nx, ny } (unit normal pointing back onto the circuit) or null.
// The car is pushed out by the deepest corner and gets one impulse at the
// depth-weighted centre of the penetrating corners (a flat face hitting flat
// on gets no spurious spin): restitution along the normal, Coulomb-capped
// scrub along the wall, both coupled to yaw.
// Returns the closing speed at the contact (m/s), 0 when nothing hits.
export function resolveBarrier(car, barrierAt) {
  const c = car.config, m = carMass(car), cos = Math.cos(car.heading), sin = Math.sin(car.heading);
  let hit = null, weight = 0, rx = 0, ry = 0;
  for (const [bx, by] of [[c.bodyFront, c.bodyHalfWidth], [c.bodyFront, -c.bodyHalfWidth],
    [-c.bodyRear, c.bodyHalfWidth], [-c.bodyRear, -c.bodyHalfWidth]]) {
    const cx = bx * cos - by * sin, cy = bx * sin + by * cos;
    const contact = barrierAt(car.x + cx, car.y + cy);
    if (!contact || contact.depth <= 0) continue;
    if (!hit || contact.depth > hit.depth) hit = contact;
    weight += contact.depth; rx += cx * contact.depth; ry += cy * contact.depth;
  }
  if (!hit) return 0;
  rx /= weight; ry /= weight;
  const { nx, ny, depth } = hit;
  car.x += nx * depth;
  car.y += ny * depth;
  const pvx = car.vx - car.yawRate * ry, pvy = car.vy + car.yawRate * rx;
  const closing = -(pvx * nx + pvy * ny);
  if (closing <= 0) return 0;
  const tx = -ny, ty = nx;
  const rn = rx * ny - ry * nx, rt = rx * ty - ry * tx;
  const jn = (1 + c.wallRestitution) * closing / (1 / m + rn * rn / c.yawInertia);
  const jt = clamp(-(pvx * tx + pvy * ty) / (1 / m + rt * rt / c.yawInertia),
    -c.wallFriction * jn, c.wallFriction * jn);
  const jx = jn * nx + jt * tx, jy = jn * ny + jt * ty;
  car.vx += jx / m;
  car.vy += jy / m;
  car.yawRate += (rx * jy - ry * jx) / c.yawInertia;
  car.impact = { speed: closing, time: car.time, x: car.x + rx, y: car.y + ry };
  return closing;
}

// surfaceAt receives each contact's world position and returns a grip multiplier;
// optional barrierAt (see resolveBarrier) stops the car at walls.
// Optional groundAt(x, y) (circuit.mjs) gives the ground under the car:
// { gx, gy } its gradient and zss the road profile's second derivative along
// the lap. The weight's share along the slope pulls the car downhill (and
// down a banking's cross-slope); the share into the road, plus the push of
// a compression (less over a crest) and of cornering against a banking
// (N = m cos θ (g + zss u² − a·∇z), a the cornering acceleration across the
// slope), sets the wheel loads.
export function step(car, input = {}, dt = FIXED_DT, surfaceAt = () => 1, barrierAt = null, groundAt = null) {
  if (!(Number.isFinite(dt) && dt > 0 && dt <= 1 / 60)) throw new RangeError('Use a positive timestep <= 1/60 s');
  const c = car.config, m = carMass(car);
  // An empty tank starves the engine: no drive, whatever the pedal.
  const throttle = car.fuel == null || car.fuel > 0 ? clamp(input.throttle || 0, 0, 1) : 0;
  const brake = clamp(input.brake || 0, 0, 1);
  // Explicit direction requests wait for stopped chassis/wheels and safe pedals.
  const requestedGear = input.reverse === true ? -1 : input.reverse === false ? 1 : car.gear;
  if ((requestedGear < 0) !== (car.gear < 0) && car.shiftTimer === 0 && !input.throttle && brake > 0.5
    && Math.hypot(car.vx, car.vy) < 0.2 && car.wheelOmega.every(w => Math.abs(w * c.wheelRadius) < 0.2)) {
    car.gear = requestedGear;
    car.shiftTimer = c.shiftTime;
  }
  const targetSteer = clamp(input.steer || 0, -1, 1) * c.maxSteer;
  car.steer += clamp(targetSteer - car.steer, -c.steerRate * dt, c.steerRate * dt);
  const cos = Math.cos(car.heading), sin = Math.sin(car.heading);
  const u = car.vx * cos + car.vy * sin;
  const v = -car.vx * sin + car.vy * cos;
  const speed = Math.hypot(u, v);
  const q = 0.5 * c.airDensity * speed * speed;
  const aero = aeroMap(car);
  // DRS flap: opens on request, closes on the brakes or without a request.
  const drsTarget = input.drs === true && brake <= c.drsBrake ? 1 : 0;
  car.drs = clamp(drsTarget, (car.drs ?? 0) - c.drsRate * dt, (car.drs ?? 0) + c.drsRate * dt);
  const drsDownforce = 1 - c.drsDownforceLoss * car.drs;
  const wake = car.wake ?? { drag: 1, downforce: 1 }, dragArea = c.dragArea * wake.drag * (1 - c.drsDragLoss * car.drs);
  const downforce = q * c.downforceArea * aero.factor * wake.downforce * drsDownforce;
  const drag = q * dragArea;
  // The open flap only unloads the rear: the front's share of what is left grows.
  const frontShare = aero.frontShare / drsDownforce;
  let gravity = 9.81, slopeX = 0, slopeY = 0;
  const ground = groundAt?.(car.x, car.y);
  if (ground) {
    const cos2 = 1 / (1 + ground.gx * ground.gx + ground.gy * ground.gy), across = -ground.gx * sin + ground.gy * cos;
    slopeX = -9.81 * ground.gx * cos2; slopeY = -9.81 * ground.gy * cos2;
    const lateral = car.ay + (-slopeX * sin + slopeY * cos);
    gravity = Math.sqrt(cos2) * clamp(9.81 + ground.zss * u * u - lateral * across, 2, 40);
  }
  const loads = wheelLoads(car, downforce, frontShare, gravity);
  const frontX = c.wheelbase * (1 - c.frontWeight);
  const rearX = -c.wheelbase * c.frontWeight;
  const positions = [[frontX, c.track / 2], [frontX, -c.track / 2], [rearX, c.track / 2], [rearX, -c.track / 2]];
  // Quasi-static engine (its inertia is not modelled) through a sequential
  // gearbox. Below the engagement speed the clutch slips at a throttle-set rpm
  // and transmits only positive torque, so a closed throttle never creeps.
  const direction = car.gear < 0 ? -1 : 1;
  const axleOmega = direction * (car.wheelOmega[2] + car.wheelOmega[3]) / 2;
  car.shiftTimer = Math.max(0, car.shiftTimer - dt);
  if (c.autoShift && car.gear > 0 && car.shiftTimer === 0) {
    const [axle, road] = shaftOmegas(car), current = c.gearRatios[car.gear - 1] * RPM;
    // Upshift on engine rpm, but only once road speed would not immediately
    // satisfy the downshift rule in the next gear (no wheelspin hunting).
    if (axle * current > c.upshiftRpm && road * current >= c.downshiftRpm) shift(car, 1);
    else if (car.gear > 1 && Math.max(axle, road) * c.gearRatios[car.gear - 2] * RPM < c.downshiftRpm) shift(car, -1);
  }
  const ratio = car.gear < 0 ? c.reverseRatio : c.gearRatios[car.gear - 1];
  const coupledRpm = axleOmega * ratio * RPM;
  const engagedRpm = c.idleRpm + throttle * (c.launchRpm - c.idleRpm);
  const shifting = car.shiftTimer > 0;
  const clutchLocked = !shifting && coupledRpm >= engagedRpm;
  const rpm = clutchLocked ? coupledRpm : Math.max(coupledRpm, engagedRpm);
  const iceTorque = shifting ? 0 : clutchLocked ? engineTorque(c, rpm, throttle)
    : Math.max(0, engineTorque(c, rpm, throttle));
  // Fuel burnt by positive ICE crank work (kg/s); none modelled without a load.
  const fuelFlow = car.fuel == null ? 0 : Math.max(0, iceTorque) * rpm / RPM * c.fuelPerJoule;
  if (fuelFlow > 0) car.fuel = Math.max(0, car.fuel - fuelFlow * dt);
  // ERS: MGU-K deployment with the throttle, faded in over ersSpeedBlend m/s
  // above ersMinSpeed (input.ers === false holds it back), cut by the limiter and bounded by the store and the lap allowance;
  // MGU-K harvest from the rear braking and MGU-H recovery from the ICE.
  const ers = car.ers, crankOmega = Math.max(rpm, 1) / RPM;
  let ersTorque = 0, ersHarvest = 0;
  if (ers) {
    if (direction > 0 && !shifting && throttle > 0 && input.ers !== false) {
      const want = throttle * Math.min(c.ersMaxTorque, c.ersPower / crankOmega) * clamp((c.maxRpm - rpm) / c.limiterBand, 0, 1)
        * clamp((speed - c.ersMinSpeed) / c.ersSpeedBlend, 0, 1);
      const energy = Math.max(0, Math.min(ers.charge, c.ersDeployPerLap - ers.deployed));
      ersTorque = Math.min(want, energy / (crankOmega * dt));
      ers.charge -= ersTorque * crankOmega * dt; ers.deployed += ersTorque * crankOmega * dt;
    }
    const space = c.ersCapacity - ers.charge;
    ersHarvest = Math.min(c.ersPower, brake * c.maxBrakeForce * (1 - c.brakeBias) * Math.abs(u),
      Math.max(0, c.ersHarvestPerLap - ers.harvested) / dt, space / dt);
    ers.harvested += ersHarvest * dt;
    ers.charge = Math.min(c.ersCapacity, ers.charge + ersHarvest * dt + c.ersHeatShare * Math.max(0, iceTorque) * crankOmega * dt);
  }
  const crankTorque = iceTorque + ersTorque;
  // Fuel cut also caps drive so a spinning axle cannot pass maxRpm within the
  // step, using wheel speed measured in the selected drive direction.
  const directedTorque = Math.min(crankTorque * ratio * (crankTorque > 0 ? c.drivelineEfficiency : 1),
    Math.max(0, 2 * c.wheelInertia * (c.maxRpm / (ratio * RPM) - axleOmega) / dt));
  const axleTorque = direction * directedTorque;
  // Open split plus a clutch-pack limited-slip coupling (preload + ramp on
  // axle torque). Below its capacity the clutch is regularised as a viscous
  // coupling of fixed rate, and it can never more than equalise the rear
  // wheel speeds within one step (keeps it stable at coarse timesteps).
  const rearSlip = car.wheelOmega[2] - car.wheelOmega[3];
  const diffTransfer = Math.sign(rearSlip) * Math.min(c.diffPreload + c.diffRamp * Math.abs(axleTorque),
    c.diffLockRate * Math.abs(rearSlip) / (1 + 2 * c.diffLockRate * dt / c.wheelInertia));
  const driveTorque = direction * Math.max(directedTorque, 0) / 2;
  const engineBraking = Math.max(-directedTorque, 0) / 2;
  let fx = 0;
  let fy = 0;
  let moment = 0;
  const wheels = positions.map(([x, y], i) => {
    const front = i < 2;
    const angle = front ? car.steer : 0;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const contactU = u - car.yawRate * y;
    const contactV = v + car.yawRate * x;
    const wheelU = contactU * ca + contactV * sa;
    const wheelV = -contactU * sa + contactV * ca;
    const brakeForce = brake * c.maxBrakeForce * (front ? c.brakeBias : 1 - c.brakeBias) / 2;
    const resistanceTorque = (brakeForce + c.rollingResistance * loads[i]) * c.wheelRadius
      + (front ? 0 : engineBraking);
    const torque = front ? 0 : driveTorque + (i === 2 ? -diffTransfer : diffTransfer);
    const omega = car.wheelOmega[i];
    const r = c.wheelRadius, inertia = c.wheelInertia;
    // Conservative diagonal body response for simultaneous contact impulses.
    // Implicit linear slip avoids explicit wheel-speed oscillations near rest.
    const inverseMass = 4 / m + 4 * (x * x + y * y) / c.yawInertia;
    const stiffness = c.longitudinalStiffness / Math.max(Math.abs(wheelU), c.slipSpeedFloor);
    let demand = -stiffness * wheelU / (1 + stiffness * dt * inverseMass);
    const lockedTorque = omega * inertia / dt + torque - r * demand;
    if (Math.abs(lockedTorque) > resistanceTorque) {
      demand = stiffness * (r * (omega + dt * (torque - Math.sign(lockedTorque) * resistanceTorque) / inertia) - wheelU)
        / (1 + stiffness * dt * (inverseMass + r * r / inertia));
    }
    const worldX = car.x + x * cos - y * sin;
    const worldY = car.y + x * sin + y * cos;
    const grip = clamp(surfaceAt(worldX, worldY), 0, 2);
    const temp = car.tireTemp[i], tempGrip = tireTempGrip(c, temp), wearGrip = tireWearGrip(c, car.tireWear[i]);
    const compound = TIRE_COMPOUNDS[car.compound ?? c.tireCompound];
    const kinematicSlip = steadySlipAngle(wheelV, wheelU);
    car.slipAngle[i] = relaxSlipAngle(car.slipAngle[i], kinematicSlip, Math.hypot(wheelU, wheelV), c, dt);
    const tire = tireForce(demand, wheelV, wheelU, loads[i], grip * compound.grip * tempGrip * wearGrip, c, dt, car.slipAngle[i],
      (front ? c.corneringStiffness : c.rearCorneringStiffness)
        * Math.pow(Math.max(loads[i], 1) / (c.mass * 9.81 * (front ? c.frontWeight : 1 - c.frontWeight) / 2), c.stiffnessLoadExponent));
    tire.kinematicSlipAngle = kinematicSlip;
    // Include contact translation and yaw in the low-speed lateral bound.
    const lateralLimit = Math.abs(wheelV) / (dt * inverseMass);
    // Passivity: a lagging carcass may not push the contact along its slip
    // velocity (stored-spring energy is not tracked, so it is not released).
    tire.fy = tire.fy * wheelV > 0 ? 0 : clamp(tire.fy, -lateralLimit, lateralLimit);
    tire.utilization = tire.capacity > 0 ? Math.hypot(tire.fx, tire.fy) / tire.capacity : 0;
    const freeOmega = omega + dt * (torque - r * tire.fx) / inertia;
    car.wheelOmega[i] = Math.sign(freeOmega) * Math.max(0, Math.abs(freeOmega) - dt * resistanceTorque / inertia);
    // Contact friction power (force times slip velocity) and rolling hysteresis heat the tire.
    const slipPower = Math.abs(tire.fx * (r * car.wheelOmega[i] - wheelU)) + Math.abs(tire.fy * wheelV);
    updateTireTemp(temp, c, slipPower, c.rollingResistance * loads[i] * Math.abs(wheelU), Math.abs(wheelU), dt);
    car.tireWear[i] = updateTireWear(car.tireWear[i], c, slipPower * compound.wear, temp.surface, dt);
    const bodyFx = tire.fx * ca - tire.fy * sa;
    const bodyFy = tire.fx * sa + tire.fy * ca;
    fx += bodyFx;
    fy += bodyFy;
    moment += x * bodyFy - y * bodyFx;
    return { ...tire, load: loads[i], grip, compoundGrip: compound.grip, tempGrip, wearGrip, wear: car.tireWear[i], slipPower, surfaceTemp: temp.surface, carcassTemp: temp.carcass,
      x: worldX, y: worldY, steer: angle,
      omega: car.wheelOmega[i], driveTorque: torque,
      resistanceTorque: (freeOmega - car.wheelOmega[i]) * inertia / dt };
  });
  // Apply drag to the post-contact velocity so braking plus drag cannot reverse it.
  const nextU = u + fx / m * dt;
  const nextV = v + fy / m * dt;
  const dragFactor = 1 / (1 + 0.5 * c.airDensity * dragArea * Math.hypot(nextU, nextV) * dt / m);
  fx += nextU * (dragFactor - 1) * m / dt;
  fy += nextV * (dragFactor - 1) * m / dt;
  updateBody(car, fx / m, fy / m, downforce, dt);
  // Filter acceleration used by quasi-static transfer, not the integrated forces.
  const response = 1 - Math.exp(-dt / 0.05);
  car.ax += (fx / m - car.ax) * response;
  car.ay += (fy / m - car.ay) * response;
  car.vx += (fx * cos - fy * sin) / m * dt;
  car.vy += (fx * sin + fy * cos) / m * dt;
  car.vx += slopeX * dt;
  car.vy += slopeY * dt;
  car.yawRate += moment / c.yawInertia * dt;
  const finalU = car.vx * cos + car.vy * sin;
  const finalV = -car.vx * sin + car.vy * cos;
  wheels.forEach((wheel, i) => {
    const [x, y] = positions[i];
    const forwardSpeed = (finalU - car.yawRate * y) * Math.cos(wheel.steer)
      + (finalV + car.yawRate * x) * Math.sin(wheel.steer);
    wheel.slipRatio = (c.wheelRadius * wheel.omega - forwardSpeed) / Math.max(Math.abs(forwardSpeed), c.slipSpeedFloor);
    wheel.locked = brake > 0 && Math.abs(forwardSpeed) > 1 && Math.abs(wheel.omega) < 1e-8;
  });
  car.heading += car.yawRate * dt;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  if (barrierAt) resolveBarrier(car, barrierAt);
  car.time += dt;
  car.distance += Math.hypot(car.vx, car.vy) * dt;
  car.telemetry = { speed: Math.hypot(car.vx, car.vy), downforce, drag, wheels, aero, frontShare, drs: car.drs,
    powertrain: { gear: car.gear, rpm, crankTorque, iceTorque, ersTorque, axleTorque,
      ers: ers ? { charge: ers.charge, deployed: ers.deployed, harvested: ers.harvested,
        deploy: ersTorque * crankOmega, harvest: ersHarvest } : null, clutchLocked, shifting, diffTransfer,
      limiter: rpm > c.maxRpm - c.limiterBand, fuel: car.fuel ?? null, fuelFlow: fuelFlow * 3600 } };
  return car;
}

export class Simulation {
  constructor(car = createCar()) {
    this.car = car;
    this.accumulator = 0;
    this.droppedTime = 0;
  }
  advance(elapsed, input, surfaceAt, barrierAt, groundAt) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Elapsed time must be finite and nonnegative');
    const accepted = Math.min(elapsed, 0.25);
    this.droppedTime += elapsed - accepted;
    this.accumulator += accepted;
    let steps = 0;
    while (this.accumulator + 1e-12 >= FIXED_DT) {
      step(this.car, input, FIXED_DT, surfaceAt, barrierAt, groundAt);
      this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
      steps++;
    }
    return steps;
  }
}
