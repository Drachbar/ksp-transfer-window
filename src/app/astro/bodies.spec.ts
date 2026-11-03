import { BODIES, BODY_NAMES, bodiesOrbiting, type BodyName } from './bodies';
import { decode, expectClose } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/bodies.json';
import type { Vec3 } from './vector';

interface BodyFixture {
  name: BodyName;
  mass: number;
  radius: number;
  gravitationalParameter: number;
  sphereOfInfluence: number | null;
  circularOrbitVelocityAt100km: number;
  orbit?: {
    referenceBody: BodyName;
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    longitudeOfAscendingNode: number;
    argumentOfPeriapsis: number;
    meanAnomalyAtEpoch: number;
    period: number;
    meanMotion: number;
    apoapsis: number;
    periapsis: number;
    semiLatusRectum: number;
    normalVector: Vec3;
    samples: {
      t: number;
      meanAnomaly: number;
      eccentricAnomaly: number;
      trueAnomaly: number;
      radius: number;
      speed: number;
      position: Vec3;
      velocity: Vec3;
      timeAtTrueAnomaly: number;
    }[];
  };
}

describe('bodies', () => {
  const bodies = decode<BodyFixture[]>(fixture);

  it('contains every stock body, in the same order as the original', () => {
    expect(BODY_NAMES).toEqual(bodies.map((b) => b.name));
  });

  for (const expected of bodies) {
    describe(expected.name, () => {
      const body = BODIES[expected.name];

      it('has the same physical properties', () => {
        expect(body.name).toBe(expected.name);
        expect(body.mass).toBe(expected.mass);
        expect(body.radius).toBe(expected.radius);
        expectClose(body.gravitationalParameter, expected.gravitationalParameter);
        expectClose(body.sphereOfInfluence ?? null, expected.sphereOfInfluence);
        expectClose(body.circularOrbitVelocity(100e3), expected.circularOrbitVelocityAt100km);
      });

      const o = expected.orbit;
      if (!o) {
        it('has no orbit (it is the root of the system)', () => expect(body.orbit).toBeUndefined());
        return;
      }

      it('has the same orbital elements', () => {
        const orbit = body.orbit!;
        expect(orbit.referenceBody.name).toBe(o.referenceBody);
        expect(orbit.semiMajorAxis).toBe(o.semiMajorAxis);
        expect(orbit.eccentricity).toBe(o.eccentricity);
        expectClose(orbit.inclination, o.inclination, 1e-15);
        expectClose(orbit.longitudeOfAscendingNode, o.longitudeOfAscendingNode, 1e-15);
        expectClose(orbit.argumentOfPeriapsis, o.argumentOfPeriapsis, 1e-15);
        expect(orbit.meanAnomalyAtEpoch).toBe(o.meanAnomalyAtEpoch);
        expectClose(orbit.period(), o.period);
        expectClose(orbit.meanMotion(), o.meanMotion);
        expectClose(orbit.apoapsis(), o.apoapsis);
        expectClose(orbit.periapsis(), o.periapsis);
        expectClose(orbit.semiLatusRectum(), o.semiLatusRectum);
        expectClose(orbit.normalVector(), o.normalVector, 1e-12, 1e-12);
      });

      for (const s of o.samples) {
        it(`has the same state at t = ${s.t}`, () => {
          const orbit = body.orbit!;
          expectClose(orbit.meanAnomalyAt(s.t), s.meanAnomaly, 1e-12, 1e-12, 'meanAnomaly');
          expectClose(orbit.eccentricAnomalyAt(s.t), s.eccentricAnomaly, 1e-12, 1e-12, 'eccentricAnomaly');
          const nu = orbit.trueAnomalyAt(s.t);
          expectClose(nu, s.trueAnomaly, 1e-12, 1e-12, 'trueAnomaly');
          expectClose(orbit.radiusAtTrueAnomaly(nu), s.radius, 1e-12, 1e-6, 'radius');
          expectClose(orbit.speedAtTrueAnomaly(nu), s.speed, 1e-12, 1e-9, 'speed');
          expectClose(orbit.positionAtTrueAnomaly(nu), s.position, 1e-9, 1e-3, 'position');
          expectClose(orbit.velocityAtTrueAnomaly(nu), s.velocity, 1e-9, 1e-6, 'velocity');
          expectClose(orbit.timeAtTrueAnomaly(nu, s.t), s.timeAtTrueAnomaly, 1e-12, 1e-6, 'timeAtTrueAnomaly');
        });
      }
    });
  }

  it('lists the bodies orbiting a body', () => {
    expect(bodiesOrbiting(BODIES.Kerbin).map((b) => b.name)).toEqual(['Mun', 'Minmus']);
    expect(bodiesOrbiting(BODIES.Jool).map((b) => b.name)).toEqual(['Laythe', 'Vall', 'Tylo', 'Bop', 'Pol']);
    expect(bodiesOrbiting(BODIES.Kerbol).map((b) => b.name)).toEqual(['Moho', 'Eve', 'Kerbin', 'Duna', 'Dres', 'Jool', 'Eeloo']);
    expect(bodiesOrbiting(BODIES.Mun)).toEqual([]);
  });

  it('uses the sidereal rotation period for Kerbin (the original had the 6-hour solar day)', () => {
    expect(BODIES.Kerbin.siderealRotation).toBe(21549.425);
  });

  it('knows the height of each atmosphere', () => {
    const heights = Object.fromEntries(BODY_NAMES.map((n) => [n, BODIES[n].atmosphereHeight]));
    expect(heights).toEqual({
      Kerbol: 600e3, Moho: 0, Eve: 90e3, Gilly: 0, Kerbin: 70e3, Mun: 0, Minmus: 0, Duna: 50e3, Ike: 0,
      Dres: 0, Jool: 200e3, Laythe: 50e3, Vall: 0, Tylo: 0, Bop: 0, Pol: 0, Eeloo: 0,
    });
  });
});
