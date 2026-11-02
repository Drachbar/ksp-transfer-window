import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { calendarOf, DEFAULT_MISSION, destinationsFor, missionSchema, nowOf, ORIGIN_GROUPS, toSearchRequest, withValidDestination, type Mission } from './mission';
import { EARTH_CALENDAR, KERBIN_CALENDAR } from '../astro/game-time';

describe('mission', () => {
  it('defaults to Kerbin → Duna from the start of the game, 100 km parking orbits', () => {
    expect(DEFAULT_MISSION).toEqual<Mission>({
      origin: 'Kerbin',
      destination: 'Duna',
      year: 1,
      day: 1,
      hour: 0,
      initialAltitudeKm: 100,
      finalAltitudeKm: 100,
      capture: true,
      calendar: 'kerbin',
    });
  });

  describe('origins', () => {
    it('groups planets and moons, leaving out bodies with nowhere to go', () => {
      expect(ORIGIN_GROUPS).toEqual([
        { label: 'Planets', bodies: ['Moho', 'Eve', 'Kerbin', 'Duna', 'Dres', 'Jool', 'Eeloo'] },
        { label: 'Moons of Kerbin', bodies: ['Mun', 'Minmus'] },
        { label: 'Moons of Jool', bodies: ['Laythe', 'Vall', 'Tylo', 'Bop', 'Pol'] },
      ]);
    });
  });

  describe('destinationsFor', () => {
    it('lists the other bodies orbiting the same parent', () => {
      expect(destinationsFor('Kerbin')).toEqual(['Moho', 'Eve', 'Duna', 'Dres', 'Jool', 'Eeloo']);
      expect(destinationsFor('Mun')).toEqual(['Minmus']);
      expect(destinationsFor('Tylo')).toEqual(['Laythe', 'Vall', 'Bop', 'Pol']);
    });
  });

  describe('withValidDestination', () => {
    it('keeps a valid destination', () => {
      expect(withValidDestination({ ...DEFAULT_MISSION, origin: 'Eve', destination: 'Duna' }).destination).toBe('Duna');
    });

    it('picks the first possible destination when the origin changes to another system', () => {
      expect(withValidDestination({ ...DEFAULT_MISSION, origin: 'Mun', destination: 'Duna' }).destination).toBe('Minmus');
    });

    it('does not let origin and destination be the same', () => {
      expect(withValidDestination({ ...DEFAULT_MISSION, origin: 'Duna', destination: 'Duna' }).destination).toBe('Moho');
    });

    it('returns the same object when nothing changes', () => {
      expect(withValidDestination(DEFAULT_MISSION)).toBe(DEFAULT_MISSION);
    });
  });

  describe('calendarOf / nowOf', () => {
    it('uses the selected calendar', () => {
      expect(calendarOf(DEFAULT_MISSION)).toBe(KERBIN_CALENDAR);
      expect(calendarOf({ ...DEFAULT_MISSION, calendar: 'earth' })).toBe(EARTH_CALENDAR);
    });

    it('converts the current game date to seconds', () => {
      expect(nowOf({ ...DEFAULT_MISSION, year: 2, day: 10, hour: 3 })).toBe((426 + 9) * 6 * 3600 + 3 * 3600);
      expect(nowOf({ ...DEFAULT_MISSION, calendar: 'earth', year: 1, day: 2, hour: 1 })).toBe(86400 + 3600);
    });
  });

  describe('toSearchRequest', () => {
    it('converts kilometres to metres and the date to seconds', () => {
      expect(toSearchRequest({ ...DEFAULT_MISSION, day: 2, initialAltitudeKm: 80, finalAltitudeKm: 250 })).toEqual({
        origin: 'Kerbin',
        destination: 'Duna',
        now: 6 * 3600,
        initialAltitude: 80e3,
        finalAltitude: 250e3,
        windowCount: 5,
      });
    });

    it('requests no insertion burn when not capturing', () => {
      expect(toSearchRequest({ ...DEFAULT_MISSION, capture: false }).finalAltitude).toBeNull();
    });
  });
});

describe('missionSchema', () => {
  const formFor = (m: Partial<Mission>) =>
    TestBed.runInInjectionContext(() => form(signal<Mission>({ ...DEFAULT_MISSION, ...m }), missionSchema));

  it('accepts the default mission', () => {
    expect(formFor({})().valid()).toBe(true);
  });

  it('requires a year of at least 1', () => {
    const f = formFor({ year: 0 });
    expect(f.year().invalid()).toBe(true);
    expect(f.year().errors()[0].message).toMatch(/at least 1/i);
  });

  it('limits the day to the length of the year in the selected calendar', () => {
    expect(formFor({ day: 426 }).day().valid()).toBe(true);
    expect(formFor({ day: 427 }).day().errors()[0].message).toBe('Day must be between 1 and 426');
    expect(formFor({ day: 400, calendar: 'earth' }).day().errors()[0].message).toBe('Day must be between 1 and 365');
    expect(formFor({ day: 0 }).day().invalid()).toBe(true);
  });

  it('limits the hour to the length of the day in the selected calendar', () => {
    expect(formFor({ hour: 5 }).hour().valid()).toBe(true);
    expect(formFor({ hour: 6 }).hour().errors()[0].message).toBe('Hour must be between 0 and 5');
    expect(formFor({ hour: 23, calendar: 'earth' }).hour().valid()).toBe(true);
  });

  it('requires numbers to be filled in', () => {
    expect(formFor({ year: NaN }).year().invalid()).toBe(true);
    expect(formFor({ initialAltitudeKm: null as unknown as number }).initialAltitudeKm().invalid()).toBe(true);
  });

  it('does not allow negative altitudes', () => {
    expect(formFor({ initialAltitudeKm: -1 }).initialAltitudeKm().invalid()).toBe(true);
    expect(formFor({ finalAltitudeKm: -1 }).finalAltitudeKm().invalid()).toBe(true);
  });

  it('disables the capture altitude for a flyby', () => {
    expect(formFor({ capture: false }).finalAltitudeKm().disabled()).toBe(true);
    expect(formFor({ capture: true }).finalAltitudeKm().disabled()).toBe(false);
  });
});
