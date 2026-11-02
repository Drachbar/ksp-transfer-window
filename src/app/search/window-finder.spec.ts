import { describeTransfer, findTransferWindows, type WindowSearchParams, type WindowSearchResult } from './window-finder';
import { defaultSearchRanges } from './ranges';
import { transfer } from '../astro/transfer';
import { Orbit } from '../astro/orbit';
import { BODIES, type BodyName } from '../astro/bodies';
import { decode } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/transfers.json';

const DEG = Math.PI / 180;

const paramsFor = (origin: BodyName, destination: BodyName, now: number, windowCount = 3): WindowSearchParams => ({
  origin: BODIES[origin],
  destination: BODIES[destination],
  now,
  initialOrbitalVelocity: BODIES[origin].circularOrbitVelocity(100e3),
  finalOrbitalVelocity: BODIES[destination].circularOrbitVelocity(100e3),
  windowCount,
});

/** Total Δv of the (unrefined) transfer, which is what the search minimises. */
const deltaVAt = (p: WindowSearchParams, t0: number, dt: number) =>
  transfer('ballistic', p.origin, p.destination, t0, dt, p.initialOrbitalVelocity, p.finalOrbitalVelocity).deltaV;

describe('findTransferWindows', () => {
  describe('Kerbin → Duna from t = 0', () => {
    const params = paramsFor('Kerbin', 'Duna', 0, 3);
    const { synodicPeriod, hohmannTransferTime } = defaultSearchRanges(params.origin, params.destination);
    let result: WindowSearchResult;
    beforeAll(() => (result = findTransferWindows(params)));

    it('finds the requested number of windows, in order, all in the future', () => {
      expect(result.windows.length).toBe(3);
      const departures = result.windows.map((w) => w.departureTime);
      expect([...departures].sort((a, b) => a - b)).toEqual(departures);
      expect(departures[0]).toBeGreaterThanOrEqual(0);
    });

    it('spaces the windows roughly one synodic period apart', () => {
      for (let k = 1; k < result.windows.length; k++) {
        const gap = result.windows[k].departureTime - result.windows[k - 1].departureTime;
        expect(gap / synodicPeriod).toBeGreaterThan(0.7);
        expect(gap / synodicPeriod).toBeLessThan(1.3);
      }
    });

    it('puts each window at a local minimum of the Δv', () => {
      const ds = 0.002 * synodicPeriod;
      const dh = 0.002 * hohmannTransferTime;
      for (const w of result.windows) {
        const here = deltaVAt(params, w.departureTime, w.timeOfFlight);
        for (const [a, b] of [[ds, 0], [-ds, 0], [0, dh], [0, -dh], [ds, dh], [-ds, -dh], [ds, -dh], [-ds, dh]]) {
          expect(here).toBeLessThanOrEqual(deltaVAt(params, w.departureTime + a, w.timeOfFlight + b) + 0.01);
        }
      }
    });

    it('describes each window', () => {
      for (const w of result.windows) {
        expect(w.arrivalTime).toBeCloseTo(w.departureTime + w.timeOfFlight, 3);
        expect(w.deltaV).toBe(w.transfer.deltaV);
        expect(w.deltaV).toBeGreaterThan(1000);
        expect(w.deltaV).toBeLessThan(2500);
        expect(Number.isFinite(w.details.ejectionProgradeDeltaV)).toBe(true);
        expect(Number.isFinite(w.details.ejectionNormalDeltaV)).toBe(true);
        expect(Number.isFinite(w.transfer.ejectionAngle!)).toBe(true);
      }
    });

    it('gives the heliocentric departure velocity, which leads to the destination at arrival', () => {
      for (const w of result.windows) {
        const o = params.origin.orbit!;
        const start = o.positionAtTrueAnomaly(o.trueAnomalyAt(w.departureTime));
        const orbit = Orbit.fromPositionAndVelocity(params.origin.orbit!.referenceBody, start, w.departureVelocity, w.departureTime);
        const end = orbit.positionAtTrueAnomaly(orbit.trueAnomalyAt(w.arrivalTime));
        const d = params.destination.orbit!;
        const target = d.positionAtTrueAnomaly(d.trueAnomalyAt(w.arrivalTime));
        expect(Math.hypot(end[0] - target[0], end[1] - target[1], end[2] - target[2])).toBeLessThan(1e6); // < 1000 km
      }
    });

    it('has a phase angle near the textbook Hohmann value of 44° (eccentricity shifts real optima)', () => {
      for (const w of result.windows) {
        expect(w.phaseAngle / DEG).toBeGreaterThan(25);
        expect(w.phaseAngle / DEG).toBeLessThan(55);
      }
    });

    it('has a phase angle consistent with where Duna is when the craft arrives', () => {
      // At arrival the craft has travelled `transfer.angle`; Duna has moved about n·tof since departure.
      const n = params.destination.orbit!.meanMotion();
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      for (const w of result.windows) {
        const expected = wrap(w.transfer.angle - n * w.timeOfFlight);
        expect(Math.abs(wrap(w.phaseAngle - expected)) / DEG).toBeLessThan(10);
      }
    });

    it('finds the first window around day 237 (Kerbin days), like the original planner', () => {
      expect(result.windows[0].departureTime / 21600).toBeGreaterThan(225);
      expect(result.windows[0].departureTime / 21600).toBeLessThan(250);
    });

    it('also answers "what if I leave right now?"', () => {
      const now = result.departNow!;
      expect(now.departureTime).toBe(0);
      // Its time of flight should beat a coarse scan over the search range.
      const { shortestTimeOfFlight, timeOfFlightSpan } = defaultSearchRanges(params.origin, params.destination);
      for (let k = 0; k <= 50; k++) {
        const dt = shortestTimeOfFlight + (k / 50) * timeOfFlightSpan;
        expect(deltaVAt(params, 0, now.timeOfFlight)).toBeLessThanOrEqual(deltaVAt(params, 0, dt) + 0.01);
      }
      expect(now.deltaV).toBeGreaterThan(Math.min(...result.windows.map((w) => w.deltaV)));
    });
  });

  it('finds windows at least as good as the best cell of the original planner’s grid', () => {
    const missions = decode<{ origin: BodyName; destination: BodyName; earliestDeparture: number; xScale: number; transfers: { ballistic: { best: { transfer: { deltaV: number } } } } }[]>(fixture);
    for (const m of missions.filter((x) => ['Duna', 'Eve', 'Jool', 'Dres'].includes(x.destination) && x.origin === 'Kerbin')) {
      const params = { ...paramsFor(m.origin, m.destination, m.earliestDeparture, 2) };
      const fixtureMission = missions.find((x) => x === m)! as unknown as { initialOrbitalVelocity: number; finalOrbitalVelocity: number | null };
      params.initialOrbitalVelocity = fixtureMission.initialOrbitalVelocity;
      params.finalOrbitalVelocity = fixtureMission.finalOrbitalVelocity;
      const { windows } = findTransferWindows(params);
      const inRange = windows.filter((w) => w.departureTime <= m.earliestDeparture + m.xScale);
      const best = Math.min(...inRange.map((w) => deltaVAt(params, w.departureTime, w.timeOfFlight)));
      expect(best, `${m.origin} → ${m.destination}`).toBeLessThanOrEqual(m.transfers.ballistic.best.transfer.deltaV + 0.01);
    }
  });

  it('has phase angles in the right neighbourhood for Eve (Hohmann ≈ −54°) and Jool (≈ 97°)', () => {
    for (const w of findTransferWindows(paramsFor('Kerbin', 'Eve', 0, 2)).windows) {
      expect(w.phaseAngle / DEG).toBeGreaterThan(-65);
      expect(w.phaseAngle / DEG).toBeLessThan(-25);
    }
    for (const w of findTransferWindows(paramsFor('Kerbin', 'Jool', 0, 3)).windows) {
      expect(w.phaseAngle / DEG).toBeGreaterThan(55);
      expect(w.phaseAngle / DEG).toBeLessThan(115);
    }
  });

  it('does not report the tail of a window that has already passed as an upcoming window', () => {
    // At t = 0 the Kerbin → Eve Δv is still falling from a window that is just past; that is "depart now", not a window.
    const params = paramsFor('Kerbin', 'Eve', 0, 2);
    const { synodicPeriod } = defaultSearchRanges(params.origin, params.destination);
    const { windows } = findTransferWindows(params);
    expect(windows.length).toBe(2);
    expect(windows[0].departureTime).toBeGreaterThan(0.1 * synodicPeriod);
  });

  it('falls back to the estimate when the ejection refinement diverges, and says so', () => {
    // The refinement (same algorithm as the original's "refine" button) is unstable when the
    // ejection inclination is ~0°, which is exactly where the third Kerbin → Jool optimum lies.
    const params = paramsFor('Kerbin', 'Jool', 0, 3);
    for (const w of findTransferWindows(params).windows) {
      const estimate = deltaVAt(params, w.departureTime, w.timeOfFlight);
      expect(Math.abs(w.deltaV - estimate) / estimate).toBeLessThan(0.03);
      if (!w.refined) expect(w.deltaV).toBe(estimate);
    }
  });

  it('works between moons of the same planet', () => {
    const { windows, departNow } = findTransferWindows(paramsFor('Mun', 'Minmus', 0, 2));
    expect(windows.length).toBe(2);
    for (const w of windows) expect(Number.isFinite(w.deltaV)).toBe(true);
    expect(departNow).not.toBeNull();
  });

  it('describes any departure time and time of flight the same way as a found window', () => {
    const params = paramsFor('Kerbin', 'Duna', 0, 1);
    const [w] = findTransferWindows(params).windows;
    expect(describeTransfer(params, w.departureTime, w.timeOfFlight)).toEqual(w);
    const other = describeTransfer(params, w.departureTime + 10 * 21600, w.timeOfFlight - 5 * 21600);
    expect(other.deltaV).toBeGreaterThan(w.deltaV);
    expect(other.arrivalTime).toBe(w.departureTime + 10 * 21600 + w.timeOfFlight - 5 * 21600);
  });

  it('respects a maximum time of flight', () => {
    const max = 500 * 21600;
    const { windows, departNow } = findTransferWindows({ ...paramsFor('Kerbin', 'Jool', 0, 3), maxTimeOfFlight: max });
    expect(windows.length).toBe(3);
    for (const w of [...windows, departNow!]) expect(w.timeOfFlight).toBeLessThanOrEqual(max + 1);
  });

  describe('mid-course plane change', () => {
    it('suggests a nearby plane-change transfer when it saves more than 10 %', () => {
      // Dres is inclined 5°; every other window is much cheaper with a plane change.
      const params = paramsFor('Kerbin', 'Dres', 0, 3);
      const { synodicPeriod } = defaultSearchRanges(params.origin, params.destination);
      const { windows } = findTransferWindows(params);
      const suggested = windows.filter((w) => w.planeChangeAlternative);
      expect(suggested.length).toBeGreaterThan(0);
      for (const w of suggested) {
        const alt = w.planeChangeAlternative!;
        expect(alt.deltaV).toBeLessThan(0.9 * w.deltaV);
        expect(alt.transfer.planeChangeDeltaV).toBeGreaterThan(0);
        expect(alt.transfer.planeChangeTime).toBeGreaterThan(alt.departureTime);
        expect(alt.transfer.planeChangeTime).toBeLessThan(alt.arrivalTime);
        expect(Math.abs(alt.departureTime - w.departureTime)).toBeLessThan(0.3 * synodicPeriod);
        expect(alt.planeChangeAlternative).toBeUndefined();
      }
    });

    it('does not suggest one when the saving is small', () => {
      expect(findTransferWindows(paramsFor('Kerbin', 'Duna', 0, 3)).windows.some((w) => w.planeChangeAlternative)).toBe(false);
    });

    it('can be switched off', () => {
      const { windows } = findTransferWindows({ ...paramsFor('Kerbin', 'Dres', 0, 3), suggestPlaneChange: false });
      expect(windows.some((w) => w.planeChangeAlternative)).toBe(false);
    });
  });

  it('rejects bodies that do not orbit the same parent', () => {
    expect(() => findTransferWindows(paramsFor('Kerbin', 'Laythe', 0))).toThrow(/same/i);
  });

  it('reports progress up to 1', () => {
    const progress: number[] = [];
    findTransferWindows({ ...paramsFor('Kerbin', 'Duna', 0, 1), resolution: { departuresPerSynodicPeriod: 20, timesOfFlight: 20 } }, (f) => progress.push(f));
    expect(progress.at(-1)).toBe(1);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });
});
