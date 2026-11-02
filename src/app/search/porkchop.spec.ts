import { computePorkchop, departureTimeAt, timeOfFlightAt, type PorkchopParams } from './porkchop';
import { transfer } from '../astro/transfer';
import { BODIES, type BodyName } from '../astro/bodies';
import { decode, expectClose } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/transfers.json';

interface Mission {
  origin: BodyName;
  destination: BodyName;
  initialOrbitalVelocity: number;
  finalOrbitalVelocity: number | null;
  earliestDeparture: number;
  xScale: number;
  shortestTimeOfFlight: number;
  yScale: number;
  gridSize: number;
  transfers: { ballistic: { grid: number[][] } };
}

describe('computePorkchop', () => {
  const missions = decode<Mission[]>(fixture);

  const paramsFor = (m: Mission): PorkchopParams => ({
    origin: BODIES[m.origin],
    destination: BODIES[m.destination],
    transferType: 'ballistic',
    initialOrbitalVelocity: m.initialOrbitalVelocity,
    finalOrbitalVelocity: m.finalOrbitalVelocity,
    earliestDeparture: m.earliestDeparture,
    departureSpan: m.xScale,
    shortestTimeOfFlight: m.shortestTimeOfFlight,
    timeOfFlightSpan: m.yScale,
    width: m.gridSize,
    height: m.gridSize,
  });

  for (const m of missions) {
    it(`matches the original's Δv grid for ${m.origin} → ${m.destination}`, () => {
      const p = computePorkchop(paramsFor(m));
      for (let j = 0; j < m.gridSize; j++) {
        for (let i = 0; i < m.gridSize; i++) {
          expectClose(p.deltaVs[j * m.gridSize + i], m.transfers.ballistic.grid[j][i], 1e-9, 1e-6, `[${j}][${i}]`);
        }
      }
    });
  }

  it('spans the departure and time-of-flight ranges inclusively', () => {
    const params = paramsFor(missions[0]);
    expect(departureTimeAt(params, 0)).toBe(params.earliestDeparture);
    expect(departureTimeAt(params, params.width - 1)).toBeCloseTo(params.earliestDeparture + params.departureSpan, 6);
    expect(timeOfFlightAt(params, 0)).toBe(params.shortestTimeOfFlight);
    expect(timeOfFlightAt(params, params.height - 1)).toBeCloseTo(params.shortestTimeOfFlight + params.timeOfFlightSpan, 6);
  });

  it('reports the cheapest cell, ignoring NaN cells', () => {
    const m = missions.find((x) => x.origin === 'Mun')!; // has NaN cells
    const params = paramsFor(m);
    const p = computePorkchop(params);
    const finite = Array.from(p.deltaVs).filter(Number.isFinite);
    expect(finite.length).toBeLessThan(p.deltaVs.length);
    expect(p.minDeltaV).toBe(Math.min(...finite));
    expect(p.deltaVs[p.minIndex]).toBe(p.minDeltaV);
  });

  it('gives the same result as calling transfer() directly', () => {
    const params = { ...paramsFor(missions[0]), width: 4, height: 3 };
    const p = computePorkchop(params);
    const t0 = departureTimeAt(params, 2);
    const dt = timeOfFlightAt(params, 1);
    const direct = transfer('ballistic', params.origin, params.destination, t0, dt, params.initialOrbitalVelocity, params.finalOrbitalVelocity);
    expectClose(p.deltaVs[1 * 4 + 2], direct.deltaV, 1e-12);
  });

  it('reports progress', () => {
    const progress: number[] = [];
    computePorkchop({ ...paramsFor(missions[0]), width: 5, height: 5 }, (f) => progress.push(f));
    expect(progress.at(-1)).toBe(1);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });
});
