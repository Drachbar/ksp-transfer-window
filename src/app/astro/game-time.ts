// In-game time: seconds since the start of the game ↔ calendar dates.

export interface Calendar {
  readonly hoursPerDay: number;
  readonly daysPerYear: number;
}

/** KSP's default calendar: 6-hour days, 426-day years. */
export const KERBIN_CALENDAR: Calendar = { hoursPerDay: 6, daysPerYear: 426 };

/** KSP's optional Earth calendar: 24-hour days, 365-day years. */
export const EARTH_CALENDAR: Calendar = { hoursPerDay: 24, daysPerYear: 365 };

/** A date as KSP shows it. Year and day start at 1. */
export interface GameDate {
  year: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const secondsPerDay = (c: Calendar) => c.hoursPerDay * 3600;

export function fromGameDate(d: GameDate, calendar: Calendar): number {
  const days = (d.year - 1) * calendar.daysPerYear + (d.day - 1);
  return days * secondsPerDay(calendar) + d.hour * 3600 + d.minute * 60 + d.second;
}

/** Splits a duration (s) into whole years, days, hours, minutes and seconds. */
function split(t: number, calendar: Calendar) {
  let s = Math.floor(t);
  const second = s % 60;
  s = (s - second) / 60;
  const minute = s % 60;
  s = (s - minute) / 60;
  const hour = s % calendar.hoursPerDay;
  s = (s - hour) / calendar.hoursPerDay;
  const day = s % calendar.daysPerYear;
  const year = (s - day) / calendar.daysPerYear;
  return { year, day, hour, minute, second };
}

export function toGameDate(t: number, calendar: Calendar): GameDate {
  const p = split(t, calendar);
  return { ...p, year: p.year + 1, day: p.day + 1 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Year 1, Day 237, 3:12:05" */
export function formatDate(t: number, calendar: Calendar): string {
  const d = toGameDate(t, calendar);
  return `Year ${d.year}, Day ${d.day}, ${d.hour}:${pad(d.minute)}:${pad(d.second)}`;
}

/** "Y1 D237 3:12" */
export function formatShortDate(t: number, calendar: Calendar): string {
  const d = toGameDate(t, calendar);
  return `Y${d.year} D${d.day} ${d.hour}:${pad(d.minute)}`;
}

/** The two largest units, e.g. "258d 3h", "1y 47d", "3h 12m". */
export function formatDuration(t: number, calendar: Calendar): string {
  const p = split(t, calendar);
  const units: [number, string][] = [
    [p.year, 'y'],
    [p.day, 'd'],
    [p.hour, 'h'],
    [p.minute, 'm'],
    [p.second, 's'],
  ];
  const first = units.findIndex(([v]) => v > 0);
  if (first < 0) return '0s';
  return units
    .slice(first, first + 2)
    .filter(([v], i) => i === 0 || v > 0)
    .map(([v, u]) => `${v}${u}`)
    .join(' ');
}
