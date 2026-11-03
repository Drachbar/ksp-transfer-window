// Finds the upcoming transfer windows: "when should I burn, and how?"
//
// 1. Compute a coarse porkchop grid from `now` over a few synodic periods.
// 2. Take the cheapest time of flight for every departure time and find the
//    local minima of that profile (roughly one per synodic period).
// 3. Polish each minimum with Nelder–Mead in (departure time, time of flight).
// 4. Refine the ejection for the parking orbit and split it into manoeuvre-node
//    components.

import type { CelestialBody } from '../astro/bodies';
import {
  refineTransfer,
  transfer,
  transferDetails,
  type Transfer,
  type TransferDetails,
  type TransferType,
} from '../astro/transfer';
import { goldenSectionSearch } from '../astro/roots';
import type { Vec3 } from '../astro/vector';
import { nelderMead } from './optimize';
import { computePorkchop, departureTimeAt, timeOfFlightAt, type PorkchopParams } from './porkchop';
import { searchRanges, synodicPeriod } from './ranges';

export interface WindowSearchParams {
  origin: CelestialBody;
  destination: CelestialBody;
  /** Current game time (s); windows are searched from here on. */
  now: number;
  initialOrbitalVelocity: number;
  finalOrbitalVelocity: number | null;
  transferType?: TransferType;
  /** Longest acceptable time of flight (s); no limit when undefined. */
  maxTimeOfFlight?: number;
  /**
   * For ballistic searches: also look for transfers with a mid-course plane change and
   * attach them to windows where they save more than 10 % (default true).
   */
  suggestPlaneChange?: boolean;
  /** How many upcoming windows to find (default 5). */
  windowCount?: number;
  resolution?: {
    /** Grid columns per synodic period (default 120). */
    departuresPerSynodicPeriod?: number;
    /** Grid rows (default 100). */
    timesOfFlight?: number;
  };
}

export interface TransferWindow {
  departureTime: number;
  timeOfFlight: number;
  arrivalTime: number;
  /** Total Δv (m/s). */
  deltaV: number;
  transfer: Transfer;
  /**
   * Whether the ejection was refined for the actual SoI exit point. False when
   * the refinement diverged (it is unstable for ejection inclinations near 0°)
   * and the estimate is used instead.
   */
  refined: boolean;
  details: TransferDetails;
  /** Angle the destination leads the origin by at departure (rad); negative for an inner destination. */
  phaseAngle: number;
  /**
   * Velocity on the transfer orbit as it leaves the origin's position at the departure time
   * (relative to the parent body). Use it to draw the transfer orbit; the refined transfer's
   * ejection velocity applies to the later SoI exit point instead.
   */
  departureVelocity: Vec3;
  /** A nearby transfer with a mid-course plane change that is more than 10 % cheaper. */
  planeChangeAlternative?: TransferWindow;
}

export interface WindowSearchResult {
  windows: TransferWindow[];
  /** The cheapest transfer departing exactly at `now`, or null if there is none. */
  departNow: TransferWindow | null;
}

/** Largest relative Δv change from refinement that is accepted as converged. */
const MAX_REFINEMENT_CHANGE = 0.03;

/** The full description of the transfer departing at t0 and arriving at t0 + dt. */
export function describeTransfer(params: WindowSearchParams, t0: number, dt: number): TransferWindow {
  const { origin, destination, initialOrbitalVelocity, finalOrbitalVelocity } = params;
  const transferType = params.transferType ?? 'ballistic';
  const initial = transfer(
    transferType,
    origin,
    destination,
    t0,
    dt,
    initialOrbitalVelocity,
    finalOrbitalVelocity,
  );
  const candidate = refineTransfer(
    initial,
    transferType,
    origin,
    destination,
    t0,
    dt,
    initialOrbitalVelocity,
    finalOrbitalVelocity,
  );
  // The refinement only corrects for where the craft leaves the SoI, which changes the Δv by
  // well under a percent. A larger change (or NaN) means it diverged; use the estimate then.
  const refined =
    Number.isFinite(candidate.deltaV) &&
    Math.abs(candidate.deltaV - initial.deltaV) <= MAX_REFINEMENT_CHANGE * initial.deltaV;
  const best = refined ? candidate : initial;
  return {
    departureTime: t0,
    timeOfFlight: dt,
    arrivalTime: t0 + dt,
    deltaV: best.deltaV,
    transfer: best,
    refined,
    details: transferDetails(best, origin, t0, initialOrbitalVelocity),
    phaseAngle: origin.orbit!.phaseAngle(destination.orbit!, t0),
    departureVelocity: initial.ejectionVelocity,
  };
}

/** A plane-change alternative must save more than this fraction of the Δv to be suggested. */
const MIN_PLANE_CHANGE_SAVING = 0.1;

export function findTransferWindows(
  params: WindowSearchParams,
  onProgress?: (fraction: number) => void,
): WindowSearchResult {
  const transferType = params.transferType ?? 'ballistic';
  if (transferType !== 'ballistic' || params.suggestPlaneChange === false) return searchWindows(params, onProgress);

  // The plane-change search costs about three times as much as the ballistic one.
  const ballisticShare = 0.25;
  const result = searchWindows(params, (f) => onProgress?.(ballisticShare * f));
  const { windows: alternatives } = searchWindows(
    { ...params, transferType: 'optimal', windowCount: (params.windowCount ?? 5) + 2 },
    (f) => onProgress?.(ballisticShare + (1 - ballisticShare) * f),
  );

  const S = synodicPeriod(params.origin, params.destination);
  return { windows: attachPlaneChangeAlternatives(result.windows, alternatives, S), departNow: result.departNow };
}

/**
 * Gives each ballistic window the cheapest plane-change transfer departing within
 * 0.3 synodic periods of it, if that saves more than 10 %.
 */
export function attachPlaneChangeAlternatives(windows: TransferWindow[], alternatives: TransferWindow[], synodicPeriod: number): TransferWindow[] {
  return windows.map((w) => {
    const best = alternatives
      .filter((a) => a.transfer.planeChangeDeltaV > 0 && Math.abs(a.departureTime - w.departureTime) < 0.3 * synodicPeriod)
      .filter((a) => a.deltaV < (1 - MIN_PLANE_CHANGE_SAVING) * w.deltaV)
      .sort((a, b) => a.deltaV - b.deltaV)[0];
    return best ? { ...w, planeChangeAlternative: best } : w;
  });
}

/** The first window, or leaving right now when that is cheaper (a window that is already open). */
export function nextBestWindow(result: WindowSearchResult): TransferWindow | null {
  const [next] = result.windows;
  const now = result.departNow;
  return now && (!next || now.deltaV < next.deltaV) ? now : (next ?? null);
}

function searchWindows(
  params: WindowSearchParams,
  onProgress?: (fraction: number) => void,
): WindowSearchResult {
  const { origin, destination, now, initialOrbitalVelocity, finalOrbitalVelocity } = params;
  const transferType = params.transferType ?? 'ballistic';
  const windowCount = params.windowCount ?? 5;
  const perSynodic = params.resolution?.departuresPerSynodicPeriod ?? 120;
  const rows = params.resolution?.timesOfFlight ?? 100;

  const ranges = searchRanges(origin, destination, params.maxTimeOfFlight);
  const maxTimeOfFlight = ranges.shortestTimeOfFlight + ranges.timeOfFlightSpan;
  const S = ranges.synodicPeriod;
  const H = ranges.hohmannTransferTime;

  // Search half a period past the last window so its minimum is not cut off at the edge.
  const periods = windowCount + 0.5;
  const grid: PorkchopParams = {
    origin,
    destination,
    transferType,
    initialOrbitalVelocity,
    finalOrbitalVelocity,
    earliestDeparture: now,
    departureSpan: periods * S,
    shortestTimeOfFlight: ranges.shortestTimeOfFlight,
    timeOfFlightSpan: ranges.timeOfFlightSpan,
    width: Math.ceil(periods * perSynodic) + 1,
    height: rows,
  };
  const porkchop = computePorkchop(grid, (f) => onProgress?.(0.9 * f));

  // Cheapest time of flight for each departure time
  const columnMin = new Float64Array(grid.width).fill(Infinity);
  const columnArg = new Int32Array(grid.width);
  for (let j = 0; j < grid.height; j++) {
    for (let i = 0; i < grid.width; i++) {
      const dv = porkchop.deltaVs[j * grid.width + i];
      if (dv < columnMin[i]) {
        columnMin[i] = dv;
        columnArg[i] = j;
      }
    }
  }

  const deltaV = (t0: number, dt: number) =>
    t0 < now || dt <= 0 || dt > maxTimeOfFlight
      ? Infinity
      : transfer(
          transferType,
          origin,
          destination,
          t0,
          dt,
          initialOrbitalVelocity,
          finalOrbitalVelocity,
        ).deltaV;

  const describe = (t0: number, dt: number) => describeTransfer(params, t0, dt);

  // Local minima of the column profile, each the lowest within ±0.35 synodic periods
  const radius = Math.max(1, Math.round(0.35 * perSynodic));
  const candidates: number[] = [];
  for (let i = 0; i < grid.width - 1; i++) {
    const v = columnMin[i];
    if (!Number.isFinite(v)) continue;
    let isMin = true;
    for (let k = Math.max(0, i - radius); k <= Math.min(grid.width - 1, i + radius) && isMin; k++) {
      if (columnMin[k] < v || (columnMin[k] === v && k < i)) isMin = false;
    }
    if (isMin) candidates.push(i);
  }

  // Polish each candidate in normalised coordinates (synodic periods, Hohmann times)
  const cellX = 1 / perSynodic;
  const cellY = ranges.timeOfFlightSpan / (grid.height - 1) / H;
  const windows: TransferWindow[] = [];
  for (const i of candidates) {
    const start = [(departureTimeAt(grid, i) - now) / S, timeOfFlightAt(grid, columnArg[i]) / H];
    const { x } = nelderMead(([u, w]) => deltaV(now + u * S, w * H), start, [cellX, cellY], {
      tolerance: 1e-10,
      maxIterations: 300,
    });
    const t0 = now + x[0] * S;
    // Pinned against `now`: the tail of a window that has already passed. That is "depart now".
    if (x[0] < 0.5 * cellX) continue;
    if (windows.some((w) => Math.abs(w.departureTime - t0) < 0.3 * S)) continue; // converged onto an existing window
    windows.push(describe(t0, x[1] * H));
  }
  windows.sort((a, b) => a.departureTime - b.departureTime);

  // Leaving right now: the cheapest time of flight in the first column, polished
  let departNow: TransferWindow | null = null;
  if (Number.isFinite(columnMin[0])) {
    const j = columnArg[0];
    const lo = timeOfFlightAt(grid, Math.max(0, j - 1));
    const hi = timeOfFlightAt(grid, Math.min(grid.height - 1, j + 1));
    const dt = goldenSectionSearch(lo, hi, 1e-8, (d) => {
      const v = deltaV(now, d);
      return Number.isNaN(v) ? Infinity : v;
    });
    departNow = describe(now, dt);
  }

  onProgress?.(1);
  return { windows: windows.slice(0, windowCount), departNow };
}
