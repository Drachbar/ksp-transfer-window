// Lambert's problem solver, ported from the original lambert.coffee.
//
// Based on Sun, F.T. "On the Minimum Time Trajectory and Multiple Solutions of
// Lambert's Problem", AAS/AIAA Astrodynamics Conference, Provincetown,
// Massachusetts, AAS 79-164, June 25-27, 1979.
//
// Deviations from the original (deliberate bug fixes):
// - The unique hyperbolic solution reported a NaN transfer angle because the
//   revolution count was undefined in that branch; it now uses 0 revolutions.
// - The single N-revolution minimum-time solution passed a garbage revolution
//   count; it now reports N revolutions.

import { brentsMethod, MACHINE_EPSILON } from './roots';
import { add, dot, norm, scale, sub, TWO_PI, HALF_PI, type Vec3 } from './vector';

export interface LambertSolution {
  departureVelocity: Vec3;
  arrivalVelocity: Vec3;
  /** Total angle travelled, including full revolutions (radians). */
  transferAngle: number;
}

const acot = (x: number) => HALF_PI - Math.atan(x);
const acoth = (x: number) => 0.5 * Math.log((x + 1) / (x - 1));
const relativeError = (a: number, b: number) => Math.abs(1.0 - a / b);

/**
 * Finds the transfer orbits from `pos1` to `pos2` taking `dt` seconds around a
 * body with gravitational parameter `mu`. Returns up to 2·maxRevs + 1 solutions.
 * `prograde` = 1 for counter-clockwise around +z, -1 for clockwise.
 */
export function lambert(mu: number, pos1: Vec3, pos2: Vec3, dt: number, maxRevs = 0, prograde = 1): LambertSolution[] {
  const r1 = norm(pos1);
  const r2 = norm(pos2);

  // Intermediate terms
  const deltaPos = sub(pos2, pos1);
  const c = norm(deltaPos);
  const m = r1 + r2 + c;
  const n = r1 + r2 - c;

  // Assume we want a prograde orbit counter-clockwise around the +z axis
  let transferAngle = Math.acos(dot(pos1, pos2) / (r1 * r2));
  if ((pos1[0] * pos2[1] - pos1[1] * pos2[0]) * prograde < 0) transferAngle = TWO_PI - transferAngle;

  let angleParameter = Math.sqrt(n / m);
  if (transferAngle > Math.PI) angleParameter = -angleParameter;

  const normalizedTime = 4 * dt * Math.sqrt(mu / (m * m * m));
  const parabolicNormalizedTime = (2 / 3) * (1 - angleParameter * angleParameter * angleParameter);

  const sqrtMu = Math.sqrt(mu);
  const invSqrtM = 1 / Math.sqrt(m);
  const invSqrtN = 1 / Math.sqrt(n);

  const solutions: LambertSolution[] = [];
  const pushSolution = (x: number, y: number, revs: number) => {
    const vc = sqrtMu * (y * invSqrtN + x * invSqrtM);
    const vr = sqrtMu * (y * invSqrtN - x * invSqrtM);
    const ec = scale(deltaPos, vc / c);
    solutions.push({
      departureVelocity: add(ec, scale(pos1, vr / r1)),
      arrivalVelocity: sub(ec, scale(pos2, vr / r2)),
      transferAngle: revs * TWO_PI + transferAngle,
    });
  };

  // y = ±sqrt(1 - sigma² (1 - x²))
  const fy = (x: number) => {
    const y = Math.sqrt(1 - angleParameter * angleParameter * (1 - x * x));
    return angleParameter < 0 ? -y : y;
  };

  // Difference between the desired normalized time and the normalized time for
  // path parameter x with N revolutions. Defined over (-1, ∞).
  let N = 0;
  const ftau = (x: number) => {
    if (x === 1.0) return parabolicNormalizedTime - normalizedTime;
    const y = fy(x);
    if (x > 1) {
      // Hyperbolic
      const g = Math.sqrt(x * x - 1);
      const h = Math.sqrt(y * y - 1);
      return (-acoth(x / g) + acoth(y / h) + x * g - y * h) / (g * g * g) - normalizedTime;
    }
    // Elliptical: -1 < x < 1
    const g = Math.sqrt(1 - x * x);
    const h = Math.sqrt(1 - y * y);
    return (acot(x / g) - Math.atan(h / y) - x * g + y * h + N * Math.PI) / (g * g * g) - normalizedTime;
  };

  if (relativeError(normalizedTime, parabolicNormalizedTime) < 1e-6) {
    // Unique parabolic solution
    pushSolution(1.0, angleParameter < 0 ? -1 : 1, 0);
  } else if (normalizedTime < parabolicNormalizedTime) {
    // Unique hyperbolic solution; exponential search for the upper bound
    let x1 = 1.0;
    let x2 = 2.0;
    while (!(ftau(x2) < 0.0)) {
      x1 = x2;
      x2 *= 2.0;
    }
    const x = brentsMethod(x1, x2, 1e-4, ftau);
    pushSolution(x, fy(x), 0);
  } else {
    // Potentially multiple elliptical solutions
    maxRevs = Math.min(maxRevs, Math.floor(normalizedTime / Math.PI));
    let minimumEnergyNormalizedTime = Math.acos(angleParameter) + angleParameter * Math.sqrt(1 - angleParameter * angleParameter);

    for (N = 0; N <= maxRevs; N++) {
      if (N > 0 && N === maxRevs) {
        // Check the number of solutions for the last revolution
        const revs = N;
        const phix = (x: number) => {
          const g = Math.sqrt(1 - x * x);
          return acot(x / g) - ((2 + x * x) * g) / (3 * x);
        };
        const phiy = (y: number) => {
          const h = Math.sqrt(1 - y * y);
          return Math.atan(h / y) - ((2 + y * y) * h) / (3 * y);
        };

        // Find the minimum (normalized) time an N revolution trajectory will take
        let xMT: number;
        let minimumNormalizedTime: number;
        if (angleParameter === 1) {
          xMT = 0;
          minimumNormalizedTime = minimumEnergyNormalizedTime;
        } else if (angleParameter === 0) {
          xMT = brentsMethod(0, 1, 1e-6, (x) => phix(x) + revs * Math.PI);
          minimumNormalizedTime = 2 / (3 * xMT);
        } else {
          xMT = brentsMethod(0, 1, 1e-6, (x) => phix(x) - phiy(fy(x)) + revs * Math.PI);
          minimumNormalizedTime =
            (2 / 3) * (1 / xMT - (angleParameter * angleParameter * angleParameter) / Math.abs(fy(xMT)));
        }

        if (relativeError(normalizedTime, minimumNormalizedTime) < 1e-6) {
          // One solution for N revolutions and we're done
          pushSolution(xMT, fy(xMT), N);
          break;
        } else if (normalizedTime < minimumNormalizedTime) {
          // No solutions for N revolutions; we're done
          break;
        } else if (normalizedTime < minimumEnergyNormalizedTime) {
          // Two low path solutions
          let x = brentsMethod(0, xMT, 1e-4, ftau);
          if (!Number.isNaN(x)) pushSolution(x, fy(x), N);
          x = brentsMethod(xMT, 1.0 - MACHINE_EPSILON, 1e-4, ftau);
          if (!Number.isNaN(x)) pushSolution(x, fy(x), N);
          break;
        }
      }

      if (relativeError(normalizedTime, minimumEnergyNormalizedTime) < 1e-6) {
        // The minimum energy elliptical solution
        pushSolution(0, fy(0), N);
        if (N > 0) {
          // For N > 0 there is also a low path solution
          const x = brentsMethod(1e-6, 1.0 - MACHINE_EPSILON, 1e-4, ftau);
          if (!Number.isNaN(x)) pushSolution(x, fy(x), N);
        }
      } else {
        if (N > 0 || normalizedTime > minimumEnergyNormalizedTime) {
          // High path solution
          const x = brentsMethod(-1.0 + MACHINE_EPSILON, 0, 1e-4, ftau);
          if (!Number.isNaN(x)) pushSolution(x, fy(x), N);
        }
        if (N > 0 || normalizedTime < minimumEnergyNormalizedTime) {
          // Low path solution
          const x = brentsMethod(0, 1.0 - MACHINE_EPSILON, 1e-4, ftau);
          if (!Number.isNaN(x)) pushSolution(x, fy(x), N);
        }
      }

      minimumEnergyNormalizedTime += Math.PI;
    }
  }

  return solutions;
}
