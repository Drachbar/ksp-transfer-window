// The satellite constellation form: what you want, how it is stored in the URL, and the result.

import { disabled, max, min, schema, validate } from '@angular/forms/signals';
import { BODIES, BODY_NAMES, type BodyName } from '../astro/bodies';
import { constellation, synchronousOrbit, type Constellation } from './constellation';
import { commsCheck, DSN_LEVELS, RELAY_ANTENNAS, type Antenna, type Link } from './comms';

/**
 * Stationary: synchronous, circular and equatorial, so it stays over one spot ("keostationary"
 * around Kerbin, as the game's contracts call it). Custom: any altitude, which is all CommNet needs.
 */
export type OrbitChoice = 'stationary' | 'custom';

export interface SatellitePlan {
  body: BodyName;
  orbit: OrbitChoice;
  /** Only used for a custom orbit. */
  altitudeKm: number;
  count: number;
  /** The carrier's circular parking orbit before deployment. */
  parkingAltitudeKm: number;
  deployFrom: 'below' | 'above';
  /** Antenna name, one of RELAY_ANTENNAS. */
  antenna: string;
  /** Index into DSN_LEVELS. */
  dsnLevel: number;
}

export const DEFAULT_PLAN: SatellitePlan = {
  body: 'Kerbin',
  orbit: 'stationary',
  altitudeKm: 1000,
  count: 3,
  parkingAltitudeKm: 100,
  deployFrom: 'below',
  antenna: 'RA-2 Relay Antenna',
  dsnLevel: 0,
};

export function targetAltitudeOf(plan: SatellitePlan): number {
  const body = BODIES[plan.body];
  return plan.orbit === 'stationary' ? synchronousOrbit(body).altitude : plan.altitudeKm * 1e3;
}

export interface PlanResult {
  constellation: Constellation;
  comms: { neighbours: Link; home: Link };
  antenna: Antenna;
}

export function evaluatePlan(plan: SatellitePlan): PlanResult {
  const body = BODIES[plan.body];
  const antenna = RELAY_ANTENNAS.find((a) => a.name === plan.antenna) ?? RELAY_ANTENNAS[0];
  let c = constellation({
    body,
    targetAltitude: targetAltitudeOf(plan),
    count: plan.count,
    parkingAltitude: plan.parkingAltitudeKm * 1e3,
    deployFrom: plan.deployFrom,
  });
  if (plan.orbit === 'stationary' && !c.target.withinSoi) {
    // Say what to do instead of only that the orbit is outside the sphere of influence.
    c = {
      ...c,
      problems: [
        `${body.name} has no stationary orbit inside its sphere of influence (it turns too slowly). Choose a custom altitude instead.`,
        ...c.problems.filter((p) => !/target orbit is outside/i.test(p)),
      ],
    };
  }
  return {
    constellation: c,
    comms: commsCheck({ body, orbitRadius: c.target.radius, spacing: c.spacing, antenna, dsnLevel: plan.dsnLevel }),
    antenna,
  };
}

// --- URL ------------------------------------------------------------------------

const ORBIT_KEYS: Record<OrbitChoice, string> = { stationary: 'stationary', custom: 'custom' };
/** "sync" is what links said before the stationary orbit was renamed. */
const ORBITS: Record<string, OrbitChoice> = { stationary: 'stationary', sync: 'stationary', custom: 'custom' };

export function planToQueryParams(p: SatellitePlan): Record<string, string> {
  return {
    body: p.body,
    orbit: ORBIT_KEYS[p.orbit],
    ...(p.orbit === 'custom' ? { alt: String(p.altitudeKm) } : {}),
    n: String(p.count),
    park: String(p.parkingAltitudeKm),
    from: p.deployFrom,
    antenna: p.antenna,
    dsn: String(p.dsnLevel + 1),
  };
}

export function planFromQueryParams(get: (key: string) => string | null): Partial<SatellitePlan> {
  const number = (key: string) => {
    const v = get(key);
    return v !== null && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : undefined;
  };
  const p: Partial<SatellitePlan> = {};
  const body = get('body');
  if (body && (BODY_NAMES as string[]).includes(body)) p.body = body as BodyName;
  const orbit = get('orbit');
  if (orbit && orbit in ORBITS) p.orbit = ORBITS[orbit];
  const alt = number('alt');
  if (alt !== undefined) p.altitudeKm = alt;
  const n = number('n');
  if (n !== undefined) p.count = n;
  const park = number('park');
  if (park !== undefined) p.parkingAltitudeKm = park;
  const from = get('from');
  if (from === 'below' || from === 'above') p.deployFrom = from;
  const antenna = get('antenna');
  if (antenna && RELAY_ANTENNAS.some((a) => a.name === antenna)) p.antenna = antenna;
  const dsn = number('dsn');
  if (dsn !== undefined && Number.isInteger(dsn) && dsn >= 1 && dsn <= DSN_LEVELS.length) p.dsnLevel = dsn - 1;
  return p;
}

// --- Validation -------------------------------------------------------------------

export const planSchema = schema<SatellitePlan>((p) => {
  // min/max also give the browser's number inputs their limits.
  const count = 'Use 2 to 12 satellites';
  validate(p.count, ({ value }) => (Number.isInteger(value()) ? undefined : { kind: 'integer', message: count }));
  min(p.count, 2, { message: count });
  max(p.count, 12, { message: count });
  disabled(p.altitudeKm, ({ valueOf }) => valueOf(p.orbit) !== 'custom');
  for (const altitude of [p.altitudeKm, p.parkingAltitudeKm]) {
    validate(altitude, ({ value }) => (Number.isFinite(value()) ? undefined : { kind: 'required', message: 'Altitude is required' }));
    min(altitude, 0, { message: 'Altitude must be at least 0 km' });
  }
});
