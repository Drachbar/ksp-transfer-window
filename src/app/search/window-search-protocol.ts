// Messages between the app and the window search Web Worker. Everything here
// must survive structured cloning, so bodies are referred to by name.

import { BODIES, type BodyName } from '../astro/bodies';
import type { TransferType } from '../astro/transfer';
import { findTransferWindows, type TransferWindow, type WindowSearchParams, type WindowSearchResult } from './window-finder';

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

export interface WorkerRequest {
  id: number;
  request: WindowSearchRequest;
}

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number }
  | { id: number; type: 'result'; result: WindowSearchResult }
  | { id: number; type: 'error'; message: string };

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

/** What the worker does with one request. */
export function runWindowSearch({ id, request }: WorkerRequest, post: (message: WorkerResponse) => void): void {
  try {
    const result = findTransferWindows(toSearchParams(request), (fraction) => post({ id, type: 'progress', fraction }));
    post({
      id,
      type: 'result',
      result: { windows: result.windows.map(cloneable), departNow: result.departNow && cloneable(result.departNow) },
    });
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}
