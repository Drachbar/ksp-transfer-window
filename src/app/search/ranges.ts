import type { CelestialBody } from '../astro/bodies';

/** Throws unless origin and destination are different bodies orbiting the same parent. */
export function assertTransferable(origin: CelestialBody, destination: CelestialBody): void {
  if (!origin.orbit || !destination.orbit) throw new Error(`${origin.orbit ? destination.name : origin.name} does not orbit anything`);
  if (origin === destination) throw new Error('Origin and destination must be different bodies');
  if (origin.orbit.referenceBody !== destination.orbit.referenceBody) {
    throw new Error(`${origin.name} and ${destination.name} do not orbit the same body`);
  }
}

/** Time between successive alignments of the two bodies (s). */
export function synodicPeriod(origin: CelestialBody, destination: CelestialBody): number {
  return Math.abs(1 / (1 / destination.orbit!.period() - 1 / origin.orbit!.period()));
}

/** Half the period of an ellipse touching both orbits' semi-major axes (s). */
export function hohmannTransferTime(origin: CelestialBody, destination: CelestialBody): number {
  const mu = origin.orbit!.referenceBody.gravitationalParameter;
  const a = (origin.orbit!.semiMajorAxis + destination.orbit!.semiMajorAxis) / 2;
  return Math.PI * Math.sqrt((a * a * a) / mu);
}

export interface SearchRanges {
  synodicPeriod: number;
  hohmannTransferTime: number;
  shortestTimeOfFlight: number;
  timeOfFlightSpan: number;
}

/** The time-of-flight range the original planner defaults to. */
export function defaultSearchRanges(origin: CelestialBody, destination: CelestialBody): SearchRanges {
  assertTransferable(origin, destination);
  const h = hohmannTransferTime(origin, destination);
  const destinationPeriod = destination.orbit!.period();
  return {
    synodicPeriod: synodicPeriod(origin, destination),
    hohmannTransferTime: h,
    shortestTimeOfFlight: Math.max(h - destinationPeriod, h / 2),
    timeOfFlightSpan: Math.min(2 * destinationPeriod, h),
  };
}

/**
 * The default ranges, with the time of flight capped at `maxTimeOfFlight` (s) when given.
 * If the cap is below the usual shortest time of flight, the search runs from half the cap.
 */
export function searchRanges(origin: CelestialBody, destination: CelestialBody, maxTimeOfFlight?: number): SearchRanges {
  const r = defaultSearchRanges(origin, destination);
  if (maxTimeOfFlight === undefined || !(maxTimeOfFlight < r.shortestTimeOfFlight + r.timeOfFlightSpan)) return r;
  if (maxTimeOfFlight <= r.shortestTimeOfFlight) {
    return { ...r, shortestTimeOfFlight: maxTimeOfFlight / 2, timeOfFlightSpan: maxTimeOfFlight / 2 };
  }
  return { ...r, timeOfFlightSpan: maxTimeOfFlight - r.shortestTimeOfFlight };
}
