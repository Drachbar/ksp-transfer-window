// Derivative-free minimisation.

export interface NelderMeadOptions {
  /** Stop when the spread of function values in the simplex is below this. */
  tolerance?: number;
  maxIterations?: number;
}

export interface Minimum {
  x: number[];
  fx: number;
}

/**
 * Nelder–Mead simplex minimisation of f starting at x0 with initial step
 * sizes `step`. Infinite or NaN values act as hard constraints.
 */
export function nelderMead(
  f: (x: readonly number[]) => number,
  x0: readonly number[],
  step: readonly number[],
  { tolerance = 1e-10, maxIterations = 500 }: NelderMeadOptions = {},
): Minimum {
  const n = x0.length;
  const value = (x: number[]) => {
    const v = f(x);
    return Number.isNaN(v) ? Infinity : v;
  };

  let simplex: Minimum[] = [{ x: [...x0], fx: value([...x0]) }];
  for (let i = 0; i < n; i++) {
    const x = [...x0];
    x[i] += step[i];
    simplex.push({ x, fx: value(x) });
  }

  const combine = (a: number[], b: number[], t: number) => a.map((ai, i) => ai + t * (b[i] - ai));

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    simplex.sort((a, b) => a.fx - b.fx);
    const best = simplex[0];
    const worst = simplex[n];
    if (Number.isFinite(worst.fx) && Math.abs(worst.fx - best.fx) <= tolerance * (Math.abs(best.fx) + tolerance)) break;

    // Centroid of all but the worst point
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) centroid[k] += simplex[i].x[k] / n;

    const reflected = combine(centroid, worst.x, -1);
    const fr = value(reflected);
    if (fr < best.fx) {
      const expanded = combine(centroid, worst.x, -2);
      const fe = value(expanded);
      simplex[n] = fe < fr ? { x: expanded, fx: fe } : { x: reflected, fx: fr };
    } else if (fr < simplex[n - 1].fx) {
      simplex[n] = { x: reflected, fx: fr };
    } else {
      const contracted = fr < worst.fx ? combine(centroid, reflected, 0.5) : combine(centroid, worst.x, 0.5);
      const fc = value(contracted);
      if (fc < Math.min(fr, worst.fx)) {
        simplex[n] = { x: contracted, fx: fc };
      } else {
        // Shrink towards the best point
        simplex = simplex.map((p, i) => {
          if (i === 0) return p;
          const x = combine(best.x, p.x, 0.5);
          return { x, fx: value(x) };
        });
      }
    }
  }

  simplex.sort((a, b) => a.fx - b.fx);
  return simplex[0];
}
