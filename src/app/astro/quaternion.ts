import { dot, normalize, type Vec3 } from './vector';

/** A unit quaternion [x, y, z, w] representing a rotation. */
export type Quaternion = readonly [number, number, number, number];

export const IDENTITY: Quaternion = [0, 0, 0, 1];

// Summation orders mirror numeric.js (used by the original) for bit-exact results.
const normalize4 = (q: Quaternion): Quaternion => {
  const s = Math.sqrt(q[3] * q[3] + q[2] * q[2] + q[1] * q[1] + q[0] * q[0]);
  return [q[0] / s, q[1] / s, q[2] / s, q[3] / s];
};

export const conjugate = (q: Quaternion): Quaternion => [-q[0], -q[1], -q[2], q[3]];

/** Hamilton product q0 · q1 (applies q1 first, then q0). */
export function concat(q0: Quaternion, q1: Quaternion): Quaternion {
  const [x0, y0, z0, w0] = q0;
  const [x1, y1, z1, w1] = q1;
  return [
    w0 * x1 + x0 * w1 + y0 * z1 - z0 * y1,
    w0 * y1 - x0 * z1 + y0 * w1 + z0 * x1,
    w0 * z1 + x0 * y1 - y0 * x1 + z0 * w1,
    w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1,
  ];
}

export function fromAngleAxis(angle: number, axis: Vec3): Quaternion {
  const halfAngle = 0.5 * angle;
  const sin = Math.sin(halfAngle);
  const a = normalize(axis);
  return normalize4([sin * a[0], sin * a[1], sin * a[2], Math.cos(halfAngle)]);
}

/** The shortest rotation that turns the direction of `from` into the direction of `to`. */
export function fromToRotation(from: Vec3, to: Vec3): Quaternion {
  const f = normalize(from);
  const t = normalize(to);
  const d = dot(f, t);
  if (d > 1.0 - 1e-6) return IDENTITY;
  if (d < -(1.0 - 1e-6)) return fromAngleAxis(Math.PI, [0, 0, 1]);
  const s = Math.sqrt(2 * (1 + d));
  const invs = 1 / s;
  return normalize4([
    (f[1] * t[2] - f[2] * t[1]) * invs,
    (f[2] * t[0] - f[0] * t[2]) * invs,
    (f[0] * t[1] - f[1] * t[0]) * invs,
    0.5 * s,
  ]);
}

export function rotate(q: Quaternion, v: Vec3): Vec3 {
  const r = concat(concat(q, [v[0], v[1], v[2], 0]), conjugate(q));
  return [r[0], r[1], r[2]];
}
