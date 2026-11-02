import { defaultSearchRanges, hohmannTransferTime, searchRanges, synodicPeriod } from './ranges';
import { BODIES } from '../astro/bodies';

describe('search ranges', () => {
  const kerbinPeriod = BODIES.Kerbin.orbit!.period();
  const dunaPeriod = BODIES.Duna.orbit!.period();

  it('computes the synodic period', () => {
    expect(synodicPeriod(BODIES.Kerbin, BODIES.Duna)).toBeCloseTo(1 / (1 / kerbinPeriod - 1 / dunaPeriod), 3);
    expect(synodicPeriod(BODIES.Duna, BODIES.Kerbin)).toBeCloseTo(synodicPeriod(BODIES.Kerbin, BODIES.Duna), 6);
  });

  it('computes the Hohmann transfer time as half the period of the transfer ellipse', () => {
    const a = (BODIES.Kerbin.orbit!.semiMajorAxis + BODIES.Duna.orbit!.semiMajorAxis) / 2;
    const expected = Math.PI * Math.sqrt(a ** 3 / BODIES.Kerbol.gravitationalParameter);
    expect(hohmannTransferTime(BODIES.Kerbin, BODIES.Duna)).toBeCloseTo(expected, 3);
  });

  it('uses the same time-of-flight range as the original planner', () => {
    const h = hohmannTransferTime(BODIES.Kerbin, BODIES.Duna);
    const r = defaultSearchRanges(BODIES.Kerbin, BODIES.Duna);
    expect(r.shortestTimeOfFlight).toBeCloseTo(Math.max(h - dunaPeriod, h / 2), 3);
    expect(r.timeOfFlightSpan).toBeCloseTo(Math.min(2 * dunaPeriod, h), 3);
    expect(r.synodicPeriod).toBeCloseTo(synodicPeriod(BODIES.Kerbin, BODIES.Duna), 3);
  });

  it('rejects bodies that do not orbit the same parent', () => {
    expect(() => defaultSearchRanges(BODIES.Kerbin, BODIES.Laythe)).toThrow(/same/i);
    expect(() => defaultSearchRanges(BODIES.Kerbin, BODIES.Kerbin)).toThrow(/different/i);
    expect(() => defaultSearchRanges(BODIES.Kerbol, BODIES.Kerbin)).toThrow();
  });

  describe('with a maximum time of flight', () => {
    const r = defaultSearchRanges(BODIES.Kerbin, BODIES.Jool);
    const end = r.shortestTimeOfFlight + r.timeOfFlightSpan;

    it('cuts the range off at the maximum', () => {
      const max = r.shortestTimeOfFlight + 0.25 * r.timeOfFlightSpan;
      expect(searchRanges(BODIES.Kerbin, BODIES.Jool, max)).toEqual({ ...r, timeOfFlightSpan: max - r.shortestTimeOfFlight });
    });

    it('leaves the range alone when the maximum is beyond it', () => {
      expect(searchRanges(BODIES.Kerbin, BODIES.Jool, 2 * end)).toEqual(r);
      expect(searchRanges(BODIES.Kerbin, BODIES.Jool, undefined)).toEqual(r);
    });

    it('searches from half the maximum when the maximum is shorter than the usual range', () => {
      const max = 0.5 * r.shortestTimeOfFlight;
      expect(searchRanges(BODIES.Kerbin, BODIES.Jool, max)).toMatchObject({ shortestTimeOfFlight: max / 2, timeOfFlightSpan: max / 2 });
    });
  });
});
