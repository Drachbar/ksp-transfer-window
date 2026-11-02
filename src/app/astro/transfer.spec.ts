import { refineTransfer, transfer, transferDetails, type Transfer, type TransferDetails, type TransferType } from './transfer';
import { BODIES, type BodyName } from './bodies';
import { decode, expectClose } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/transfers.json';
import type { Vec3 } from './vector';

type Scalars = Record<string, number | null> & {
  ejectionVelocity: Vec3 | null;
  ejectionDeltaVector: Vec3 | null;
  insertionVelocity: Vec3 | null;
};

interface Detailed {
  t0: number;
  dt: number;
  transfer: Scalars;
  refined: Scalars | null;
}

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
  transfers: Record<'ballistic' | 'optimalPlaneChange' | 'optimal', { grid: number[][]; best: Detailed; samples: Detailed[] }>;
}

// Results go through iterative root finding, so allow a little slack.
const REL = 1e-7;
const ABS_DV = 1e-6; // m/s
const ABS_ANGLE = 1e-9; // rad

const SCALAR_KEYS = [
  'angle', 'ejectionInclination', 'ejectionAngle', 'ejectionDeltaV',
  'planeChangeAngleToIntercept', 'planeChangeDeltaV', 'planeChangeTime', 'planeChangeAngle',
  'insertionInclination', 'insertionDeltaV', 'deltaV',
  'ejectionNormalDeltaV', 'ejectionProgradeDeltaV', 'ejectionRadialDeltaV', 'ejectionHeading', 'ejectionPitch',
] as const;

function expectSameTransfer(actual: Transfer & Partial<TransferDetails>, expected: Scalars, label: string) {
  for (const key of SCALAR_KEYS) {
    const value = (actual as unknown as Record<string, number | undefined>)[key];
    const abs = key.endsWith('DeltaV') ? ABS_DV : key === 'planeChangeTime' ? 1e-3 : ABS_ANGLE;
    expectClose(value ?? null, expected[key], REL, abs, `${label}.${key}`);
  }
  expectClose(actual.ejectionVelocity ?? null, expected.ejectionVelocity, REL, ABS_DV, `${label}.ejectionVelocity`);
  expectClose(actual.ejectionDeltaVector ?? null, expected.ejectionDeltaVector, REL, ABS_DV, `${label}.ejectionDeltaVector`);
  expectClose(actual.insertionVelocity ?? null, expected.insertionVelocity, REL, ABS_DV, `${label}.insertionVelocity`);
}

describe('transfer', () => {
  const missions = decode<Mission[]>(fixture);

  for (const m of missions) {
    const origin = BODIES[m.origin];
    const destination = BODIES[m.destination];

    for (const [type, data] of Object.entries(m.transfers) as [TransferType, Mission['transfers']['ballistic']][]) {
      describe(`${m.origin} → ${m.destination} (${type})`, () => {
        it('gives the same total Δv as the original over a porkchop grid', () => {
          const n = m.gridSize;
          for (let j = 0; j < n; j++) {
            const dt = m.shortestTimeOfFlight + (j / (n - 1)) * m.yScale;
            for (let i = 0; i < n; i++) {
              const t0 = m.earliestDeparture + (i / (n - 1)) * m.xScale;
              const result = transfer(type, origin, destination, t0, dt, m.initialOrbitalVelocity, m.finalOrbitalVelocity);
              expectClose(result.deltaV, data.grid[j][i], REL, ABS_DV, `grid[${j}][${i}]`);
            }
          }
        });

        for (const [label, d] of [['best', data.best], ...data.samples.map((s, i) => [`sample ${i}`, s] as const)] as const) {
          it(`gives the same transfer details as the original (${label})`, () => {
            const t = transfer(type, origin, destination, d.t0, d.dt, m.initialOrbitalVelocity, m.finalOrbitalVelocity);
            expectSameTransfer({ ...t, ...transferDetails(t, origin, d.t0, m.initialOrbitalVelocity) }, d.transfer, label);
          });

          if (d.refined) {
            const refined = d.refined;
            it(`refines the transfer like the original (${label})`, () => {
              const t = transfer(type, origin, destination, d.t0, d.dt, m.initialOrbitalVelocity, m.finalOrbitalVelocity);
              const r = refineTransfer(t, type, origin, destination, d.t0, d.dt, m.initialOrbitalVelocity, m.finalOrbitalVelocity);
              expectSameTransfer(r, refined, `${label} refined`);
            });
          }
        }
      });
    }
  }

  it('reports no insertion burn when the final orbit is null', () => {
    const t = transfer('ballistic', BODIES.Kerbin, BODIES.Duna, 4.57e6, 5.63e6, BODIES.Kerbin.circularOrbitVelocity(100e3), null);
    expect(t.insertionDeltaV).toBe(0);
    expect(t.deltaV).toBeCloseTo(t.ejectionDeltaV + t.planeChangeDeltaV, 6);
  });

  it('does not mutate the transfer when computing details', () => {
    const v0 = BODIES.Kerbin.circularOrbitVelocity(100e3);
    const t = transfer('ballistic', BODIES.Kerbin, BODIES.Duna, 4.57e6, 5.63e6, v0, 0);
    const before = { ...t };
    transferDetails(t, BODIES.Kerbin, 4.57e6, v0);
    expect(t).toEqual(before);
  });
});
