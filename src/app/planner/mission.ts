// What the user is planning, as entered in the form.

import { BODIES, bodiesOrbiting, type BodyName, type CelestialBody } from '../astro/bodies';
import { EARTH_CALENDAR, fromGameDate, KERBIN_CALENDAR, type Calendar } from '../astro/game-time';
import { disabled, schema, validate, type SchemaPath } from '@angular/forms/signals';
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
  };
}

/** A number field that must be filled in and lie in [min, max]. */
function between(path: SchemaPath<number>, label: string, min: number, max: (calendar: Calendar) => number, calendarPath: SchemaPath<CalendarName>) {
  validate(path, ({ value, valueOf }) => {
    const v = value();
    if (typeof v !== 'number' || !Number.isFinite(v)) return { kind: 'required', message: `${label} is required` };
    const hi = max(calendarOf({ calendar: valueOf(calendarPath) }));
    if (v < min || v > hi) {
      return { kind: 'range', message: hi === Infinity ? `${label} must be at least ${min}` : `${label} must be between ${min} and ${hi}` };
    }
    return undefined;
  });
}

export const missionSchema = schema<Mission>((p) => {
  between(p.year, 'Year', 1, () => Infinity, p.calendar);
  between(p.day, 'Day', 1, (c) => c.daysPerYear, p.calendar);
  between(p.hour, 'Hour', 0, (c) => c.hoursPerDay - 1, p.calendar);
  between(p.initialAltitudeKm, 'Altitude', 0, () => Infinity, p.calendar);
  between(p.finalAltitudeKm, 'Altitude', 0, () => Infinity, p.calendar);
  disabled(p.finalAltitudeKm, ({ valueOf }) => !valueOf(p.capture));
});
