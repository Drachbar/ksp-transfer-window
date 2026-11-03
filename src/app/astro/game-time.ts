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

/** "Year 1, Day 237, 3:12" (to the minute: transfer windows are days wide). */
export function formatDate(t: number, calendar: Calendar): string {
  const d = toGameDate(t, calendar);
  return `Year ${d.year}, Day ${d.day}, ${d.hour}:${pad(d.minute)}`;
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

/** Flight times in days ("258d", "500d" rather than "1y 74d"); short flights also get hours. */
export function formatFlightTime(t: number, calendar: Calendar): string {
  const days = Math.floor(t / secondsPerDay(calendar));
  return days >= 10 ? `${days}d` : formatDuration(t, calendar);
}

/** The date `days` days later, rolling over into the next year as needed. */
export function addDays(date: { year: number; day: number }, days: number, calendar: Calendar): { year: number; day: number } {
  const total = (date.year - 1) * calendar.daysPerYear + (date.day - 1) + days;
  return { year: Math.floor(total / calendar.daysPerYear) + 1, day: (total % calendar.daysPerYear) + 1 };
}

/** Orbital period to the hundredth of a second, e.g. "5h 59m 9.43s" or "2d 0h 1m 5.50s". */
export function formatPeriod(t: number, calendar: Calendar): string {
  // Round first (so 59.996 s becomes 1m 0.00s), nudging past binary representation error
  // (21549.425 is stored as 21549.42499…).
  const rounded = Math.round(t * 100 + 1e-6) / 100;
  const whole = split(rounded, calendar);
  const seconds = (rounded - Math.floor(rounded) + whole.second).toFixed(2);
  const parts: string[] = [];
  const days = whole.year * calendar.daysPerYear + whole.day;
  if (days > 0) parts.push(`${days}d`);
  if (parts.length || whole.hour > 0) parts.push(`${whole.hour}h`);
  if (parts.length || whole.minute > 0) parts.push(`${whole.minute}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}
