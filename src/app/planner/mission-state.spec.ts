import { loadStoredMission, missionFromJson, missionFromQueryParams, missionToQueryParams, restoreMission, storeMission, STORAGE_KEY } from './mission-state';
import { DEFAULT_MISSION, type Mission } from './mission';

const params = (p: Record<string, string>) => (key: string) => p[key] ?? null;

const custom: Mission = {
  origin: 'Mun',
  destination: 'Minmus',
  year: 3,
  day: 120,
  hour: 4,
  initialAltitudeKm: 15,
  finalAltitudeKm: 30,
  capture: true,
  calendar: 'earth',
  maxFlightDays: 400,
};

describe('query parameters', () => {
  it('writes every field in a readable form', () => {
    expect(missionToQueryParams(DEFAULT_MISSION)).toEqual({
      from: 'Kerbin',
      to: 'Duna',
      year: '1',
      day: '1',
      hour: '0',
      orbit: '100',
      capture: '100',
      calendar: 'kerbin',
    });
  });

  it('writes the maximum flight time only when there is one', () => {
    expect(missionToQueryParams(custom)['maxflight']).toBe('400');
    expect('maxflight' in missionToQueryParams(DEFAULT_MISSION)).toBe(false);
  });

  it('reads a shared search without a maximum flight time as "no limit", overriding the last visit', () => {
    const shared = missionFromQueryParams(params(missionToQueryParams(DEFAULT_MISSION)));
    expect(restoreMission(shared, { maxFlightDays: 300 }).maxFlightDays).toBeNull();
    // A link with only some parameters leaves the rest to the last visit.
    expect(restoreMission(missionFromQueryParams(params({ to: 'Eve' })), { maxFlightDays: 300 }).maxFlightDays).toBe(300);
  });

  it('writes "none" for a flyby', () => {
    expect(missionToQueryParams({ ...DEFAULT_MISSION, capture: false })['capture']).toBe('none');
  });

  it('round-trips a mission', () => {
    expect(restoreMission(missionFromQueryParams(params(missionToQueryParams(custom))))).toEqual(custom);
    const flyby = { ...custom, capture: false };
    expect(restoreMission(missionFromQueryParams(params(missionToQueryParams(flyby))))).toEqual({ ...flyby, finalAltitudeKm: DEFAULT_MISSION.finalAltitudeKm });
  });

  it('reads only what is there', () => {
    expect(missionFromQueryParams(params({ to: 'Eve', day: '42' }))).toEqual({ destination: 'Eve', day: 42 });
  });

  it('ignores values that make no sense', () => {
    expect(
      missionFromQueryParams(
        params({ from: 'Kerbol', to: 'Narnia', year: 'abc', day: '', hour: 'Infinity', orbit: '-5x', capture: 'lots', calendar: 'mars' }),
      ),
    ).toEqual({});
  });

  it('ignores origins that have nowhere to go', () => {
    expect(missionFromQueryParams(params({ from: 'Gilly' }))).toEqual({});
  });
});

describe('JSON (local storage)', () => {
  it('round-trips a mission', () => {
    expect(restoreMission(missionFromJson(JSON.stringify(custom)))).toEqual(custom);
  });

  it('survives garbage', () => {
    expect(missionFromJson(null)).toEqual({});
    expect(missionFromJson('not json')).toEqual({});
    expect(missionFromJson('42')).toEqual({});
    expect(missionFromJson('{"origin": 7, "day": "x", "capture": "yes"}')).toEqual({});
  });
});

describe('restoreMission', () => {
  it('fills in defaults', () => {
    expect(restoreMission({})).toEqual(DEFAULT_MISSION);
  });

  it('lets earlier sources win', () => {
    expect(restoreMission({ day: 5 }, { day: 9, year: 2 })).toEqual({ ...DEFAULT_MISSION, day: 5, year: 2 });
  });

  it('keeps the destination reachable from the origin', () => {
    expect(restoreMission({ origin: 'Laythe' }, { destination: 'Duna' }).destination).toBe('Vall');
  });
});

describe('storage', () => {
  class MemoryStorage {
    data = new Map<string, string>();
    getItem = (k: string) => this.data.get(k) ?? null;
    setItem = (k: string, v: string) => void this.data.set(k, v);
  }

  it('saves and loads the mission', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    storeMission(storage, custom);
    expect(restoreMission(loadStoredMission(storage))).toEqual(custom);
    expect(JSON.parse((storage as unknown as MemoryStorage).data.get(STORAGE_KEY)!)).toEqual(custom);
  });

  it('works without storage, or when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;
    expect(loadStoredMission(null)).toEqual({});
    expect(loadStoredMission(broken)).toEqual({});
    expect(() => storeMission(broken, custom)).not.toThrow();
    expect(() => storeMission(null, custom)).not.toThrow();
  });
});
