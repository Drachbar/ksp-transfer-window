import { brentsMethod, goldenSectionSearch, MACHINE_EPSILON, newtonsMethod } from './roots';
import { decode, expectClose } from '../../testing/legacy-fixtures';
import fixture from '../../testing/legacy/roots.json';

interface RootCase {
  method: 'brentsMethod' | 'goldenSectionSearch';
  fn: string;
  a: number;
  b: number;
  relativeAccuracy?: number;
  epsilon?: number;
  result: number;
}

const functions: Record<string, (x: number) => number> = {
  cubic: (x) => x * x * x - 2 * x - 5,
  cos: (x) => Math.cos(x) - x,
  exp: (x) => Math.exp(x) - 3,
  parabola: (x) => (x - 1.234) * (x - 1.234) + 2,
  sinus: (x) => Math.sin(x),
};

describe('roots', () => {
  const { machineEpsilon, cases } = decode<{ machineEpsilon: number; cases: RootCase[] }>(fixture);

  it('has the same machine epsilon as the original', () => {
    expect(MACHINE_EPSILON).toBe(machineEpsilon);
  });

  for (const c of cases) {
    it(`${c.method} matches the original for ${c.fn}`, () => {
      const f = functions[c.fn];
      const result =
        c.method === 'brentsMethod'
          ? brentsMethod(c.a, c.b, c.relativeAccuracy!, f)
          : goldenSectionSearch(c.a, c.b, c.epsilon!, f);
      expectClose(result, c.result, 1e-12);
    });
  }

  it('brentsMethod returns NaN when the interval does not bracket a root', () => {
    expect(brentsMethod(3, 4, 1e-6, (x) => x * x + 1)).toBeNaN();
  });

  it('brentsMethod returns NaN when f is NaN at an endpoint', () => {
    expect(brentsMethod(-1, 1, 1e-6, (x) => Math.sqrt(x))).toBeNaN();
  });

  it('newtonsMethod finds a square root', () => {
    expectClose(newtonsMethod(1, (x) => x * x - 2, (x) => 2 * x), Math.SQRT2, 1e-6);
  });
});
