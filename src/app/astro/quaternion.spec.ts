import { concat, conjugate, fromAngleAxis, fromToRotation, IDENTITY, rotate } from './quaternion';
import { expectClose } from '../../testing/legacy-fixtures';
import type { Vec3 } from './vector';

describe('quaternion', () => {
  it('rotates a vector about an axis', () => {
    const q = fromAngleAxis(Math.PI / 2, [0, 0, 1]);
    expectClose(rotate(q, [1, 0, 0]), [0, 1, 0]);
    expectClose(rotate(q, [0, 0, 1]), [0, 0, 1]);
  });

  it('normalizes the axis', () => {
    const q = fromAngleAxis(Math.PI, [0, 0, 5]);
    expectClose(rotate(q, [1, 0, 0]), [-1, 0, 0]);
  });

  it('conjugate undoes the rotation', () => {
    const q = fromAngleAxis(0.7, [1, 2, 3]);
    const v: Vec3 = [4, -5, 6];
    expectClose(rotate(conjugate(q), rotate(q, v)), v);
  });

  it('concat composes rotations (q0 after q1)', () => {
    const q0 = fromAngleAxis(Math.PI / 2, [0, 0, 1]);
    const q1 = fromAngleAxis(Math.PI / 2, [1, 0, 0]);
    const v: Vec3 = [0, 1, 0];
    expectClose(rotate(concat(q0, q1), v), rotate(q0, rotate(q1, v)));
  });

  describe('fromToRotation', () => {
    it('rotates "from" onto "to"', () => {
      const from: Vec3 = [1, 2, 3];
      const to: Vec3 = [-3, 0.5, 2];
      const q = fromToRotation(from, to);
      const n = Math.hypot(...to) / Math.hypot(...from);
      expectClose(rotate(q, from).map((c) => c * n), to);
    });

    it('returns the identity for parallel vectors', () => {
      expect(fromToRotation([0, 0, 2], [0, 0, 1])).toEqual(IDENTITY);
    });

    it('rotates 180° about z for opposite vectors', () => {
      expectClose(fromToRotation([0, 0, 1], [0, 0, -1]), fromAngleAxis(Math.PI, [0, 0, 1]));
    });
  });
});
