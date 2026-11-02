// The porkchop grid: total Δv for every (departure time, time of flight) pair.

import type { CelestialBody } from '../astro/bodies';
import { transfer, type TransferType } from '../astro/transfer';

export interface PorkchopParams {
  origin: CelestialBody;
  destination: CelestialBody;
  transferType: TransferType;
  initialOrbitalVelocity: number;
  finalOrbitalVelocity: number | null;
  earliestDeparture: number;
  departureSpan: number;
  shortestTimeOfFlight: number;
  timeOfFlightSpan: number;
  /** Number of departure times (columns). */
  width: number;
  /** Number of times of flight (rows). */
  height: number;
}

export interface Porkchop {
  width: number;
  height: number;
  /** Row-major: deltaVs[j * width + i] for time of flight j and departure i. NaN = no valid transfer. */
  deltaVs: Float64Array;
  minDeltaV: number;
  /** Index into deltaVs of the cheapest cell (-1 if all are NaN). */
  minIndex: number;
}

export const departureTimeAt = (p: Pick<PorkchopParams, 'earliestDeparture' | 'departureSpan' | 'width'>, i: number) =>
  p.earliestDeparture + (p.width > 1 ? (i / (p.width - 1)) * p.departureSpan : 0);

export const timeOfFlightAt = (p: Pick<PorkchopParams, 'shortestTimeOfFlight' | 'timeOfFlightSpan' | 'height'>, j: number) =>
  p.shortestTimeOfFlight + (p.height > 1 ? (j / (p.height - 1)) * p.timeOfFlightSpan : 0);

export function computePorkchop(params: PorkchopParams, onProgress?: (fraction: number) => void): Porkchop {
  const { origin, destination, width, height } = params;
  const originOrbit = origin.orbit!;
  const n0 = originOrbit.normalVector();

  // The origin's state only depends on the departure time; compute it once per column.
  const departures = Array.from({ length: width }, (_, i) => {
    const t0 = departureTimeAt(params, i);
    const nu = originOrbit.trueAnomalyAt(t0);
    return { t0, p0: originOrbit.positionAtTrueAnomaly(nu), v0: originOrbit.velocityAtTrueAnomaly(nu) };
  });

  const deltaVs = new Float64Array(width * height);
  let minDeltaV = Infinity;
  let minIndex = -1;
  for (let j = 0; j < height; j++) {
    const dt = timeOfFlightAt(params, j);
    for (let i = 0; i < width; i++) {
      const { t0, p0, v0 } = departures[i];
      const dv = transfer(params.transferType, origin, destination, t0, dt, params.initialOrbitalVelocity, params.finalOrbitalVelocity, { p0, v0, n0 }).deltaV;
      const index = j * width + i;
      deltaVs[index] = dv;
      if (dv < minDeltaV) {
        minDeltaV = dv;
        minIndex = index;
      }
    }
    onProgress?.((j + 1) / height);
  }

  return { width, height, deltaVs, minDeltaV, minIndex };
}
