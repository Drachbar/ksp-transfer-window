// Root finding and minimisation, ported from the original roots.coffee.

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/** Half the distance from 1.0 to the next larger double (2^-53), as computed by the original. */
export const MACHINE_EPSILON = (() => {
  let eps = 1.0;
  while (1.0 + eps !== 1.0) eps *= 0.5;
  return eps;
})();

type Fn = (x: number) => number;

const sign = (x: number): number => (x ? (x < 0 ? -1 : 1) : x === x ? 0 : NaN);

/** Finds the root of f(x) near x0 given df(x) = f'(x). */
export function newtonsMethod(x0: number, f: Fn, df: Fn): number {
  for (;;) {
    const x = x0 - f(x0) / df(x0);
    if (Number.isNaN(x) || Math.abs(x - x0) < 1e-6) return x;
    x0 = x;
  }
}

/** Finds a root of f(x) between a and b. Returns NaN if [a, b] does not bracket a root. */
export function brentsMethod(a: number, b: number, relativeAccuracy: number, f: Fn, fa = f(a), fb = f(b)): number {
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  relativeAccuracy += 0.5 * MACHINE_EPSILON;

  if (Number.isNaN(fa) || Number.isNaN(fb)) return NaN;
  if (sign(fa) === sign(fb)) return NaN;

  for (let i = 0; ; i++) {
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }

    const tol = relativeAccuracy * Math.abs(b);
    const m = 0.5 * (c - b);

    if (fb === 0 || Math.abs(m) <= tol) return b;
    if (i > 100) throw new Error("Brent's method failed to converge after 100 iterations");

    if (Math.abs(e) < tol || Math.abs(fa) <= Math.abs(fb)) {
      // Bisection step
      d = e = m;
    } else {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        // Linear interpolation step
        p = 2 * m * s;
        q = 1 - s;
      } else {
        // Inverse quadratic interpolation step
        q = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s - 1);
      }

      if (p > 0) q = -q;
      else p = -p;

      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = e = m;
      }
    }

    a = b;
    fa = fb;

    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;

    fb = f(b);
    if (Number.isNaN(fb)) return NaN;

    if ((fb < 0 && fc < 0) || (fb > 0 && fc > 0)) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
  }
}

/** Finds the x that minimises f(x) between x1 and x2. See https://en.wikipedia.org/wiki/Golden-section_search */
export function goldenSectionSearch(x1: number, x2: number, epsilon: number, f: Fn): number {
  const k = 2 - GOLDEN_RATIO;
  let x3 = x2;
  x2 = x1 + k * (x3 - x1);
  let y2 = f(x2);

  for (;;) {
    const x = x3 - x2 > x2 - x1 ? x2 + k * (x3 - x2) : x2 - k * (x2 - x1);

    if (x3 - x1 < epsilon * (x2 + x)) return (x3 + x1) / 2;

    const y = f(x);
    if (y < y2) {
      if (x3 - x2 > x2 - x1) x1 = x2;
      else x3 = x2;
      x2 = x;
      y2 = y;
    } else if (x3 - x2 > x2 - x1) {
      x3 = x;
    } else {
      x1 = x;
    }
  }
}
