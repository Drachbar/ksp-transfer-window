// The Δv budget for a whole mission: launch, transfer, capture, landing, ascent and the trip home.

import { BODIES, type CelestialBody } from '../astro/bodies';
import type { TransferWindow } from '../search/window-finder';
import { periapsisRaiseAfterAerocapture } from './aerobraking';
import { aerobrakesAt, type Mission } from './mission';

export interface SurfaceDeltaV {
  /** From the orbit to the surface (m/s). */
  landing: number;
  /** From the surface to the orbit (m/s). */
  ascent: number;
  /** Always true: landings and ascents depend on the craft and how it is flown. */
  approximate: true;
  landingNote: string;
  ascentNote: string;
}

/** Extra for gravity losses on landing and ascent from airless bodies. */
const GRAVITY_MARGIN = 1.05;

/**
 * Typical values for bodies with an atmosphere, where drag makes them impossible to compute
 * without knowing the craft: ascent to low orbit, and landing with parachutes (powered on Duna,
 * where the air is too thin for parachutes alone). Commonly quoted community figures.
 */
const ATMOSPHERIC: Record<string, Omit<SurfaceDeltaV, 'approximate'>> = {
  Kerbin: { ascent: 3400, landing: 0, ascentNote: 'Typical value for a launch to low orbit.', landingNote: 'Land on parachutes.' },
  Eve: {
    ascent: 8000,
    landing: 0,
    ascentNote: 'Typical value; getting off Eve needs a very large rocket.',
    landingNote: 'Land on parachutes.',
  },
  Duna: {
    ascent: 1450,
    landing: 400,
    ascentNote: 'Typical value for a launch to low orbit.',
    landingNote: 'Typical value; the air is thin, so parachutes need a powered touchdown.',
  },
  Laythe: { ascent: 3200, landing: 0, ascentNote: 'Typical value for a launch to low orbit.', landingNote: 'Land on parachutes.' },
};

/** Landing on and taking off from `body`, starting from / ending in a circular orbit at `orbitAltitude` (m). */
export function surfaceDeltaV(body: CelestialBody, orbitAltitude: number): SurfaceDeltaV | null {
  if (!body.orbit || body === BODIES.Jool) return null; // the Sun and the gas giant have no surface
  const typical = ATMOSPHERIC[body.name];
  if (typical) return { ...typical, approximate: true };

  // Airless: a burn to drop the periapsis to the surface, then kill the speed there.
  const mu = body.gravitationalParameter;
  const r = body.radius + orbitAltitude;
  const a = (r + body.radius) / 2;
  const deorbit = Math.sqrt(mu / r) - Math.sqrt(mu * (2 / r - 1 / a));
  const touchdown = Math.sqrt(mu * (2 / body.radius - 1 / a));
  const deltaV = (deorbit + touchdown) * GRAVITY_MARGIN;
  const note = 'Computed from orbit, with 5 % extra for gravity losses.';
  return { landing: deltaV, ascent: deltaV, approximate: true, landingNote: note, ascentNote: note };
}

export interface BudgetRow {
  label: string;
  deltaV: number;
  approximate: boolean;
  note?: string;
}

export interface BudgetOptions {
  /** Include getting from the origin's surface into the parking orbit. */
  launch: boolean;
  /** Include landing on the destination and taking off again. */
  land: boolean;
  /** Include the trip home and landing there. */
  comeBack: boolean;
}

export function missionBudget(
  m: Mission,
  outbound: TransferWindow,
  homeward: TransferWindow | null,
  options: BudgetOptions,
): { rows: BudgetRow[]; total: number; approximate: boolean } {
  const origin = BODIES[m.origin];
  const destination = BODIES[m.destination];
  const rows: BudgetRow[] = [];

  const atOrigin = surfaceDeltaV(origin, m.initialAltitudeKm * 1e3);
  if (options.launch && atOrigin) {
    rows.push({ label: `Launch from ${m.origin} to a ${m.initialAltitudeKm} km orbit`, deltaV: atOrigin.ascent, approximate: true, note: atOrigin.ascentNote });
  }

  rows.push({ label: 'Ejection burn', deltaV: outbound.transfer.ejectionDeltaV + outbound.transfer.planeChangeDeltaV, approximate: false });

  if (m.capture) {
    if (aerobrakesAt(m)) {
      const fix = periapsisRaiseAfterAerocapture(destination, m.finalAltitudeKm * 1e3) ?? 0;
      rows.push({ label: `Capture at ${m.destination}`, deltaV: fix, approximate: true, note: 'Aerobraking, then lifting the periapsis out of the air.' });
    } else {
      rows.push({ label: `Capture at ${m.destination}`, deltaV: outbound.transfer.insertionDeltaV, approximate: false });
    }

    const atDestination = surfaceDeltaV(destination, m.finalAltitudeKm * 1e3);
    if (options.land && atDestination) {
      rows.push({ label: `Landing on ${m.destination}`, deltaV: atDestination.landing, approximate: true, note: atDestination.landingNote });
      rows.push({ label: `Ascent from ${m.destination}`, deltaV: atDestination.ascent, approximate: true, note: atDestination.ascentNote });
    }

    if (options.comeBack && homeward) {
      const homeFix = m.aerobrakeHome && origin.atmosphereHeight > 0 ? (periapsisRaiseAfterAerocapture(origin, m.initialAltitudeKm * 1e3) ?? 0) : 0;
      rows.push({ label: `Return to ${m.origin}`, deltaV: homeward.deltaV + homeFix, approximate: homeFix > 0 });
      if (atOrigin) rows.push({ label: `Landing on ${m.origin}`, deltaV: atOrigin.landing, approximate: true, note: atOrigin.landingNote });
    }
  }

  return { rows, total: rows.reduce((sum, r) => sum + r.deltaV, 0), approximate: rows.some((r) => r.approximate) };
}
