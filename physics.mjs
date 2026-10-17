// SI units. Body x forward, y left; positive yaw/steer turns left.
// Illustrative parameters, not telemetry-calibrated or a regulatory specification.
export const DEFAULT_CAR = Object.freeze({
  mass: 800, yawInertia: 1250, wheelbase: 3.6, track: 1.6,
  cgHeight: 0.3, frontWeight: 0.46, frontAero: 0.45,
  airDensity: 1.225, downforceArea: 5.0, dragArea: 1.25,
  tireMu: 1.65, loadSensitivity: 0.08, corneringStiffness: 85000,
  longitudinalStiffness: 100000, wheelRadius: 0.33, wheelInertia: 1.6,
  slipSpeedFloor: 1,
  power: 560000, maxDriveForce: 13000, maxBrakeForce: 34000,
  brakeBias: 0.56, rollingResistance: 0.015,
  maxSteer: 0.38, steerRate: 1.2,
});
export const FIXED_DT = 1 / 240;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function createCar(overrides = {}) {
  return {
    config: { ...DEFAULT_CAR, ...overrides },
    x: 0, y: 0, heading: 0, vx: 0, vy: 0, yawRate: 0,
    steer: 0, ax: 0, ay: 0, time: 0, distance: 0,
    wheelOmega: [0, 0, 0, 0],
    telemetry: { speed: 0, downforce: 0, drag: 0, wheels: [] },
  };
}

export function wheelLoads(car, downforce) {
  const c = car.config;
  const total = c.mass * 9.81 + downforce;
  const front = clamp(c.mass * 9.81 * c.frontWeight + downforce * c.frontAero
    - c.mass * car.ax * c.cgHeight / c.wheelbase, 0, total);
  const rear = total - front;
  // Quasi-static transfer, equal roll stiffness split weighted by static axle load.
  const transfer = c.mass * car.ay * c.cgHeight / c.track;
  const frontLeft = clamp(front / 2 - transfer * c.frontWeight, 0, front);
  const rearLeft = clamp(rear / 2 - transfer * (1 - c.frontWeight), 0, rear);
  return [frontLeft, front - frontLeft, rearLeft, rear - rearLeft];
}

export function tireForce(longitudinalDemand, lateralSpeed, forwardSpeed, load, grip, c, dt) {
  const referenceLoad = c.mass * 9.81 / 4;
  const mu = c.tireMu * grip * Math.pow(Math.max(load, 1) / referenceLoad, -c.loadSensitivity);
  const capacity = mu * load;
  if (capacity <= 0) return { fx: 0, fy: 0, capacity: 0, utilization: 0, slipAngle: 0 };
  const slipAngle = Math.atan2(lateralSpeed, Math.max(Math.abs(forwardSpeed), 3));
  let fy = -capacity * Math.tanh(c.corneringStiffness * slipAngle / capacity);
  // Regularize the low-speed contact damping to avoid a standstill oscillation.
  fy = clamp(fy, -Math.abs(lateralSpeed) * c.mass / (4 * dt), Math.abs(lateralSpeed) * c.mass / (4 * dt));
  let fx = longitudinalDemand;
  const requested = Math.hypot(fx, fy);
  const scale = requested > capacity ? capacity / requested : 1;
  fx *= scale;
  fy *= scale;
  return { fx, fy, capacity, utilization: Math.hypot(fx, fy) / capacity, slipAngle };
}

// surfaceAt receives each contact's world position and returns a grip multiplier.
export function step(car, input = {}, dt = FIXED_DT, surfaceAt = () => 1) {
  if (!(Number.isFinite(dt) && dt > 0 && dt <= 1 / 60)) throw new RangeError('Use a positive timestep <= 1/60 s');
  const c = car.config;
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const targetSteer = clamp(input.steer || 0, -1, 1) * c.maxSteer;
  car.steer += clamp(targetSteer - car.steer, -c.steerRate * dt, c.steerRate * dt);
  const cos = Math.cos(car.heading), sin = Math.sin(car.heading);
  const u = car.vx * cos + car.vy * sin;
  const v = -car.vx * sin + car.vy * cos;
  const speed = Math.hypot(u, v);
  const q = 0.5 * c.airDensity * speed * speed;
  const downforce = q * c.downforceArea;
  const drag = q * c.dragArea;
  const loads = wheelLoads(car, downforce);
  const frontX = c.wheelbase * (1 - c.frontWeight);
  const rearX = -c.wheelbase * c.frontWeight;
  const positions = [[frontX, c.track / 2], [frontX, -c.track / 2], [rearX, c.track / 2], [rearX, -c.track / 2]];
  // Equal rear torque, power-limited at the wheels rather than chassis speed.
  const maxTorque = throttle * c.maxDriveForce * c.wheelRadius / 2;
  const driveTorque = Math.min(maxTorque, throttle * c.power / Math.max(
    Math.abs(car.wheelOmega[2]) + Math.abs(car.wheelOmega[3]) + 2 * dt * maxTorque / c.wheelInertia, 1));
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
    const resistanceTorque = (brakeForce + c.rollingResistance * loads[i]) * c.wheelRadius;
    const torque = front ? 0 : driveTorque;
    const omega = car.wheelOmega[i];
    const r = c.wheelRadius, inertia = c.wheelInertia;
    // Conservative diagonal body response for simultaneous contact impulses.
    // Implicit linear slip avoids explicit wheel-speed oscillations near rest.
    const inverseMass = 4 / c.mass + 4 * (x * x + y * y) / c.yawInertia;
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
    const tire = tireForce(demand, wheelV, wheelU, loads[i], grip, c, dt);
    // Include contact translation and yaw in the low-speed lateral bound.
    const lateralLimit = Math.abs(wheelV) / (dt * inverseMass);
    tire.fy = clamp(tire.fy, -lateralLimit, lateralLimit);
    tire.utilization = tire.capacity > 0 ? Math.hypot(tire.fx, tire.fy) / tire.capacity : 0;
    const freeOmega = omega + dt * (torque - r * tire.fx) / inertia;
    car.wheelOmega[i] = Math.sign(freeOmega) * Math.max(0, Math.abs(freeOmega) - dt * resistanceTorque / inertia);
    const bodyFx = tire.fx * ca - tire.fy * sa;
    const bodyFy = tire.fx * sa + tire.fy * ca;
    fx += bodyFx;
    fy += bodyFy;
    moment += x * bodyFy - y * bodyFx;
    return { ...tire, load: loads[i], grip, x: worldX, y: worldY, steer: angle,
      omega: car.wheelOmega[i], driveTorque: torque,
      resistanceTorque: (freeOmega - car.wheelOmega[i]) * inertia / dt };
  });
  // Apply drag to the post-contact velocity so braking plus drag cannot reverse it.
  const nextU = u + fx / c.mass * dt;
  const nextV = v + fy / c.mass * dt;
  const dragFactor = 1 / (1 + 0.5 * c.airDensity * c.dragArea * Math.hypot(nextU, nextV) * dt / c.mass);
  fx += nextU * (dragFactor - 1) * c.mass / dt;
  fy += nextV * (dragFactor - 1) * c.mass / dt;
  // Filter acceleration used by quasi-static transfer, not the integrated forces.
  const response = 1 - Math.exp(-dt / 0.05);
  car.ax += (fx / c.mass - car.ax) * response;
  car.ay += (fy / c.mass - car.ay) * response;
  car.vx += (fx * cos - fy * sin) / c.mass * dt;
  car.vy += (fx * sin + fy * cos) / c.mass * dt;
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
  car.time += dt;
  car.distance += Math.hypot(car.vx, car.vy) * dt;
  car.telemetry = { speed: Math.hypot(car.vx, car.vy), downforce, drag, wheels };
  return car;
}

export class Simulation {
  constructor(car = createCar()) {
    this.car = car;
    this.accumulator = 0;
    this.droppedTime = 0;
  }
  advance(elapsed, input, surfaceAt) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Elapsed time must be finite and nonnegative');
    const accepted = Math.min(elapsed, 0.25);
    this.droppedTime += elapsed - accepted;
    this.accumulator += accepted;
    let steps = 0;
    while (this.accumulator + 1e-12 >= FIXED_DT) {
      step(this.car, input, FIXED_DT, surfaceAt);
      this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
      steps++;
    }
    return steps;
  }
}
