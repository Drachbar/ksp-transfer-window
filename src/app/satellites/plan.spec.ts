import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { DEFAULT_PLAN, evaluatePlan, planFromQueryParams, planSchema, planToQueryParams, targetAltitudeOf, type SatellitePlan } from './plan';
import { synchronousOrbit } from './constellation';
import { BODIES } from '../astro/bodies';

const params = (p: Record<string, string>) => (key: string) => p[key] ?? null;

describe('satellite plan', () => {
  it('defaults to three relay satellites in Kerbin’s stationary orbit', () => {
    expect(DEFAULT_PLAN).toEqual<SatellitePlan>({
      body: 'Kerbin',
      orbit: 'stationary',
      altitudeKm: 1000,
      count: 3,
      parkingAltitudeKm: 100,
      deployFrom: 'below',
      antenna: 'RA-2 Relay Antenna',
      dsnLevel: 0,
    });
  });

  describe('targetAltitudeOf', () => {
    it('follows the body’s rotation for a stationary orbit', () => {
      expect(targetAltitudeOf(DEFAULT_PLAN)).toBeCloseTo(synchronousOrbit(BODIES.Kerbin).altitude, 6);
    });

    it('uses the given altitude otherwise', () => {
      expect(targetAltitudeOf({ ...DEFAULT_PLAN, orbit: 'custom', altitudeKm: 750 })).toBe(750e3);
    });
  });

  describe('evaluatePlan', () => {
    it('combines the deployment and the comms check', () => {
      const r = evaluatePlan(DEFAULT_PLAN);
      expect(r.constellation.target.altitude).toBeCloseTo(synchronousOrbit(BODIES.Kerbin).altitude, 6);
      expect(r.constellation.problems).toEqual([]);
      expect(r.comms.neighbours.ok).toBe(true); // RA-2: 2 Gm
      expect(r.comms.home.ok).toBe(true);
      expect(r.antenna.name).toBe('RA-2 Relay Antenna');
    });

    it('suggests a custom altitude when there is no stationary orbit inside the sphere of influence', () => {
      const problems = evaluatePlan({ ...DEFAULT_PLAN, body: 'Mun', parkingAltitudeKm: 20 }).constellation.problems;
      expect(problems.join(' ')).toMatch(/Mun has no stationary orbit.*custom altitude/i);
      expect(problems.join(' ')).not.toMatch(/target orbit is outside/i); // one message, not two
    });

    it('shows when the antennas are too weak', () => {
      expect(evaluatePlan({ ...DEFAULT_PLAN, antenna: 'HG-5 High Gain Antenna' }).comms.neighbours.ok).toBe(false); // 5,000 km < 6,000 km
    });
  });

  describe('query parameters', () => {
    const custom: SatellitePlan = {
      body: 'Duna',
      orbit: 'custom',
      altitudeKm: 1500,
      count: 4,
      parkingAltitudeKm: 80,
      deployFrom: 'above',
      antenna: 'HG-5 High Gain Antenna',
      dsnLevel: 2,
    };

    it('round-trips a plan', () => {
      expect({ ...DEFAULT_PLAN, ...planFromQueryParams(params(planToQueryParams(custom))) }).toEqual(custom);
    });

    it('still opens links made before "synchronous" was renamed', () => {
      expect(planFromQueryParams(params({ orbit: 'sync' }))).toEqual({ orbit: 'stationary' });
      expect(planFromQueryParams(params({ orbit: 'semi' }))).toEqual({});
    });

    it('only takes relay antennas, since satellites in a network must pass signals on', () => {
      expect(planFromQueryParams(params({ antenna: 'Communotron 88-88' }))).toEqual({});
      expect(planFromQueryParams(params({ antenna: 'RA-15 Relay Antenna' }))).toEqual({ antenna: 'RA-15 Relay Antenna' });
    });

    it('ignores nonsense', () => {
      expect(planFromQueryParams(params({ body: 'Narnia', orbit: 'square', n: 'x', from: 'sideways', antenna: 'tin can', dsn: '7' }))).toEqual({});
    });
  });

  describe('planSchema', () => {
    const formFor = (p: Partial<SatellitePlan>) => TestBed.runInInjectionContext(() => form(signal<SatellitePlan>({ ...DEFAULT_PLAN, ...p }), planSchema));

    it('accepts the default plan', () => {
      expect(formFor({})().valid()).toBe(true);
    });

    it('needs a whole number of satellites from 2 to 12', () => {
      expect(formFor({ count: 1 }).count().invalid()).toBe(true);
      expect(formFor({ count: 2.5 }).count().invalid()).toBe(true);
      expect(formFor({ count: 13 }).count().invalid()).toBe(true);
    });

    it('only asks for an altitude for a custom orbit', () => {
      expect(formFor({ orbit: 'stationary' }).altitudeKm().disabled()).toBe(true);
      expect(formFor({ orbit: 'custom', altitudeKm: -1 }).altitudeKm().invalid()).toBe(true);
    });
  });
});
