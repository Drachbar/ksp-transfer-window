// What the user is planning, as entered in the form.

import { BODIES, bodiesOrbiting, type BodyName, type CelestialBody } from '../astro/bodies';
import { EARTH_CALENDAR, fromGameDate, KERBIN_CALENDAR, toGameDate, type Calendar } from '../astro/game-time';
import type { TransferWindow } from '../search/window-finder';
import { disabled, max, min, schema, validate, type SchemaPath } from '@angular/forms/signals';
import type { WindowSearchRequest } from '../search/window-search-protocol';

export type CalendarName = 'kerbin' | 'earth';

export interface Mission {
  origin: BodyName;
  destination: BodyName;
  /** Current in-game date (Year and Day start at 1). */
  year: number;
  day: number;
  hour: number;
  /** Circular parking orbit altitude at the origin. */
  initialAltitudeKm: number;
  /** Circular orbit altitude to capture into at the destination. */
  finalAltitudeKm: number;
  /** False for a flyby: no insertion burn at the destination. */
  capture: boolean;
  calendar: CalendarName;
  /** Longest acceptable flight time in days of the selected calendar; null = no limit. */
  maxFlightDays: number | null;
  /** Shortest stay at the destination before flying home, in days; null = leave as soon as possible. */
  stayDays: number | null;
}

export const DEFAULT_MISSION: Mission = {
  origin: 'Kerbin',
  destination: 'Duna',
  year: 1,
  day: 1,
  hour: 0,
  initialAltitudeKm: 100,
  finalAltitudeKm: 100,
  capture: true,
  calendar: 'kerbin',
  maxFlightDays: null,
  stayDays: null,
};

export const WINDOW_COUNT = 5;

export interface BodyGroup {
  label: string;
  bodies: BodyName[];
}

const names = (bodies: { name: string }[]) => bodies.map((b) => b.name as BodyName);

/** Bodies you can start from: anything with at least one sibling to fly to. */
export const ORIGIN_GROUPS: BodyGroup[] = (() => {
  const planets = bodiesOrbiting(BODIES.Kerbol);
  const groups: BodyGroup[] = [{ label: 'Planets', bodies: names(planets) }];
  for (const planet of planets) {
    const moons = bodiesOrbiting(planet);
    if (moons.length > 1) groups.push({ label: `Moons of ${planet.name}`, bodies: names(moons) });
  }
  return groups;
})();

/** The other bodies orbiting the same parent as `origin`. */
export function destinationsFor(origin: BodyName): BodyName[] {
  const parent = BODIES[origin].orbit?.referenceBody as CelestialBody | undefined;
  return parent ? names(bodiesOrbiting(parent)).filter((b) => b !== origin) : [];
}

/** Makes sure the destination can be reached from the origin, picking the first option otherwise. */
export function withValidDestination(mission: Mission): Mission {
  const options = destinationsFor(mission.origin);
  return options.includes(mission.destination) ? mission : { ...mission, destination: options[0] };
}

export const calendarOf = (m: Pick<Mission, 'calendar'>): Calendar => (m.calendar === 'earth' ? EARTH_CALENDAR : KERBIN_CALENDAR);

/** The current game time in seconds. */
export const nowOf = (m: Mission): number => fromGameDate({ year: m.year, day: m.day, hour: m.hour, minute: 0, second: 0 }, calendarOf(m));

export function toSearchRequest(m: Mission): WindowSearchRequest {
  return {
    origin: m.origin,
    destination: m.destination,
    now: nowOf(m),
    initialAltitude: m.initialAltitudeKm * 1e3,
    finalAltitude: m.capture ? m.finalAltitudeKm * 1e3 : null,
    windowCount: WINDOW_COUNT,
    maxTimeOfFlight: m.maxFlightDays === null ? undefined : m.maxFlightDays * calendarOf(m).hoursPerDay * 3600,
  };
}

/**
 * A number field that must be filled in and lie in [lo, hi]. Uses the min/max validators so the
 * browser's number input gets the limits too (its arrows stop there).
 */
function between(path: SchemaPath<number>, label: string, lo: number, hi: ((calendar: Calendar) => number) | null, calendarPath: SchemaPath<CalendarName>) {
  validate(path, ({ value }) => (Number.isFinite(value()) ? undefined : { kind: 'required', message: `${label} is required` }));
  const limit = (valueOf: <T>(p: SchemaPath<T>) => T) => hi!(calendarOf({ calendar: valueOf(calendarPath) }));
  const message = ({ valueOf }: { valueOf: <T>(p: SchemaPath<T>) => T }) =>
    hi ? `${label} must be between ${lo} and ${limit(valueOf)}` : `${label} must be at least ${lo}`;
  min(path, lo, { message });
  if (hi) max(path, ({ valueOf }) => limit(valueOf), { message });
}

/**
 * The trip home after flying `outbound`: from the destination back to the origin, leaving
 * from the orbit you captured into, no earlier than arrival plus the minimum stay.
 */
export function returnMission(m: Mission, outbound: TransferWindow): Mission {
  const calendar = calendarOf(m);
  const earliest = outbound.arrivalTime + (m.stayDays ?? 0) * calendar.hoursPerDay * 3600;
  // The form works in whole hours; round up so the search never starts before you are there.
  const start = toGameDate(Math.ceil(earliest / 3600) * 3600, calendar);
  return {
    ...m,
    origin: m.destination,
    destination: m.origin,
    year: start.year,
    day: start.day,
    hour: start.hour,
    initialAltitudeKm: m.finalAltitudeKm,
    finalAltitudeKm: m.initialAltitudeKm,
    capture: true,
    stayDays: null,
  };
}

export const missionSchema = schema<Mission>((p) => {
  between(p.year, 'Year', 1, null, p.calendar);
  between(p.day, 'Day', 1, (c) => c.daysPerYear, p.calendar);
  between(p.hour, 'Hour', 0, (c) => c.hoursPerDay - 1, p.calendar);
  between(p.initialAltitudeKm, 'Altitude', 0, null, p.calendar);
  between(p.finalAltitudeKm, 'Altitude', 0, null, p.calendar);
  disabled(p.finalAltitudeKm, ({ valueOf }) => !valueOf(p.capture));
  disabled(p.stayDays, ({ valueOf }) => !valueOf(p.capture));
  validate(p.stayDays, ({ value }) => {
    const v = value();
    return v === null || (Number.isFinite(v) && v >= 0) ? undefined : { kind: 'range', message: 'Stay must be 0 days or more' };
  });
  validate(p.maxFlightDays, ({ value }) => {
    const v = value();
    return v === null || (Number.isFinite(v) && v > 0) ? undefined : { kind: 'range', message: 'Max flight time must be more than 0 days' };
  });
});
