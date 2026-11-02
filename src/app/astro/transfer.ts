// Interplanetary transfers, ported from the original orbit.coffee
// (Orbit.transfer, Orbit.transferDetails, Orbit.refineTransfer and helpers).
//
// Conventions:
// - initialOrbitalVelocity: speed of the circular parking orbit at the origin
//   (m/s), or 0 to treat the ejection as a burn from the origin body's own
//   heliocentric orbit (no parking orbit, e.g. a spacecraft in solar orbit).
// - finalOrbitalVelocity: speed of the circular capture orbit at the
//   destination (m/s); 0 = no circularisation (only match velocity at the SoI);
//   null = no insertion burn at all (flyby).
//
// Known difference from the original that is kept for now (see transfer.spec.ts):
// when Lambert returns several (multi-revolution) solutions, the original picks
// the one with the lowest ejection Δv only, because a typo meant the insertion
// Δv was never added. The port reproduces this.

import type { CelestialBody } from './bodies';
import { lambert } from './lambert';
import { Orbit } from './orbit';
import { conjugate, fromAngleAxis, rotate, type Quaternion } from './quaternion';
import { goldenSectionSearch } from './roots';
import { add, angleInPlane, cross, div, dot, HALF_PI, norm, normalize, projectToPlane, scale, sign, sub, TWO_PI, type Vec3 } from './vector';

/**
 * - ballistic: a single ejection burn (plus insertion).
 * - planeChange: ejection in the origin's orbital plane plus a plane change
 *   burn at a given angle before intercept.
 * - optimalPlaneChange: planeChange at the (approximately) cheapest angle.
 * - optimal: whichever of ballistic and optimalPlaneChange is cheaper.
 */
export type TransferType = 'ballistic' | 'planeChange' | 'optimalPlaneChange' | 'optimal';

export interface Transfer {
  /** Angle travelled around the reference body, including any full revolutions (rad). */
  angle: number;
  /** The heliocentric transfer orbit (only set for plane-change transfers). */
  orbit?: Orbit;
  ejectionVelocity: Vec3;
  ejectionDeltaVector: Vec3;
  ejectionInclination: number;
  /** Angle from the origin's prograde direction to the ejection burn (rad); only with a parking orbit. */
  ejectionAngle?: number;
  ejectionDeltaV: number;
  planeChangeAngleToIntercept?: number;
  planeChangeDeltaV: number;
  planeChangeTime?: number;
  planeChangeAngle: number;
  insertionVelocity: Vec3;
  insertionInclination?: number;
  insertionDeltaV: number;
  deltaV: number;
}

export interface TransferDetails {
  ejectionProgradeDeltaV: number;
  ejectionNormalDeltaV: number;
  ejectionHeading: number;
  /** Only without a parking orbit. */
  ejectionRadialDeltaV?: number;
  /** Only without a parking orbit. */
  ejectionPitch?: number;
}

/** Positions and velocities that can be passed in when already known (e.g. pre-computed for a grid). */
export interface TransferState {
  p0: Vec3;
  v0: Vec3;
  n0: Vec3;
  p1: Vec3;
  v1: Vec3;
}

const NAN_VEC: Vec3 = [NaN, NaN, NaN];

// --- Ejection and insertion helpers ---------------------------------------------

/** Δv from a circular orbit (speed v0) to an escape trajectory leaving the SoI at vsoi. */
function circularToEscapeDeltaV(body: CelestialBody, v0: number, vsoi: number, relativeInclination: number): number {
  const mu = body.gravitationalParameter;
  const rsoi = body.sphereOfInfluence!;
  const v1 = Math.sqrt(vsoi * vsoi + 2 * v0 * v0 - (2 * mu) / rsoi); // Eq 4.15 Velocity at periapsis

  const r0 = mu / (v0 * v0);
  const e = (r0 * v1 * v1) / mu - 1; // Ejection orbit eccentricity
  const ap = (r0 * (1 + e)) / (1 - e); // Ejection orbit apoapsis
  if (ap > 0 && ap <= rsoi) return NaN; // There is no orbit that leaves the SoI with a velocity of vsoi

  return relativeInclination
    ? Math.sqrt(v0 * v0 + v1 * v1 - 2 * v0 * v1 * Math.cos(relativeInclination)) // Eq. 4.74
    : v1 - v0; // Eq. 5.36
}

/** Δv to go from arriving at the SoI with vsoi to a circular orbit with speed v0. */
function insertionToCircularDeltaV(body: CelestialBody, vsoi: number, v0: number): number {
  const mu = body.gravitationalParameter;
  const rsoi = body.sphereOfInfluence!;
  return Math.sqrt(vsoi * vsoi + 2 * v0 * v0 - (2 * mu) / rsoi) - v0; // Eq 4.15 Velocity at periapsis
}

function ejectionAngleFromPeriapsis(originBody: CelestialBody, initialOrbitalVelocity: number, ejectionDeltaV: number): number {
  const mu = originBody.gravitationalParameter;
  const rsoi = originBody.sphereOfInfluence!;
  const initialOrbitRadius = mu / (initialOrbitalVelocity * initialOrbitalVelocity);
  const v1 = Math.sqrt(ejectionDeltaV * ejectionDeltaV + 2 * initialOrbitalVelocity * initialOrbitalVelocity - (2 * mu) / rsoi); // Eq 4.15
  const e = (initialOrbitRadius * v1 * v1) / mu - 1; // Ejection orbit eccentricity
  const a = initialOrbitRadius / (1 - e); // Ejection orbit semi-major axis
  const theta = Math.acos((a * (1 - e * e) - rsoi) / (e * rsoi)); // Eq. 4.82 True anomaly at SOI
  return theta + Math.asin((v1 * initialOrbitRadius) / (ejectionDeltaV * rsoi)); // Eq 4.23 Zenith angle at SOI
}

/**
 * Direction of the periapsis (in the equatorial plane) of an ejection orbit
 * whose SoI exit direction is the unit vector vsoi, at angle theta from it.
 */
function ejectionPeriapsisDirection(vsoi: Vec3, theta: number): Vec3 {
  // Requires |vsoi| == 1 and cos(theta) <= 0
  const cosTheta = Math.cos(theta);

  // Two equations of two unknowns (vx, vy):
  //   dot(v, vsoi) = cosTheta
  //   norm(v) = 1  [unit vector]
  //   vz = 0  [perpendicular to z-axis]
  const g = -vsoi[0] / vsoi[1];

  // Quadratic coefficients
  const a = 1 + g * g;
  const b = (2 * g * cosTheta) / vsoi[1];
  const c = (cosTheta * cosTheta) / (vsoi[1] * vsoi[1]) - 1;

  // Quadratic formula without loss of significance (Numerical Recipes eq. 5.6.4)
  const q = b < 0 ? -0.5 * (b - Math.sqrt(b * b - 4 * a * c)) : -0.5 * (b + Math.sqrt(b * b - 4 * a * c));

  let vx = q / a;
  let vy = g * vx + cosTheta / vsoi[1];

  if (sign(cross([vx, vy, 0], vsoi)[2]) < 0) {
    // Wrong orbital direction
    vx = c / q;
    vy = g * vx + cosTheta / vsoi[1];
  }

  return [vx, vy, 0];
}

function ejectionAngleToPrograde(periapsis: Vec3, prograde: Vec3): number {
  const p = normalize([prograde[0], prograde[1], 0]); // Project the prograde vector onto the XY plane
  const angle = Math.acos(dot(periapsis, p));
  return cross(periapsis, p)[2] < 0 ? TWO_PI - angle : angle;
}

/** [ejection Δv from the parking orbit, ejection inclination, ejection angle to prograde] */
function ejectionDetails(
  ejectionDeltaVector: Vec3,
  ejectionDeltaV: number,
  originBody: CelestialBody,
  initialOrbitalVelocity: number,
  progradeDirection: Vec3,
): [number, number, number] {
  const ejectionDirection = div(ejectionDeltaVector, ejectionDeltaV);
  const theta = ejectionAngleFromPeriapsis(originBody, initialOrbitalVelocity, ejectionDeltaV);

  if (Math.abs(Math.sin(theta)) < Math.abs(ejectionDirection[2])) {
    // No ejection orbit with a periapsis on the equatorial plane leaves the SoI with this velocity
    return [NaN, NaN, NaN];
  }
  const periapsisDirection = ejectionPeriapsisDirection(ejectionDirection, theta);
  const ejectionAngle = ejectionAngleToPrograde(periapsisDirection, progradeDirection);
  let ejectionInclination = Math.acos(normalize(cross(periapsisDirection, ejectionDirection))[2]);
  ejectionInclination *= sign(Math.PI - theta) * sign(ejectionDirection[2]);
  const deltaV = circularToEscapeDeltaV(originBody, initialOrbitalVelocity, ejectionDeltaV, ejectionInclination);
  return [deltaV, ejectionInclination, ejectionAngle];
}

// --- Transfers --------------------------------------------------------------------

/** Departure velocity of the first Lambert solution, or NaN if there is none. */
function firstLambertVelocity(mu: number, p0: Vec3, p1: Vec3, dt: number): Vec3 {
  return lambert(mu, p0, p1, dt)[0]?.departureVelocity ?? NAN_VEC;
}

/** The cheapest transfer of the given type, departing at t0 and arriving at t0 + dt. */
export function transfer(
  transferType: TransferType,
  originBody: CelestialBody,
  destinationBody: CelestialBody,
  t0: number,
  dt: number,
  initialOrbitalVelocity: number,
  finalOrbitalVelocity: number | null,
  state: Partial<TransferState> = {},
  planeChangeAngleToIntercept?: number,
): Transfer {
  const originOrbit = originBody.orbit!;
  const destinationOrbit = destinationBody.orbit!;
  const referenceBody = originOrbit.referenceBody;
  const mu = referenceBody.gravitationalParameter;
  const t1 = t0 + dt;

  let { p0, v0, p1, v1 } = state;
  if (!p0 || !v0) {
    const nu0 = originOrbit.trueAnomalyAt(t0);
    p0 ??= originOrbit.positionAtTrueAnomaly(nu0);
    v0 ??= originOrbit.velocityAtTrueAnomaly(nu0);
  }
  if (!p1 || !v1) {
    const nu1 = destinationOrbit.trueAnomalyAt(t1);
    p1 ??= destinationOrbit.positionAtTrueAnomaly(nu1);
    v1 ??= destinationOrbit.velocityAtTrueAnomaly(nu1);
  }
  const n0 = state.n0 ?? originOrbit.normalVector();
  const full: TransferState = { p0, v0, n0, p1, v1 };

  if (transferType === 'optimal') {
    const ballistic = transfer('ballistic', originBody, destinationBody, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity, full);
    if (ballistic.angle <= HALF_PI) return ballistic;
    const planeChange = transfer('optimalPlaneChange', originBody, destinationBody, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity, full);
    return ballistic.deltaV < planeChange.deltaV ? ballistic : planeChange;
  }

  if (transferType === 'optimalPlaneChange') {
    // Transferring to a lower orbit, the optimum time to change inclination is 90° to intercept or sooner;
    // to a higher orbit, 90° to intercept or later.
    const [x1, x2] = norm(p0) > norm(p1) ? [HALF_PI, Math.PI] : [0, HALF_PI];

    // Approximates the optimal angle to intercept for the plane change. The
    // approximation ignores the change in the transfer orbit as the plane
    // change axis changes, which is fine as long as the transfer orbit's
    // semi-major axis and eccentricity do not change significantly.
    const relativeInclination = Math.asin(dot(p1, n0) / norm(p1));
    const costAt = (orbit: Orbit, trueAnomalyAtIntercept: number) => (x: number) => {
      const planeChangeAngle = Math.atan2(Math.tan(relativeInclination), Math.sin(x));
      return Math.abs(2 * orbit.speedAtTrueAnomaly(trueAnomalyAtIntercept - x) * Math.sin(0.5 * planeChangeAngle));
    };

    let rotation = fromAngleAxis(-relativeInclination, cross(p1, n0));
    let p1InOriginPlane = rotate(rotation, p1);
    let orbit = Orbit.fromPositionAndVelocity(referenceBody, p0, firstLambertVelocity(mu, p0, p1InOriginPlane, dt), t0);
    let x = goldenSectionSearch(x1, x2, 1e-2, costAt(orbit, orbit.trueAnomalyAtPosition(p1InOriginPlane)));

    // Refine the initial estimate by running the algorithm again
    const planeChangeAngle = Math.atan2(Math.tan(relativeInclination), Math.sin(x));
    const planeChangeAxis = rotate(fromAngleAxis(-x, n0), projectToPlane(p1, n0));
    rotation = fromAngleAxis(planeChangeAngle, planeChangeAxis);
    p1InOriginPlane = rotate(rotation, p1);
    orbit = Orbit.fromPositionAndVelocity(referenceBody, p0, firstLambertVelocity(mu, p0, p1InOriginPlane, dt), t0);
    x = goldenSectionSearch(x1, x2, 1e-2, costAt(orbit, orbit.trueAnomalyAtPosition(p1InOriginPlane)));

    return transfer('planeChange', originBody, destinationBody, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity, full, x);
  }

  let planeChangeAngle = 0;
  let planeChangeRotation: Quaternion | undefined;
  let p1InOriginPlane: Vec3 | undefined;
  if (transferType === 'planeChange') {
    planeChangeAngleToIntercept ??= HALF_PI;
    const relativeInclination = Math.asin(dot(p1, n0) / norm(p1));
    planeChangeAngle = Math.atan2(Math.tan(relativeInclination), Math.sin(planeChangeAngleToIntercept));
    if (planeChangeAngle !== 0) {
      const planeChangeAxis = rotate(fromAngleAxis(-planeChangeAngleToIntercept, n0), projectToPlane(p1, n0));
      planeChangeRotation = fromAngleAxis(planeChangeAngle, planeChangeAxis);
      p1InOriginPlane = rotate(conjugate(planeChangeRotation), p1);
    }
  }

  // Assume a counter-clockwise transfer around the +z axis
  let transferAngle = Math.acos(dot(p0, p1) / (norm(p0) * norm(p1)));
  if (p0[0] * p1[1] - p0[1] * p1[0] < 0) transferAngle = TWO_PI - transferAngle; // (p0 x p1).z

  let ejectionVelocity: Vec3 = NAN_VEC;
  let insertionVelocity: Vec3 = NAN_VEC;
  let planeChangeDeltaV = 0;
  let planeChangeTime: number | undefined;
  let orbit: Orbit | undefined;

  if (!planeChangeAngle || transferAngle <= HALF_PI) {
    // Ballistic: pick the cheapest of the (possibly multi-revolution) Lambert solutions.
    let minDeltaV = Infinity;
    for (const s of lambert(mu, p0, p1, dt, 10)) {
      // NB: the original intended to add the insertion Δv here but never did (typo); kept for parity.
      const dv = norm(sub(s.departureVelocity, v0));
      if (dv < minDeltaV) {
        minDeltaV = dv;
        ejectionVelocity = s.departureVelocity;
        insertionVelocity = s.arrivalVelocity;
        transferAngle = s.transferAngle;
      }
    }
  } else {
    const solution = lambert(mu, p0, p1InOriginPlane!, dt)[0];
    if (solution) {
      ejectionVelocity = solution.departureVelocity;
      orbit = Orbit.fromPositionAndVelocity(referenceBody, p0, ejectionVelocity, t0);
      const planeChangeTrueAnomaly = orbit.trueAnomalyAt(t1) - planeChangeAngleToIntercept!;
      planeChangeDeltaV = Math.abs(2 * orbit.speedAtTrueAnomaly(planeChangeTrueAnomaly) * Math.sin(planeChangeAngle / 2));
      if (Number.isNaN(planeChangeDeltaV)) planeChangeDeltaV = 0;
      planeChangeTime = orbit.timeAtTrueAnomaly(planeChangeTrueAnomaly, t0);
      insertionVelocity = rotate(planeChangeRotation!, solution.arrivalVelocity);
    }
  }

  const ejectionDeltaVector = sub(ejectionVelocity, v0);
  // Without a parking orbit this is the hyperbolic excess velocity
  let ejectionDeltaV = norm(ejectionDeltaVector);
  let ejectionInclination: number;
  let ejectionAngle: number | undefined;
  if (initialOrbitalVelocity) {
    [ejectionDeltaV, ejectionInclination, ejectionAngle] = ejectionDetails(
      ejectionDeltaVector, ejectionDeltaV, originBody, initialOrbitalVelocity, normalize(v0));
  } else {
    ejectionInclination = Math.asin(ejectionDeltaVector[2] / ejectionDeltaV);
  }

  let insertionDeltaV = 0;
  let insertionInclination: number | undefined;
  if (finalOrbitalVelocity !== null) {
    const insertionDeltaVector = sub(insertionVelocity, v1);
    insertionDeltaV = norm(insertionDeltaVector); // Hyperbolic excess velocity at arrival
    insertionInclination = Math.asin(insertionDeltaVector[2] / insertionDeltaV);
    if (finalOrbitalVelocity) insertionDeltaV = insertionToCircularDeltaV(destinationBody, insertionDeltaV, finalOrbitalVelocity);
  }

  return {
    angle: transferAngle,
    orbit,
    ejectionVelocity,
    ejectionDeltaVector,
    ejectionInclination,
    ejectionAngle,
    ejectionDeltaV,
    planeChangeAngleToIntercept,
    planeChangeDeltaV,
    planeChangeTime,
    planeChangeAngle: planeChangeTime !== undefined ? planeChangeAngle : 0,
    insertionVelocity,
    insertionInclination,
    insertionDeltaV,
    deltaV: ejectionDeltaV + planeChangeDeltaV + insertionDeltaV,
  };
}

/** Splits the ejection burn into the components you would enter in a manoeuvre node. */
export function transferDetails(t: Transfer, originBody: CelestialBody, t0: number, initialOrbitalVelocity: number): TransferDetails {
  const originOrbit = originBody.orbit!;
  const nu0 = originOrbit.trueAnomalyAt(t0);
  const p0 = originOrbit.positionAtTrueAnomaly(nu0);
  const v0 = originOrbit.velocityAtTrueAnomaly(nu0);
  const ejectionDeltaVector = t.ejectionDeltaVector;

  if (initialOrbitalVelocity) {
    const mu = originBody.gravitationalParameter;
    const rsoi = originBody.sphereOfInfluence!;
    const vsoi = norm(ejectionDeltaVector);
    const v1 = Math.sqrt(vsoi * vsoi + 2 * initialOrbitalVelocity * initialOrbitalVelocity - (2 * mu) / rsoi); // Eq 4.15
    const ejectionNormalDeltaV = v1 * Math.sin(t.ejectionInclination);
    const ejectionProgradeDeltaV = v1 * Math.cos(t.ejectionInclination) - initialOrbitalVelocity;
    return {
      ejectionNormalDeltaV,
      ejectionProgradeDeltaV,
      ejectionHeading: Math.atan2(ejectionProgradeDeltaV, ejectionNormalDeltaV),
    };
  }

  const positionDirection = normalize(p0);
  const progradeDirection = normalize(v0);
  const n0 = originOrbit.normalVector();
  const burnDirection = div(ejectionDeltaVector, t.ejectionDeltaV);

  const progradeDeltaV = dot(ejectionDeltaVector, progradeDirection);
  const normalDeltaV = dot(ejectionDeltaVector, n0);
  let radialDeltaV = Math.sqrt(t.ejectionDeltaV * t.ejectionDeltaV - progradeDeltaV * progradeDeltaV - normalDeltaV * normalDeltaV);
  if (dot(cross(burnDirection, progradeDirection), n0) < 0) radialDeltaV = -radialDeltaV;

  return {
    ejectionPitch: Math.asin(dot(burnDirection, positionDirection)),
    ejectionHeading: angleInPlane([0, 0, 1], burnDirection, positionDirection),
    ejectionProgradeDeltaV: progradeDeltaV,
    ejectionNormalDeltaV: normalDeltaV,
    ejectionRadialDeltaV: radialDeltaV,
  };
}

/**
 * Improves a transfer from a parking orbit by accounting for where and when
 * the craft actually leaves the origin's SoI (iterates up to 10 times).
 */
export function refineTransfer(
  initial: Transfer,
  transferType: TransferType,
  originBody: CelestialBody,
  destinationBody: CelestialBody,
  t0: number,
  dt: number,
  initialOrbitalVelocity: number,
  finalOrbitalVelocity: number | null,
): Transfer {
  if (!initialOrbitalVelocity) return initial;

  const originOrbit = originBody.orbit!;
  const prograde = originOrbit.velocityAtTrueAnomaly(originOrbit.trueAnomalyAt(t0));
  const mu = originBody.gravitationalParameter;
  const rsoi = originBody.sphereOfInfluence!;
  let current = initial;
  let lastEjectionDeltaVector: Vec3 = current.ejectionDeltaVector;

  for (let i = 1; i <= 10; i++) {
    if (Number.isNaN(current.deltaV)) return current;

    // The ejection orbit
    const vsoi = norm(current.ejectionDeltaVector);
    const v0 = Math.sqrt(vsoi * vsoi + 2 * initialOrbitalVelocity * initialOrbitalVelocity - (2 * mu) / rsoi); // Eq 4.15
    const initialOrbitRadius = mu / (initialOrbitalVelocity * initialOrbitalVelocity);
    const e = (initialOrbitRadius * v0 * v0) / mu - 1; // Ejection orbit eccentricity
    const a = initialOrbitRadius / (1 - e); // Ejection orbit semi-major axis
    const nu = Math.acos((a * (1 - e * e) - rsoi) / (e * rsoi)); // Eq. 4.82 True anomaly at SOI

    let longitudeOfAscendingNode = Math.atan2(prograde[1], prograde[0]) - current.ejectionAngle!;
    let argumentOfPeriapsis = 0;
    if (current.ejectionInclination < 0) {
      longitudeOfAscendingNode -= Math.PI;
      argumentOfPeriapsis = Math.PI;
    }
    while (longitudeOfAscendingNode < 0) longitudeOfAscendingNode += TWO_PI;

    const ejectionOrbit = new Orbit(originBody, {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: current.ejectionInclination,
      longitudeOfAscendingNode,
      argumentOfPeriapsis,
      timeOfPeriapsisPassage: t0,
    });

    // The actual position and time of SoI exit
    const t1 = ejectionOrbit.timeAtTrueAnomaly(nu, t0);
    const originTrueAnomalyAtSOI = originOrbit.trueAnomalyAt(t1);
    const p1 = add(ejectionOrbit.positionAtTrueAnomaly(nu), originOrbit.positionAtTrueAnomaly(originTrueAnomalyAtSOI));
    const v1 = originOrbit.velocityAtTrueAnomaly(originTrueAnomalyAtSOI);
    const n1 = normalize(cross(p1, add(v1, current.ejectionDeltaVector)));

    // Re-calculate the transfer from the SoI exit point
    current = { ...transfer(transferType, originBody, destinationBody, t1, dt - (t1 - t0), 0, finalOrbitalVelocity, { p0: p1, v0: v1, n0: n1 }) };

    if (i & 1) {
      lastEjectionDeltaVector = current.ejectionDeltaVector;
    } else {
      // Average the last two delta vectors to avoid a diverging series
      current.ejectionDeltaVector = scale(add(lastEjectionDeltaVector, current.ejectionDeltaVector), 0.5);
      current.ejectionDeltaV = norm(current.ejectionDeltaVector);
    }

    // Account for the parking orbit in the ejection and total Δv
    [current.ejectionDeltaV, current.ejectionInclination, current.ejectionAngle] = ejectionDetails(
      current.ejectionDeltaVector, current.ejectionDeltaV, originBody, initialOrbitalVelocity, normalize(prograde));
    current.deltaV = current.ejectionDeltaV + current.planeChangeDeltaV + current.insertionDeltaV;
  }

  return current;
}
