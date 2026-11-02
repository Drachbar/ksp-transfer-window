// Helpers for tests that compare the TypeScript port with reference results
// recorded from the original JavaScript (see scripts/generate-legacy-fixtures.mjs).

/** The fixtures encode non-finite numbers as strings; turn them back into numbers. */
export function decode<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), (_key, v) =>
    v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v,
  ) as T;
}

/** Default relative tolerance: the port performs the same operations, so results should match closely. */
export const REL_TOL = 1e-9;

/**
 * Asserts that `actual` equals `expected` within a relative tolerance
 * (with an absolute floor for values near zero). Works on numbers and
 * (nested) arrays of numbers. NaN only matches NaN.
 */
export function expectClose(actual: unknown, expected: unknown, relTol = REL_TOL, absTol = 1e-9, path = 'value'): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} should be an array`).toBe(true);
    const a = actual as unknown[];
    expect(a.length, `${path}.length`).toBe(expected.length);
    expected.forEach((e, i) => expectClose(a[i], e, relTol, absTol, `${path}[${i}]`));
    return;
  }
  if (expected === null || expected === undefined) {
    expect(actual ?? null, path).toBeNull();
    return;
  }
  const e = expected as number;
  const a = actual as number;
  if (Number.isNaN(e)) {
    expect(Number.isNaN(a), `${path}: expected NaN, got ${a}`).toBe(true);
    return;
  }
  if (!Number.isFinite(e)) {
    expect(a, path).toBe(e);
    return;
  }
  const tolerance = Math.max(absTol, Math.abs(e) * relTol);
  expect(Math.abs(a - e), `${path}: expected ${e}, got ${a}`).toBeLessThanOrEqual(tolerance);
}
