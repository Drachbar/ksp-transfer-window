import { constellation, lineOfSightAltitude, orbitForPeriod, synchronousOrbit } from './constellation';
import { BODIES } from '../astro/bodies';

const period = (mu: number, r: number) => 2 * Math.PI * Math.sqrt((r * r * r) / mu);
const visViva = (mu: number, r: number, a: number) => Math.sqrt(mu * (2 / r - 1 / a));

describe('synchronousOrbit', () => {
  it('puts Kerbin’s stationary orbit at the well-known 2,863.33 km', () => {
    const o = synchronousOrbit(BODIES.Kerbin);
    expect(o.period).toBe(21549.425);
    expect(o.altitude / 1e3).toBeCloseTo(2863.33, 1);
    expect(o.withinSoi).toBe(true);
  });

  it('gives a semi-synchronous orbit for half a rotation', () => {
    const o = synchronousOrbit(BODIES.Kerbin, 0.5);
    expect(period(BODIES.Kerbin.gravitationalParameter, o.radius)).toBeCloseTo(21549.425 / 2, 3);
  });

  it('finds Minmus’s stationary orbit just above its surface', () => {
    expect(synchronousOrbit(BODIES.Minmus).altitude / 1e3).toBeCloseTo(357.9, 0);
  });

  it('notices when a body spins too slowly to have one inside its sphere of influence', () => {
    expect(synchronousOrbit(BODIES.Mun).withinSoi).toBe(false);
    expect(synchronousOrbit(BODIES.Kerbol).withinSoi).toBe(true); // no SoI limit
  });
});

describe('orbitForPeriod', () => {
  it('is the circular orbit with the given period', () => {
    const o = orbitForPeriod(BODIES.Duna, 50_000);
    expect(period(BODIES.Duna.gravitationalParameter, o.radius)).toBeCloseTo(50_000, 3);
    expect(o.altitude).toBeCloseTo(o.radius - BODIES.Duna.radius, 6);
  });
});

describe('lineOfSightAltitude', () => {
  it('is how high the satellites must be to see their neighbours past the body', () => {
    expect(lineOfSightAltitude(BODIES.Kerbin, 3)).toBeCloseTo(600e3, 3); // R / cos 60° − R
    expect(lineOfSightAltitude(BODIES.Kerbin, 4)).toBeCloseTo(600e3 * (Math.SQRT2 - 1), 3);
  });

  it('is impossible with fewer than three satellites', () => {
    expect(lineOfSightAltitude(BODIES.Kerbin, 2)).toBeNull();
  });
});

describe('constellation', () => {
  const mu = BODIES.Kerbin.gravitationalParameter;
  const target = synchronousOrbit(BODIES.Kerbin);

  describe('deploying from below (resonant orbit with its apoapsis at the target)', () => {
    const c = constellation({ body: BODIES.Kerbin, targetAltitude: target.altitude, count: 3, parkingAltitude: 100e3, deployFrom: 'below' });

    it('has a period of (N−1)/N of the target, so each lap ends one slot further on', () => {
      expect(c.deployment.period).toBeCloseTo((target.period * 2) / 3, 6);
      expect(c.deployment.apoapsis).toBeCloseTo(target.radius, 3);
      expect(period(mu, (c.deployment.apoapsis + c.deployment.periapsis) / 2)).toBeCloseTo(c.deployment.period, 3);
    });

    it('releases each satellite at apoapsis with a prograde circularisation burn', () => {
      const a = (c.deployment.apoapsis + c.deployment.periapsis) / 2;
      expect(c.releaseAt).toBe('apoapsis');
      expect(c.satelliteBurn).toBeCloseTo(Math.sqrt(mu / target.radius) - visViva(mu, target.radius, a), 6);
      expect(c.satelliteBurnDirection).toBe('prograde');
    });

    it('costs a Hohmann-style burn from the parking orbit plus a periapsis raise at apoapsis', () => {
      const r0 = BODIES.Kerbin.radius + 100e3;
      const transfer = (r0 + target.radius) / 2;
      const a = (c.deployment.apoapsis + c.deployment.periapsis) / 2;
      expect(c.carrierBurns[0]).toBeCloseTo(visViva(mu, r0, transfer) - Math.sqrt(mu / r0), 6);
      expect(c.carrierBurns[1]).toBeCloseTo(visViva(mu, target.radius, a) - visViva(mu, target.radius, transfer), 6);
    });

    it('is a valid plan', () => {
      expect(c.problems).toEqual([]);
    });
  });

  describe('deploying from above', () => {
    const c = constellation({ body: BODIES.Kerbin, targetAltitude: target.altitude, count: 4, parkingAltitude: 100e3, deployFrom: 'above' });

    it('has a period of (N+1)/N of the target with its periapsis at the target', () => {
      expect(c.deployment.period).toBeCloseTo((target.period * 5) / 4, 6);
      expect(c.deployment.periapsis).toBeCloseTo(target.radius, 3);
      expect(c.releaseAt).toBe('periapsis');
      expect(c.satelliteBurnDirection).toBe('retrograde');
    });
  });

  it('spaces the satellites evenly', () => {
    const c = constellation({ body: BODIES.Kerbin, targetAltitude: target.altitude, count: 3, parkingAltitude: 100e3, deployFrom: 'below' });
    expect(c.spacing).toBeCloseTo(target.radius * Math.sqrt(3), 3);
  });

  it('warns when the deployment orbit would dip into the atmosphere', () => {
    const c = constellation({ body: BODIES.Kerbin, targetAltitude: 300e3, count: 3, parkingAltitude: 80e3, deployFrom: 'below' });
    expect(c.problems.join(' ')).toMatch(/atmosphere/i);
  });

  it('warns when the satellites cannot see each other past the body', () => {
    const c = constellation({ body: BODIES.Kerbin, targetAltitude: 400e3, count: 3, parkingAltitude: 80e3, deployFrom: 'above' });
    expect(c.problems.join(' ')).toMatch(/line of sight/i);
  });

  it('warns when the orbit is outside the sphere of influence', () => {
    const c = constellation({ body: BODIES.Mun, targetAltitude: synchronousOrbit(BODIES.Mun).altitude, count: 3, parkingAltitude: 20e3, deployFrom: 'below' });
    expect(c.problems.join(' ')).toMatch(/sphere of influence/i);
  });
});
