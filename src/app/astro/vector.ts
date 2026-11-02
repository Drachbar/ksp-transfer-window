import { fromToRotation, rotate } from './quaternion';

/** A 3D vector. Positions are in metres, velocities in m/s. */
export type Vec3 = readonly [number, number, number];

export const TWO_PI = 2 * Math.PI;
export const HALF_PI = 0.5 * Math.PI;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

/** Divides each component by s (not the same as scaling by 1/s in the last bit). */
export const div = (v: Vec3, s: number): Vec3 => [v[0] / s, v[1] / s, v[2] / s];

// The summation order below mirrors numeric.js (used by the original), so the
// port reproduces the original's results to the last bit.

export const dot = (a: Vec3, b: Vec3): number => a[2] * b[2] + (a[1] * b[1] + a[0] * b[0]);

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const normSquared = (v: Vec3): number => v[2] * v[2] + v[1] * v[1] + v[0] * v[0];

export const norm = (v: Vec3): number => Math.sqrt(normSquared(v));

export const normalize = (v: Vec3): Vec3 => div(v, norm(v));

/** Removes the component of `p` along the unit normal `n`. */
export const projectToPlane = (p: Vec3, n: Vec3): Vec3 => sub(p, scale(n, dot(p, n)));

/**
 * The angle from `to` to `from`, measured in the plane with the given normal,
 * in the range [0, 2π).
 */
export function angleInPlane(from: Vec3, to: Vec3, normal: Vec3): number {
  const rot = fromToRotation(normal, [0, 0, 1]);
  const f = rotate(rot, normalize(projectToPlane(from, normal)));
  const t = rotate(rot, normalize(projectToPlane(to, normal)));
  const result = Math.atan2(f[1], f[0]) - Math.atan2(t[1], t[0]);
  return result < 0 ? result + TWO_PI : result;
}

/** Sign of x: -1, 0 or 1 (NaN for NaN). */
export function sign(x: number): number {
  if (x) return x < 0 ? -1 : 1;
  return x === x ? 0 : NaN;
}
