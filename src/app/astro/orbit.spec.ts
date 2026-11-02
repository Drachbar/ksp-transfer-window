import { Orbit } from './orbit';
import { BODIES, type BodyName } from './bodies';
import { decode, expectClose } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/orbit-from-state.json';
import type { Vec3 } from './vector';

interface FromStateCase {
  referenceBody: BodyName;
  position: Vec3;
  velocity: Vec3;
  t: number;
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  longitudeOfAscendingNode: number;
  argumentOfPeriapsis: number;
  timeOfPeriapsisPassage: number;
  trueAnomalyAtPosition: number;
}

describe('Orbit', () => {
  describe('fromPositionAndVelocity', () => {
    for (const c of decode<FromStateCase[]>(fixture)) {
      it(`matches the original around ${c.referenceBody} at t = ${c.t}`, () => {
        const orbit = Orbit.fromPositionAndVelocity(BODIES[c.referenceBody], c.position, c.velocity, c.t);
        expectClose(orbit.semiMajorAxis, c.semiMajorAxis, 1e-9);
        expectClose(orbit.eccentricity, c.eccentricity, 1e-9);
        expectClose(orbit.inclination, c.inclination, 1e-9);
        expectClose(orbit.longitudeOfAscendingNode, c.longitudeOfAscendingNode, 1e-9);
        expectClose(orbit.argumentOfPeriapsis, c.argumentOfPeriapsis, 1e-9);
        expectClose(orbit.timeOfPeriapsisPassage, c.timeOfPeriapsisPassage, 1e-9, 1e-3);
        expectClose(orbit.trueAnomalyAtPosition(c.position), c.trueAnomalyAtPosition, 1e-9);
      });

      it(`round-trips position and velocity around ${c.referenceBody}`, () => {
        const orbit = Orbit.fromPositionAndVelocity(BODIES[c.referenceBody], c.position, c.velocity, c.t);
        const nu = orbit.trueAnomalyAt(c.t);
        expectClose(orbit.positionAtTrueAnomaly(nu), c.position, 1e-6, 1);
        expectClose(orbit.velocityAtTrueAnomaly(nu), c.velocity, 1e-6, 1e-3);
      });
    }
  });

  describe('phaseAngle', () => {
    const sun = BODIES.Kerbol;
    const circular = (radius: number, meanAnomalyAtEpoch: number) =>
      new Orbit(sun, {
        semiMajorAxis: radius,
        eccentricity: 0,
        inclination: 0,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomalyAtEpoch,
      });

    it('is the angle the target leads by, for an outer target', () => {
      const inner = circular(1e10, 0);
      const outer = circular(2e10, Math.PI / 4);
      expectClose(inner.phaseAngle(outer, 0), Math.PI / 4);
    });

    it('is negative for an inner target', () => {
      const outer = circular(2e10, 0);
      const inner = circular(1e10, Math.PI / 4);
      expectClose(outer.phaseAngle(inner, 0), Math.PI / 4 - 2 * Math.PI);
    });

    it('is in [0, 2π) when the target trails behind', () => {
      const inner = circular(1e10, Math.PI / 2);
      const outer = circular(2e10, 0);
      expectClose(inner.phaseAngle(outer, 0), (3 * Math.PI) / 2);
    });
  });

  it('is hyperbolic when eccentricity > 1, with infinite period', () => {
    const orbit = new Orbit(BODIES.Kerbin, {
      semiMajorAxis: -1e6,
      eccentricity: 1.5,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      timeOfPeriapsisPassage: 0,
    });
    expect(orbit.isHyperbolic()).toBe(true);
    expect(orbit.period()).toBe(Infinity);
    expectClose(orbit.trueAnomalyAt(0), 0);
  });
});
