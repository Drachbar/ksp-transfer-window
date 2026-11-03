// Aerobraking: let the atmosphere do the capture burn.

import type { CelestialBody } from '../astro/bodies';
import type { TransferWindow } from '../search/window-finder';

export const hasAtmosphere = (body: CelestialBody) => body.atmosphereHeight > 0;

/** Speed at the top of the atmosphere when arriving with the given hyperbolic excess speed (m/s). */
export function entrySpeed(body: CelestialBody, excessSpeed: number): number {
  const r = body.radius + body.atmosphereHeight;
  return Math.sqrt(excessSpeed * excessSpeed + (2 * body.gravitationalParameter) / r);
}

/**
 * After aerocapture the orbit's apoapsis is at the target altitude and its periapsis still in the
 * atmosphere. This is the burn at apoapsis that lifts the periapsis to the top of the atmosphere
 * and circularises at the target altitude (m/s), or null if the target is inside the atmosphere.
 */
export function periapsisRaiseAfterAerocapture(body: CelestialBody, targetAltitude: number): number | null {
  if (targetAltitude <= body.atmosphereHeight) return null;
  const mu = body.gravitationalParameter;
  const ra = body.radius + targetAltitude;
  const rp = body.radius + body.atmosphereHeight;
  return Math.sqrt(mu / ra) - Math.sqrt(mu * (2 / ra - 2 / (ra + rp)));
}

/** How fast the transfer arrives relative to the destination (hyperbolic excess speed, m/s). */
export function arrivalExcessSpeed(window: TransferWindow, destination: CelestialBody): number {
  const o = destination.orbit!;
  const v = o.velocityAtTrueAnomaly(o.trueAnomalyAt(window.arrivalTime));
  const i = window.transfer.insertionVelocity;
  return Math.hypot(i[0] - v[0], i[1] - v[1], i[2] - v[2]);
}
