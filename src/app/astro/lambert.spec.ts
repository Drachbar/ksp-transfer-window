import { lambert } from './lambert';
import { decode, expectClose } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/lambert.json';
import type { Vec3 } from './vector';

interface LambertCase {
  label: string;
  mu: number;
  pos1: Vec3;
  pos2: Vec3;
  dt: number;
  maxRevs: number;
  prograde: number;
  solutions: [Vec3, Vec3, number][];
}

describe('lambert', () => {
  const cases = decode<LambertCase[]>(fixture);

  it('has fixtures covering several solution branches', () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(cases.some((c) => c.solutions.length > 1)).toBe(true);
  });

  for (const c of cases) {
    it(`matches the original: ${c.label}`, () => {
      const solutions = lambert(c.mu, c.pos1, c.pos2, c.dt, c.maxRevs, c.prograde);
      expect(solutions.length).toBe(c.solutions.length);
      solutions.forEach((s, i) => {
        expectClose(s.departureVelocity, c.solutions[i][0], 1e-9, 1e-6, `solution ${i} departure`);
        expectClose(s.arrivalVelocity, c.solutions[i][1], 1e-9, 1e-6, `solution ${i} arrival`);
        // The original reported NaN for the hyperbolic transfer angle (bug fixed in the port).
        if (!Number.isNaN(c.solutions[i][2])) {
          expectClose(s.transferAngle, c.solutions[i][2], 1e-12, 1e-12, `solution ${i} angle`);
        }
      });
    });
  }

  it('reports the geometric transfer angle for a hyperbolic solution (original returned NaN)', () => {
    const c = cases.find((x) => x.label === 'hyperbolic fast')!;
    expect(c.solutions[0][2]).toBeNaN();

    const [s] = lambert(c.mu, c.pos1, c.pos2, c.dt, c.maxRevs, c.prograde);
    const r1 = Math.hypot(...c.pos1);
    const r2 = Math.hypot(...c.pos2);
    let expected = Math.acos((c.pos1[0] * c.pos2[0] + c.pos1[1] * c.pos2[1] + c.pos1[2] * c.pos2[2]) / (r1 * r2));
    if (c.pos1[0] * c.pos2[1] - c.pos1[1] * c.pos2[0] < 0) expected = 2 * Math.PI - expected;
    expectClose(s.transferAngle, expected, 1e-12);
  });

  it('returns the multi-revolution solutions in order of increasing transfer angle', () => {
    const c = cases.find((x) => x.label === 'kerbin-moho multi-rev')!;
    const angles = lambert(c.mu, c.pos1, c.pos2, c.dt, c.maxRevs, c.prograde).map((s) => s.transferAngle);
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
  });
});
