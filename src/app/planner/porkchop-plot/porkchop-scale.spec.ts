import { axisTicks, cellAt, colorAt, deltaVScale, paint, RAMPS, scalePosition, type Rgb } from './porkchop-scale';
import type { PorkchopResult } from '../../search/window-search-protocol';

const grid = (width: number, height: number, values: number[]): PorkchopResult => ({
  earliestDeparture: 1000,
  departureSpan: 900,
  shortestTimeOfFlight: 50,
  timeOfFlightSpan: 300,
  width,
  height,
  deltaVs: new Float64Array(values),
  minDeltaV: Math.min(...values.filter(Number.isFinite)),
  minIndex: values.indexOf(Math.min(...values.filter(Number.isFinite))),
});

describe('deltaVScale', () => {
  it('runs from the cheapest transfer to the most expensive one', () => {
    expect(deltaVScale(new Float64Array([1000, 2000, NaN, 1500]))).toEqual({ min: 1000, max: 2000 });
  });

  it('clips far outliers at two standard deviations above the mean (in log space), like the original', () => {
    const values = [...Array.from({ length: 99 }, (_, i) => 1000 + i), 1e7];
    const { min, max } = deltaVScale(new Float64Array(values));
    expect(min).toBe(1000);
    expect(max).toBeLessThan(1e7);
    expect(max).toBeGreaterThan(1098);
  });

  it('never stretches beyond three times the cheapest transfer, so the windows stand out', () => {
    expect(deltaVScale(new Float64Array([1000, 1200, 1500, 9000, 9500, 9800])).max).toBe(3000);
  });

  it('copes with a grid without valid transfers', () => {
    expect(deltaVScale(new Float64Array([NaN, NaN]))).toEqual({ min: NaN, max: NaN });
  });
});

describe('scalePosition', () => {
  const scale = { min: 1000, max: 4000 };
  it('maps Δv logarithmically to 0 (cheapest) … 1 (most expensive)', () => {
    expect(scalePosition(1000, scale)).toBe(0);
    expect(scalePosition(4000, scale)).toBe(1);
    expect(scalePosition(2000, scale)).toBeCloseTo(0.5, 10);
  });

  it('clamps values outside the scale', () => {
    expect(scalePosition(9000, scale)).toBe(1);
    expect(scalePosition(500, scale)).toBe(0);
  });

  it('returns 0 for a degenerate scale', () => {
    expect(scalePosition(1000, { min: 1000, max: 1000 })).toBe(0);
  });
});

describe('colorAt', () => {
  it('interpolates along the ramp, cheap end first', () => {
    const ramp = ['#000000', '#ffffff'];
    expect(colorAt(0, ramp)).toEqual<Rgb>([0, 0, 0]);
    expect(colorAt(1, ramp)).toEqual<Rgb>([255, 255, 255]);
    expect(colorAt(0.5, ramp)).toEqual<Rgb>([128, 128, 128]);
  });

  it('makes cheap transfers stand out from the background in both themes', () => {
    // Light theme: cheap is dark; dark theme: cheap is light.
    const lum = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(lum(colorAt(0, RAMPS.light.ramp))).toBeLessThan(lum(colorAt(1, RAMPS.light.ramp)));
    expect(lum(colorAt(0, RAMPS.dark.ramp))).toBeGreaterThan(lum(colorAt(1, RAMPS.dark.ramp)));
  });
});

describe('paint', () => {
  it('fills RGBA pixels with the shortest time of flight at the bottom, impossible cells in the neutral colour', () => {
    // 2 × 2 grid: row 0 = shortest flight time
    const g = grid(2, 2, [1000, NaN, 2000, 4000]);
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    const theme = { ramp: ['#000000', '#ffffff'], impossible: '#ff0000' };
    paint(g, { min: 1000, max: 4000 }, theme, pixels);
    const px = (x: number, y: number) => Array.from(pixels.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
    expect(px(0, 1)).toEqual([0, 0, 0, 255]); // bottom-left: 1000 m/s, cheapest
    expect(px(1, 1)).toEqual([255, 0, 0, 255]); // bottom-right: impossible
    expect(px(0, 0)).toEqual([128, 128, 128, 255]); // top-left: 2000 m/s, halfway in log space
    expect(px(1, 0)).toEqual([255, 255, 255, 255]); // top-right: 4000 m/s
  });
});

describe('cellAt', () => {
  const g = grid(3, 2, [10, 11, 12, 20, 21, 22]);

  it('finds the cell under a point given as fractions of the plot (y from the top)', () => {
    expect(cellAt(g, 0.1, 0.9)).toMatchObject({ i: 0, j: 0, deltaV: 10 });
    expect(cellAt(g, 0.99, 0.01)).toMatchObject({ i: 2, j: 1, deltaV: 22 });
  });

  it('gives the departure time and time of flight of the cell', () => {
    const c = cellAt(g, 0.5, 0.2)!;
    expect(c).toMatchObject({ i: 1, j: 1 });
    expect(c.departureTime).toBe(1000 + 450); // the middle column of 0, 450, 900
    expect(c.timeOfFlight).toBe(50 + 300);
  });

  it('returns null outside the plot', () => {
    expect(cellAt(g, -0.1, 0.5)).toBeNull();
    expect(cellAt(g, 0.5, 1.1)).toBeNull();
  });
});

describe('axisTicks', () => {
  it('spreads ticks evenly over the range, as fractions and values', () => {
    expect(axisTicks(100, 400, 5)).toEqual([
      { at: 0, value: 100 },
      { at: 0.25, value: 200 },
      { at: 0.5, value: 300 },
      { at: 0.75, value: 400 },
      { at: 1, value: 500 },
    ]);
  });
});
