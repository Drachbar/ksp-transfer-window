// Keplerian orbits, ported from the original orbit.coffee (the Orbit class).

import { concat, conjugate, fromAngleAxis, rotate, type Quaternion } from './quaternion';
import { newtonsMethod } from './roots';
import { cross, dot, norm, normalize, scale, sub, TWO_PI, type Vec3 } from './vector';

/** What an orbit needs to know about the body it orbits. */
export interface GravitatingBody {
  readonly name: string;
  readonly mass: number;
  readonly radius: number;
  readonly gravitationalParameter: number;
}

/** Orbital elements. Angles are in radians. */
export interface OrbitalElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  longitudeOfAscendingNode: number;
  argumentOfPeriapsis: number;
  /** Mean anomaly at t = 0. Used when timeOfPeriapsisPassage is not given (the planets). */
  meanAnomalyAtEpoch?: number;
  /** Time of periapsis passage. Takes precedence over meanAnomalyAtEpoch. */
  timeOfPeriapsisPassage?: number;
}

export class Orbit {
  readonly semiMajorAxis: number;
  readonly eccentricity: number;
  readonly inclination: number;
  readonly longitudeOfAscendingNode: number;
  readonly argumentOfPeriapsis: number;
  readonly meanAnomalyAtEpoch?: number;
  readonly timeOfPeriapsisPassage?: number;

  private rotation?: Quaternion;

  constructor(
    readonly referenceBody: GravitatingBody,
    elements: OrbitalElements,
  ) {
    this.semiMajorAxis = elements.semiMajorAxis;
    this.eccentricity = elements.eccentricity;
    this.inclination = elements.inclination;
    this.longitudeOfAscendingNode = elements.longitudeOfAscendingNode;
    this.argumentOfPeriapsis = elements.argumentOfPeriapsis;
    this.meanAnomalyAtEpoch = elements.meanAnomalyAtEpoch;
    this.timeOfPeriapsisPassage = elements.timeOfPeriapsisPassage;
  }

  /** Orbit from position and velocity at time t. See http://www.braeunig.us/space/interpl.htm#elements */
  static fromPositionAndVelocity(referenceBody: GravitatingBody, position: Vec3, velocity: Vec3, t: number): Orbit {
    const mu = referenceBody.gravitationalParameter;
    const r = norm(position);
    const v = norm(velocity);

    const specificAngularMomentum = cross(position, velocity); // Eq. 5.21
    const nodeVector: Vec3 =
      specificAngularMomentum[0] !== 0 || specificAngularMomentum[1] !== 0
        ? normalize([-specificAngularMomentum[1], specificAngularMomentum[0], 0]) // Eq. 5.22
        : [1, 0, 0];
    const eccentricityVector = scale(sub(scale(position, v * v - mu / r), scale(velocity, dot(position, velocity))), 1 / mu); // Eq. 5.23

    const semiMajorAxis = 1 / (2 / r - (v * v) / mu); // Eq. 5.24
    const eccentricity = norm(eccentricityVector); // Eq. 5.25
    const inclination = Math.acos(specificAngularMomentum[2] / norm(specificAngularMomentum)); // Eq. 5.26

    let longitudeOfAscendingNode = 0;
    let argumentOfPeriapsis = 0;
    if (eccentricity !== 0) {
      longitudeOfAscendingNode = Math.acos(nodeVector[0]); // Eq. 5.27
      if (nodeVector[1] < 0) longitudeOfAscendingNode = TWO_PI - longitudeOfAscendingNode;
      argumentOfPeriapsis = Math.acos(dot(nodeVector, eccentricityVector) / eccentricity); // Eq. 5.28
      if (eccentricityVector[2] < 0) argumentOfPeriapsis = TWO_PI - argumentOfPeriapsis;
    }

    let trueAnomaly = Math.acos(dot(eccentricityVector, position) / (eccentricity * r)); // Eq. 5.29
    if (dot(position, velocity) < 0) trueAnomaly = -trueAnomaly;

    const shape = new Orbit(referenceBody, { semiMajorAxis, eccentricity, inclination, longitudeOfAscendingNode, argumentOfPeriapsis });
    const meanAnomaly = shape.meanAnomalyAtTrueAnomaly(trueAnomaly);
    return new Orbit(referenceBody, {
      semiMajorAxis,
      eccentricity,
      inclination,
      longitudeOfAscendingNode,
      argumentOfPeriapsis,
      timeOfPeriapsisPassage: t - meanAnomaly / shape.meanMotion(),
    });
  }

  // --- Shape ------------------------------------------------------------------

  isHyperbolic(): boolean {
    return this.eccentricity > 1;
  }

  apoapsis(): number {
    return this.semiMajorAxis * (1 + this.eccentricity);
  }

  periapsis(): number {
    return this.semiMajorAxis * (1 - this.eccentricity);
  }

  apoapsisAltitude(): number {
    return this.apoapsis() - this.referenceBody.radius;
  }

  periapsisAltitude(): number {
    return this.periapsis() - this.referenceBody.radius;
  }

  semiMinorAxis(): number {
    const e = this.eccentricity;
    return this.semiMajorAxis * Math.sqrt(1 - e * e);
  }

  semiLatusRectum(): number {
    const e = this.eccentricity;
    return this.semiMajorAxis * (1 - e * e);
  }

  meanMotion(): number {
    const a = Math.abs(this.semiMajorAxis);
    return Math.sqrt(this.referenceBody.gravitationalParameter / (a * a * a));
  }

  period(): number {
    return this.isHyperbolic() ? Infinity : TWO_PI / this.meanMotion();
  }

  rotationToReferenceFrame(): Quaternion {
    if (!this.rotation) {
      const axisOfInclination: Vec3 = [Math.cos(-this.argumentOfPeriapsis), Math.sin(-this.argumentOfPeriapsis), 0];
      this.rotation = concat(
        fromAngleAxis(this.longitudeOfAscendingNode + this.argumentOfPeriapsis, [0, 0, 1]),
        fromAngleAxis(this.inclination, axisOfInclination),
      );
    }
    return this.rotation;
  }

  normalVector(): Vec3 {
    return rotate(this.rotationToReferenceFrame(), [0, 0, 1]);
  }

  /**
   * The angle `other` leads this orbit's body by at time t, measured in this
   * orbit's plane. In [0, 2π) for an outer target, in (-2π, 0] for an inner one.
   */
  phaseAngle(other: Orbit, t: number): number {
    const n = this.normalVector();
    const p1 = this.positionAtTrueAnomaly(this.trueAnomalyAt(t));
    let p2 = other.positionAtTrueAnomaly(other.trueAnomalyAt(t));
    p2 = sub(p2, scale(n, dot(p2, n))); // Project p2 onto our orbital plane
    let angle = Math.acos(dot(p1, p2) / (norm(p1) * norm(p2)));
    if (dot(cross(p1, p2), n) < 0) angle = TWO_PI - angle;
    if (other.semiMajorAxis < this.semiMajorAxis) angle -= TWO_PI;
    return angle;
  }

  // --- State at time t ----------------------------------------------------------

  meanAnomalyAt(t: number): number {
    if (this.isHyperbolic()) return (t - this.timeOfPeriapsisPassage!) * this.meanMotion();
    if (this.timeOfPeriapsisPassage !== undefined) {
      const M = ((t - this.timeOfPeriapsisPassage) % this.period()) * this.meanMotion();
      return M < 0 ? M + TWO_PI : M;
    }
    return (this.meanAnomalyAtEpoch! + this.meanMotion() * (t % this.period())) % TWO_PI;
  }

  eccentricAnomalyAt(t: number): number {
    const e = this.eccentricity;
    const M = this.meanAnomalyAt(t);
    if (this.isHyperbolic()) {
      return newtonsMethod(M, (x) => M - e * Math.sinh(x) + x, (x) => 1 - e * Math.cosh(x));
    }
    return newtonsMethod(M, (x) => M + e * Math.sin(x) - x, (x) => e * Math.cos(x) - 1);
  }

  trueAnomalyAt(t: number): number {
    const e = this.eccentricity;
    if (this.isHyperbolic()) {
      const H = this.eccentricAnomalyAt(t);
      const tA = Math.acos((e - Math.cosh(H)) / (Math.cosh(H) * e - 1));
      return H < 0 ? -tA : tA;
    }
    const E = this.eccentricAnomalyAt(t);
    const tA = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    return tA < 0 ? tA + TWO_PI : tA;
  }

  // --- State at true anomaly ------------------------------------------------------

  eccentricAnomalyAtTrueAnomaly(tA: number): number {
    const e = this.eccentricity;
    if (this.isHyperbolic()) {
      const cosTrueAnomaly = Math.cos(tA);
      const H = Math.acosh((e + cosTrueAnomaly) / (1 + e * cosTrueAnomaly));
      return tA < 0 ? -H : H;
    }
    const E = 2 * Math.atan(Math.tan(tA / 2) / Math.sqrt((1 + e) / (1 - e)));
    return E < 0 ? E + TWO_PI : E;
  }

  meanAnomalyAtTrueAnomaly(tA: number): number {
    const e = this.eccentricity;
    const E = this.eccentricAnomalyAtTrueAnomaly(tA);
    return this.isHyperbolic() ? e * Math.sinh(E) - E : E - e * Math.sin(E);
  }

  /** The first time at or after t0 that the orbit passes true anomaly tA. */
  timeAtTrueAnomaly(tA: number, t0 = 0): number {
    const M = this.meanAnomalyAtTrueAnomaly(tA);
    if (this.isHyperbolic()) return this.timeOfPeriapsisPassage! + M / this.meanMotion(); // Eq. 4.86
    const p = this.period();
    const t =
      this.timeOfPeriapsisPassage !== undefined
        ? this.timeOfPeriapsisPassage + p * Math.floor((t0 - this.timeOfPeriapsisPassage) / p) + M / this.meanMotion()
        : t0 - (t0 % p) + (M - this.meanAnomalyAtEpoch!) / this.meanMotion();
    return t < t0 ? t + p : t;
  }

  radiusAtTrueAnomaly(tA: number): number {
    const e = this.eccentricity;
    return (this.semiMajorAxis * (1 - e * e)) / (1 + e * Math.cos(tA));
  }

  altitudeAtTrueAnomaly(tA: number): number {
    return this.radiusAtTrueAnomaly(tA) - this.referenceBody.radius;
  }

  speedAtTrueAnomaly(tA: number): number {
    return Math.sqrt(this.referenceBody.gravitationalParameter * (2 / this.radiusAtTrueAnomaly(tA) - 1 / this.semiMajorAxis));
  }

  positionAtTrueAnomaly(tA: number): Vec3 {
    const r = this.radiusAtTrueAnomaly(tA);
    return rotate(this.rotationToReferenceFrame(), [r * Math.cos(tA), r * Math.sin(tA), 0]);
  }

  velocityAtTrueAnomaly(tA: number): Vec3 {
    const mu = this.referenceBody.gravitationalParameter;
    const e = this.eccentricity;
    const h = Math.sqrt(mu * this.semiMajorAxis * (1 - e * e));
    const r = this.radiusAtTrueAnomaly(tA);
    const sin = Math.sin(tA);
    const cos = Math.cos(tA);
    const vr = (mu * e * sin) / h;
    const vtA = h / r;
    return rotate(this.rotationToReferenceFrame(), [vr * cos - vtA * sin, vr * sin + vtA * cos, 0]);
  }

  trueAnomalyAtPosition(p: Vec3): number {
    const local = rotate(conjugate(this.rotationToReferenceFrame()), p);
    return Math.atan2(local[1], local[0]);
  }
}
