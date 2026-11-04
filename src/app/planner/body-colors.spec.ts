import { BODY_NAMES } from '../astro/bodies';
import { bodyColor, contrastRatio } from './body-colors';

describe('contrastRatio', () => {
  it('follows WCAG: black on white is 21, a colour on itself is 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#7b3fa8', '#7b3fa8')).toBe(1);
  });
});

describe('bodyColor', () => {
  it('gives every body its own colour, as in the map view', () => {
    const fills = BODY_NAMES.map((name) => bodyColor(name).fill);
    expect(new Set(fills).size).toBe(BODY_NAMES.length);
    expect(bodyColor('Duna').fill).not.toBe(bodyColor('Eve').fill);
  });

  it('labels each body in a colour readable on it', () => {
    for (const name of BODY_NAMES) {
      const { fill, ink } = bodyColor(name);
      expect(contrastRatio(fill, ink), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to grey for an unknown body', () => {
    expect(bodyColor('Nowhere').fill).toMatch(/^#[0-9a-f]{6}$/);
  });
});
