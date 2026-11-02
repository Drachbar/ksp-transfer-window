import { add, angleInPlane, cross, dot, norm, normalize, projectToPlane, scale, sub } from './vector';
import { expectClose } from '../../testing/legacy-fixtures';

describe('vector', () => {
  it('adds, subtracts and scales', () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([1, 2, 3], [4, 5, 6])).toEqual([-3, -3, -3]);
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
  });

  it('computes dot and cross products', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
  });

  it('computes norm and normalizes', () => {
    expect(norm([3, 4, 12])).toBe(13);
    expectClose(normalize([3, 4, 12]), [3 / 13, 4 / 13, 12 / 13]);
  });

  it('projects a vector onto a plane', () => {
    expect(projectToPlane([1, 2, 3], [0, 0, 1])).toEqual([1, 2, 0]);
  });

  it('measures the angle between two vectors within a plane, in [0, 2π)', () => {
    const z: [number, number, number] = [0, 0, 1];
    expectClose(angleInPlane([1, 0, 0], [0, 1, 0], z), (3 * Math.PI) / 2);
    expectClose(angleInPlane([0, 1, 0], [1, 0, 0], z), Math.PI / 2);
    expectClose(angleInPlane([1, 0, 5], [1, 0, -2], z), 0);
  });
});
