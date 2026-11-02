// Messages between the app and the search Web Worker. Everything here must
// survive structured cloning, so bodies are referred to by name.

import { BODIES, type BodyName } from '../astro/bodies';
import type { TransferType } from '../astro/transfer';
import { findTransferWindows, type TransferWindow, type WindowSearchParams, type WindowSearchResult } from './window-finder';
import { computePorkchop } from './porkchop';
import { defaultSearchRanges } from './ranges';

export interface WindowSearchRequest {
  origin: BodyName;
  destination: BodyName;
  /** Current game time (s). */
  now: number;
  /** Circular parking orbit altitude at the origin (m); 0 = no parking orbit. */
  initialAltitude: number;
  /** Circular capture orbit altitude at the destination (m); 0 = no circularisation; null = no insertion burn. */
  finalAltitude: number | null;
  transferType?: TransferType;
  windowCount?: number;
}

/** A porkchop grid over the given departure times and the default time-of-flight range. */
export interface PorkchopRequest extends WindowSearchRequest {
  earliestDeparture: number;
  departureSpan: number;
  /** Number of departure times (columns). */
  width: number;
  /** Number of times of flight (rows). */
  height: number;
}

export interface PorkchopResult {
  earliestDeparture: number;
  departureSpan: number;
  shortestTimeOfFlight: number;
  timeOfFlightSpan: number;
  width: number;
  height: number;
  /** Row-major: deltaVs[j * width + i] for time of flight j and departure i (shortest first). NaN = impossible. */
  deltaVs: Float64Array;
  minDeltaV: number;
  minIndex: number;
}

export type WorkerRequest =
  | { id: number; kind: 'windows'; request: WindowSearchRequest }
  | { id: number; kind: 'porkchop'; request: PorkchopRequest };

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'result'; result: WindowSearchResult }
  | { id: number; type: 'porkchop'; result: PorkchopResult }
  | { id: number; type: 'error'; message: string };

export type Post = (message: WorkerResponse, transfer?: Transferable[]) => void;

const body = (name: BodyName) => {
  if (!Object.hasOwn(BODIES, name)) throw new Error(`Unknown body: ${name}`);
  return BODIES[name];
};

export function toSearchParams(request: WindowSearchRequest): WindowSearchParams {
  const origin = body(request.origin);
  const destination = body(request.destination);
  return {
    origin,
    destination,
    now: request.now,
    initialOrbitalVelocity: request.initialAltitude ? origin.circularOrbitVelocity(request.initialAltitude) : 0,
    finalOrbitalVelocity:
      request.finalAltitude === null ? null : request.finalAltitude ? destination.circularOrbitVelocity(request.finalAltitude) : 0,
    transferType: request.transferType ?? 'ballistic',
    windowCount: request.windowCount,
  };
}

/** Drops the transfer orbit (a class instance with references to the bodies), which does not need to cross to the app. */
const cloneable = (w: TransferWindow): TransferWindow => ({ ...w, transfer: { ...w.transfer, orbit: undefined } });

function runPorkchop(id: number, request: PorkchopRequest, post: Post): void {
  const params = toSearchParams(request);
  const ranges = defaultSearchRanges(params.origin, params.destination);
  const grid = {
    earliestDeparture: request.earliestDeparture,
    departureSpan: request.departureSpan,
    shortestTimeOfFlight: ranges.shortestTimeOfFlight,
    timeOfFlightSpan: ranges.timeOfFlightSpan,
    width: request.width,
    height: request.height,
  };
  const { deltaVs, minDeltaV, minIndex } = computePorkchop(
    { ...params, transferType: params.transferType ?? 'ballistic', ...grid },
    (fraction) => post({ id, type: 'progress', fraction }),
  );
  // Hand the buffer over instead of copying it.
  post({ id, type: 'porkchop', result: { ...grid, deltaVs, minDeltaV, minIndex } }, [deltaVs.buffer]);
}

/** What the worker does with one request. Never throws: failures are posted as errors. */
export function handleWorkerRequest(message: WorkerRequest, post: Post): void {
  const { id } = message;
  try {
    if (message.kind === 'porkchop') {
      runPorkchop(id, message.request, post);
      return;
    }
    const result = findTransferWindows(toSearchParams(message.request), (fraction) => post({ id, type: 'progress', fraction }));
    post({
      id,
      type: 'result',
      result: { windows: result.windows.map(cloneable), departNow: result.departNow && cloneable(result.departNow) },
    });
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}
