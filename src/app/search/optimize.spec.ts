import { nelderMead } from './optimize';

describe('nelderMead', () => {
  it('finds the minimum of a quadratic bowl', () => {
    const { x, fx } = nelderMead(([a, b]) => (a - 3) ** 2 + 2 * (b + 1) ** 2 + 5, [0, 0], [1, 1]);
    expect(x[0]).toBeCloseTo(3, 4);
    expect(x[1]).toBeCloseTo(-1, 4);
    expect(fx).toBeCloseTo(5, 8);
  });

  it('finds the minimum of the Rosenbrock function', () => {
    const { x } = nelderMead(([a, b]) => (1 - a) ** 2 + 100 * (b - a * a) ** 2, [-1.2, 1], [0.5, 0.5], { maxIterations: 2000, tolerance: 1e-12 });
    expect(x[0]).toBeCloseTo(1, 3);
    expect(x[1]).toBeCloseTo(1, 3);
  });

  it('stays out of regions where the objective is infinite (constraints)', () => {
    // Unconstrained minimum at a = -2, but a < 0 is forbidden.
    const { x } = nelderMead(([a, b]) => (a < 0 ? Infinity : (a + 2) ** 2 + b * b), [1, 1], [0.5, 0.5]);
    expect(x[0]).toBeGreaterThanOrEqual(0);
    expect(x[0]).toBeCloseTo(0, 3);
    expect(x[1]).toBeCloseTo(0, 3);
  });

  it('treats NaN as infinitely bad', () => {
    const { x, fx } = nelderMead(([a, b]) => (a > 2 ? NaN : (a - 1) ** 2 + (b - 1) ** 2), [0, 0], [1, 1]);
    expect(Number.isFinite(fx)).toBe(true);
    expect(x[0]).toBeCloseTo(1, 3);
  });

  it('never returns a worse point than the start', () => {
    const f = ([a, b]: readonly number[]) => Math.abs(a) + Math.abs(b);
    const { fx } = nelderMead(f, [0.3, -0.2], [10, 10], { maxIterations: 3 });
    expect(fx).toBeLessThanOrEqual(f([0.3, -0.2]));
  });
});
