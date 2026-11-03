// Remembering the mission: in the URL (to share a search) and in local storage
// (to come back to it). Everything read from outside is sanitised; unknown or
// malformed values are dropped and replaced by defaults.

import { InjectionToken } from '@angular/core';
import type { BodyName } from '../astro/bodies';
import { DEFAULT_MISSION, ORIGIN_GROUPS, withValidDestination, type CalendarName, type Mission } from './mission';

export const STORAGE_KEY = 'ksp-transfer-window:mission';

/** Where to remember the mission between visits (null when storage is unavailable). */
export const MISSION_STORAGE = new InjectionToken<Storage | null>('MISSION_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null; // e.g. blocked by privacy settings
    }
  },
});

const ORIGINS = new Set<string>(ORIGIN_GROUPS.flatMap((g) => g.bodies));
const CALENDARS = new Set<string>(['kerbin', 'earth'] satisfies CalendarName[]);

const isBody = (v: unknown): v is BodyName => typeof v === 'string' && ORIGINS.has(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const parseNumber = (v: string | null) => (v !== null && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : undefined);

/** Keeps only the fields that have the right type. */
function sanitize(raw: Record<string, unknown>): Partial<Mission> {
  const m: Partial<Mission> = {};
  if (isBody(raw['origin'])) m.origin = raw['origin'];
  if (isBody(raw['destination'])) m.destination = raw['destination'];
  for (const key of ['year', 'day', 'hour', 'initialAltitudeKm', 'finalAltitudeKm'] as const) {
    if (isFiniteNumber(raw[key])) m[key] = raw[key];
  }
  if (typeof raw['capture'] === 'boolean') m.capture = raw['capture'];
  if (typeof raw['aerobrake'] === 'boolean') m.aerobrake = raw['aerobrake'];
  if (typeof raw['aerobrakeHome'] === 'boolean') m.aerobrakeHome = raw['aerobrakeHome'];
  if (typeof raw['roundTrip'] === 'boolean') m.roundTrip = raw['roundTrip'];
  if (typeof raw['calendar'] === 'string' && CALENDARS.has(raw['calendar'])) m.calendar = raw['calendar'] as CalendarName;
  if (raw['maxFlightDays'] === null || (isFiniteNumber(raw['maxFlightDays']) && raw['maxFlightDays'] > 0)) {
    m.maxFlightDays = raw['maxFlightDays'] as number | null;
  }
  if (raw['stayDays'] === null || (isFiniteNumber(raw['stayDays']) && raw['stayDays'] >= 0)) {
    m.stayDays = raw['stayDays'] as number | null;
  }
  return m;
}

export function missionToQueryParams(m: Mission): Record<string, string> {
  return {
    from: m.origin,
    to: m.destination,
    year: String(m.year),
    day: String(m.day),
    hour: String(m.hour),
    orbit: String(m.initialAltitudeKm),
    capture: m.capture ? String(m.finalAltitudeKm) : 'none',
    calendar: m.calendar,
    ...(m.maxFlightDays !== null ? { maxflight: String(m.maxFlightDays) } : {}),
    ...(m.stayDays !== null ? { stay: String(m.stayDays) } : {}),
    ...(m.aerobrake ? { aero: '1' } : {}),
    ...(!m.aerobrakeHome ? { aerohome: '0' } : {}),
    ...(m.roundTrip ? { trip: 'round' } : {}),
  };
}

/** Reads a mission from query parameters, given a lookup such as ParamMap.get. */
export function missionFromQueryParams(get: (key: string) => string | null): Partial<Mission> {
  const capture = get('capture');
  return sanitize({
    origin: get('from'),
    destination: get('to'),
    year: parseNumber(get('year')),
    day: parseNumber(get('day')),
    hour: parseNumber(get('hour')),
    initialAltitudeKm: parseNumber(get('orbit')),
    finalAltitudeKm: parseNumber(capture),
    capture: capture === 'none' ? false : parseNumber(capture) !== undefined ? true : undefined,
    calendar: get('calendar'),
    // A complete search (as written by missionToQueryParams) without a limit means "no limit".
    maxFlightDays: get('maxflight') === null ? (isBody(get('from')) ? null : undefined) : parseNumber(get('maxflight')),
    stayDays: get('stay') === null ? (isBody(get('from')) ? null : undefined) : parseNumber(get('stay')),
    aerobrake: get('aero') === '1' ? true : isBody(get('from')) ? false : undefined,
    // On unless switched off; old links' "aero=1" (both ends) therefore still means both.
    aerobrakeHome: get('aerohome') === '0' ? false : isBody(get('from')) ? true : undefined,
    // Links from before one-way trips always planned the way home; a stay there still says so.
    roundTrip: get('trip') === 'round' || get('stay') !== null ? true : isBody(get('from')) ? false : undefined,
  });
}

export function missionFromJson(json: string | null): Partial<Mission> {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? sanitize(value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Combines partial missions (earlier ones win) over the defaults. */
export function restoreMission(...sources: Partial<Mission>[]): Mission {
  return withValidDestination(Object.assign({}, DEFAULT_MISSION, ...[...sources].reverse()));
}

export function loadStoredMission(storage: Storage | null): Partial<Mission> {
  try {
    return missionFromJson(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return {};
  }
}

export function storeMission(storage: Storage | null, m: Mission): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    // Storage full or blocked: remembering the mission is only a convenience.
  }
}
