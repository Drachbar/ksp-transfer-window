import { addDays, EARTH_CALENDAR, formatDate, formatPeriod, formatDuration, formatFlightTime, formatShortDate, fromGameDate, KERBIN_CALENDAR, toGameDate } from './game-time';

const KDAY = 6 * 3600;
const KYEAR = 426 * KDAY;

describe('game time', () => {
  describe('fromGameDate / toGameDate', () => {
    it('starts at Year 1, Day 1, 0:00:00', () => {
      expect(fromGameDate({ year: 1, day: 1, hour: 0, minute: 0, second: 0 }, KERBIN_CALENDAR)).toBe(0);
      expect(toGameDate(0, KERBIN_CALENDAR)).toEqual({ year: 1, day: 1, hour: 0, minute: 0, second: 0 });
    });

    it('uses 6-hour days and 426-day years on Kerbin', () => {
      expect(fromGameDate({ year: 2, day: 3, hour: 4, minute: 5, second: 6 }, KERBIN_CALENDAR)).toBe(KYEAR + 2 * KDAY + 4 * 3600 + 5 * 60 + 6);
      expect(toGameDate(KYEAR + 2 * KDAY + 4 * 3600 + 5 * 60 + 6, KERBIN_CALENDAR)).toEqual({ year: 2, day: 3, hour: 4, minute: 5, second: 6 });
    });

    it('uses 24-hour days and 365-day years on Earth', () => {
      expect(fromGameDate({ year: 1, day: 2, hour: 23, minute: 0, second: 0 }, EARTH_CALENDAR)).toBe(86400 + 23 * 3600);
      expect(toGameDate(365 * 86400, EARTH_CALENDAR)).toEqual({ year: 2, day: 1, hour: 0, minute: 0, second: 0 });
    });

    it('matches the original planner: Year y, Day d is ((y-1)·daysPerYear + d-1) days', () => {
      expect(fromGameDate({ year: 1, day: 237, hour: 0, minute: 0, second: 0 }, KERBIN_CALENDAR)).toBe(236 * KDAY);
    });

    it('floors fractional seconds', () => {
      expect(toGameDate(59.9, KERBIN_CALENDAR).second).toBe(59);
    });
  });

  describe('formatDate', () => {
    it('formats like KSP, to the minute (windows are days wide; seconds are noise)', () => {
      expect(formatDate(236 * KDAY + 3 * 3600 + 12 * 60 + 5, KERBIN_CALENDAR)).toBe('Year 1, Day 237, 3:12');
      expect(formatDate(KYEAR, KERBIN_CALENDAR)).toBe('Year 2, Day 1, 0:00');
    });
  });

  describe('formatShortDate', () => {
    it('formats compactly, to the minute', () => {
      expect(formatShortDate(236 * KDAY + 3 * 3600 + 12 * 60 + 59, KERBIN_CALENDAR)).toBe('Y1 D237 3:12');
      expect(formatShortDate(KYEAR + 5 * 60, KERBIN_CALENDAR)).toBe('Y2 D1 0:05');
    });
  });

  describe('formatDuration', () => {
    it('shows the two largest units', () => {
      expect(formatDuration(258 * KDAY + 3 * 3600 + 40 * 60, KERBIN_CALENDAR)).toBe('258d 3h');
      expect(formatDuration(KYEAR + 47 * KDAY + 2 * 3600, KERBIN_CALENDAR)).toBe('1y 47d');
      expect(formatDuration(3 * 3600 + 12 * 60 + 9, KERBIN_CALENDAR)).toBe('3h 12m');
      expect(formatDuration(5 * 60 + 9, KERBIN_CALENDAR)).toBe('5m 9s');
      expect(formatDuration(42, KERBIN_CALENDAR)).toBe('42s');
    });

    it('omits a zero second unit', () => {
      expect(formatDuration(3 * KDAY, KERBIN_CALENDAR)).toBe('3d');
    });

    it('uses the calendar for days and years', () => {
      expect(formatDuration(2 * 86400 + 3600, EARTH_CALENDAR)).toBe('2d 1h');
    });
  });

  describe('formatFlightTime', () => {
    it('counts flight times in days, even past a year', () => {
      expect(formatFlightTime(258 * KDAY + 3 * 3600, KERBIN_CALENDAR)).toBe('258d');
      expect(formatFlightTime(500 * KDAY, KERBIN_CALENDAR)).toBe('500d');
      expect(formatFlightTime(KYEAR + 74 * KDAY, KERBIN_CALENDAR)).toBe('500d');
    });

    it('adds hours to short flights', () => {
      expect(formatFlightTime(5 * KDAY + 2 * 3600, KERBIN_CALENDAR)).toBe('5d 2h');
      expect(formatFlightTime(4 * 3600 + 30 * 60, KERBIN_CALENDAR)).toBe('4h 30m');
    });
  });

  describe('formatPeriod', () => {
    it('shows orbital periods to the hundredth of a second, so a deployment orbit can be matched exactly', () => {
      expect(formatPeriod(21549.425, KERBIN_CALENDAR)).toBe('5h 59m 9.43s');
      expect(formatPeriod(14366.283, KERBIN_CALENDAR)).toBe('3h 59m 26.28s');
      expect(formatPeriod(42, KERBIN_CALENDAR)).toBe('42.00s');
      expect(formatPeriod(59.996, KERBIN_CALENDAR)).toBe('1m 0.00s'); // rounds up into the next minute
    });

    it('includes days for long periods, keeping the smaller units', () => {
      expect(formatPeriod(2 * KDAY + 65.5, KERBIN_CALENDAR)).toBe('2d 0h 1m 5.50s');
    });
  });

  describe('addDays', () => {
    it('moves forward through the calendar, rolling over into the next year', () => {
      expect(addDays({ year: 1, day: 420 }, 10, KERBIN_CALENDAR)).toEqual({ year: 2, day: 4 });
      expect(addDays({ year: 1, day: 360 }, 10, EARTH_CALENDAR)).toEqual({ year: 2, day: 5 });
      expect(addDays({ year: 3, day: 1 }, 100, KERBIN_CALENDAR)).toEqual({ year: 3, day: 101 });
    });
  });
});
