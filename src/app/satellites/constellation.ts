// Satellite constellations: synchronous orbits and resonant deployment.
//
// Resonant deployment: a carrier flies an orbit whose period is (N−1)/N (from
// below) or (N+1)/N (from above) of the target orbit's period, with one apsis
// on the target orbit. Releasing one satellite at that apsis every lap leaves
// them 1/N of an orbit apart once each has circularised.

import type { CelestialBody } from '../astro/bodies';

const TWO_PI = 2 * Math.PI;

export interface CircularOrbit {
  /** From the centre of the body (m). */
  radius: number;
  /** Above the surface (m). */
  altitude: number;
  /** (s) */
  period: number;
  /** False if the orbit lies outside the body's sphere of influence. */
  withinSoi: boolean;
}

/** The circular orbit with the given period. */
export function orbitForPeriod(body: CelestialBody, period: number): CircularOrbit {
  const radius = Math.cbrt((body.gravitationalParameter * period * period) / (4 * Math.PI * Math.PI));
  return { radius, altitude: radius - body.radius, period, withinSoi: body.sphereOfInfluence === undefined || radius < body.sphereOfInfluence };
}

/** The orbit that turns with the body (fraction 1) or a fraction of its rotation, e.g. 0.5 for semi-synchronous. */
export function synchronousOrbit(body: CelestialBody, fraction = 1): CircularOrbit {
  return orbitForPeriod(body, body.siderealRotation * fraction);
}

/** Circular orbit at an altitude. */
function circular(body: CelestialBody, altitude: number): CircularOrbit {
  const radius = body.radius + altitude;
  return {
    radius,
    altitude,
    period: TWO_PI * Math.sqrt((radius * radius * radius) / body.gravitationalParameter),
    withinSoi: body.sphereOfInfluence === undefined || radius < body.sphereOfInfluence,
  };
}

/**
 * Lowest altitude at which N evenly spaced satellites can see their neighbours
 * past the body (the line between neighbours just touches the surface). Null for N < 3.
 */
export function lineOfSightAltitude(body: CelestialBody, count: number): number | null {
  if (count < 3) return null;
  return body.radius / Math.cos(Math.PI / count) - body.radius;
}

export interface ConstellationInput {
  body: CelestialBody;
  /** Altitude of the final, circular orbit (m). */
  targetAltitude: number;
  count: number;
  /** Altitude of the carrier's circular parking orbit before deployment (m). */
  parkingAltitude: number;
  /** Resonant orbit below (apoapsis on the target) or above (periapsis on the target). */
  deployFrom: 'below' | 'above';
}

export interface Constellation {
  count: number;
  target: CircularOrbit;
  deployment: {
    period: number;
    /** Radii from the centre of the body (m). */
    periapsis: number;
    apoapsis: number;
  };
  /** Where on the deployment orbit to release each satellite (it is on the target orbit). */
  releaseAt: 'apoapsis' | 'periapsis';
  /** Each satellite's circularisation burn (m/s, always positive) and its direction. */
  satelliteBurn: number;
  satelliteBurnDirection: 'prograde' | 'retrograde';
  /**
   * The carrier's burns (m/s, signed: negative means retrograde): from the parking orbit onto a
   * transfer to the target altitude, then on the target orbit onto the deployment orbit.
   */
  carrierBurns: [number, number];
  /** Straight-line distance between neighbouring satellites (m). */
  spacing: number;
  /** Lowest altitude with line of sight between neighbours (m), or null if impossible. */
  lineOfSightAltitude: number | null;
  /** Reasons the plan will not work as is (empty if it is fine). */
  problems: string[];
}

const km = (m: number) => `${Math.round(m / 1e3).toLocaleString('en-US')} km`;

export function constellation({ body, targetAltitude, count, parkingAltitude, deployFrom }: ConstellationInput): Constellation {
  const mu = body.gravitationalParameter;
  const speed = (r: number, a: number) => Math.sqrt(mu * (2 / r - 1 / a));

  const target = circular(body, targetAltitude);
  const r = target.radius;
  const below = deployFrom === 'below';

  const deploymentPeriod = (target.period * (below ? count - 1 : count + 1)) / count;
  const a = Math.cbrt((mu * deploymentPeriod * deploymentPeriod) / (4 * Math.PI * Math.PI));
  const other = 2 * a - r;
  const deployment = { period: deploymentPeriod, periapsis: Math.min(r, other), apoapsis: Math.max(r, other) };

  const vTarget = Math.sqrt(mu / r);
  const vDeployment = speed(r, a);

  const r0 = body.radius + parkingAltitude;
  const aTransfer = (r0 + r) / 2;
  const carrierBurns: [number, number] = [speed(r0, aTransfer) - Math.sqrt(mu / r0), vDeployment - speed(r, aTransfer)];

  const los = lineOfSightAltitude(body, count);
  const top = body.radius + body.atmosphereHeight;
  const soi = body.sphereOfInfluence ?? Infinity;
  const problems: string[] = [];
  if (count < 3) problems.push('Two satellites can never see each other past the body: use at least three for full coverage.');
  if (r < top) problems.push(`The target orbit is ${body.atmosphereHeight > 0 ? 'inside the atmosphere' : 'below the surface'}.`);
  else if (deployment.periapsis < top) {
    problems.push(
      `The resonant orbit dips ${body.atmosphereHeight > 0 ? 'into the atmosphere' : 'below the surface'} (periapsis ${km(deployment.periapsis - body.radius)}). Deploy from above instead.`,
    );
  }
  if (r >= soi) problems.push(`The target orbit is outside ${body.name}’s sphere of influence (${km(soi - body.radius)}).`);
  else if (deployment.apoapsis >= soi) problems.push(`The resonant orbit leaves ${body.name}’s sphere of influence. Deploy from below instead.`);
  if (los !== null && targetAltitude < los) problems.push(`Too low for line of sight between neighbours: ${count} satellites need at least ${km(los)}.`);

  return {
    count,
    target,
    deployment,
    releaseAt: below ? 'apoapsis' : 'periapsis',
    satelliteBurn: Math.abs(vTarget - vDeployment),
    satelliteBurnDirection: below ? 'prograde' : 'retrograde',
    carrierBurns,
    spacing: 2 * r * Math.sin(Math.PI / count),
    lineOfSightAltitude: los,
    problems,
  };
}
