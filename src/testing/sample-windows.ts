// Real search results for component tests (computed once, at low resolution).

import { BODIES } from '../app/astro/bodies';
import { findTransferWindows, type WindowSearchResult } from '../app/search/window-finder';

let cached: WindowSearchResult | undefined;

/** Kerbin → Duna from t = 0, 100 km parking orbits, 3 windows. */
export function sampleResult(): WindowSearchResult {
  cached ??= findTransferWindows({
    origin: BODIES.Kerbin,
    destination: BODIES.Duna,
    now: 0,
    initialOrbitalVelocity: BODIES.Kerbin.circularOrbitVelocity(100e3),
    finalOrbitalVelocity: BODIES.Duna.circularOrbitVelocity(100e3),
    windowCount: 3,
    resolution: { departuresPerSynodicPeriod: 40, timesOfFlight: 40 },
  });
  return cached;
}
