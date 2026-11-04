// Colour scale and geometry for the porkchop plot (pure functions, no DOM).
//
// One hue (blue), light → dark: a sequential scale for a single magnitude. The
// cheap end gets the most contrast against the background so the windows stand
// out; expensive transfers recede towards the surface.

import { departureTimeAt, timeOfFlightAt } from '../../search/porkchop';
import type { PorkchopResult } from '../../search/window-search-protocol';

export type Rgb = [number, number, number];

export interface DeltaVScale {
  min: number;
  max: number;
}

export interface PlotTheme {
  /** Colours from cheapest to most expensive. */
  ramp: string[];
  /** Colour for cells without a valid transfer. */
  impossible: string;
}

/** Blue ramp, steps 100 → 700. */
const BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

export const RAMPS: Record<'light' | 'dark', PlotTheme> = {
  light: { ramp: [...BLUE].reverse(), impossible: '#dcd9d1' },
  dark: { ramp: BLUE, impossible: '#20262a' },
};

/** The scale never reaches beyond this multiple of the cheapest transfer. */
const MAX_OVER_MIN = 3;

/**
 * From the cheapest valid transfer up to the most expensive one, clipped at two
 * standard deviations above the mean of log(Δv) (as in the original planner)
 * and at three times the cheapest, so the windows stand out instead of being
 * washed out by absurdly expensive transfers.
 */
export function deltaVScale(deltaVs: Float64Array): DeltaVScale {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (const dv of deltaVs) {
    if (!Number.isFinite(dv)) continue;
    const l = Math.log(dv);
    min = Math.min(min, dv);
    max = Math.max(max, dv);
    sum += l;
    sumSq += l * l;
    n++;
  }
  if (n === 0) return { min: NaN, max: NaN };
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return { min, max: Math.min(max, Math.exp(mean + 2 * sd), MAX_OVER_MIN * min) };
}

/** Where a Δv falls on the scale: 0 = cheapest … 1 = most expensive (logarithmic, clamped). */
export function scalePosition(deltaV: number, { min, max }: DeltaVScale): number {
  if (!(max > min)) return 0;
  const t = (Math.log(deltaV) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.min(1, Math.max(0, t));
}

const parseHex = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** Colour at position t (0 … 1) along the ramp. */
export function colorAt(t: number, ramp: string[]): Rgb {
  const x = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const k = Math.min(Math.floor(x), ramp.length - 2);
  const f = x - k;
  const a = parseHex(ramp[k]);
  const b = parseHex(ramp[k + 1]);
  return [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * f)) as Rgb;
}

/** Writes the grid into RGBA pixels (width × height), shortest time of flight at the bottom. */
export function paint(grid: PorkchopResult, scale: DeltaVScale, theme: PlotTheme, pixels: Uint8ClampedArray): void {
  const { width, height, deltaVs } = grid;
  const impossible = parseHex(theme.impossible);
  for (let j = 0; j < height; j++) {
    const y = height - 1 - j;
    for (let i = 0; i < width; i++) {
      const dv = deltaVs[j * width + i];
      const [r, g, b] = Number.isFinite(dv) ? colorAt(scalePosition(dv, scale), theme.ramp) : impossible;
      const p = (y * width + i) * 4;
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }
}

export interface Cell {
  i: number;
  j: number;
  departureTime: number;
  timeOfFlight: number;
  deltaV: number;
}

/** The cell under a point given as fractions of the plot area (x from the left, y from the top). */
export function cellAt(grid: PorkchopResult, fx: number, fy: number): Cell | null {
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
  const i = Math.min(grid.width - 1, Math.floor(fx * grid.width));
  const j = Math.min(grid.height - 1, Math.floor((1 - fy) * grid.height));
  return {
    i,
    j,
    departureTime: departureTimeAt(grid, i),
    timeOfFlight: timeOfFlightAt(grid, j),
    deltaV: grid.deltaVs[j * grid.width + i],
  };
}

/** Evenly spaced ticks: `at` is the fraction along the axis, `value` the value there. */
export function axisTicks(start: number, span: number, count: number): { at: number; value: number }[] {
  return Array.from({ length: count }, (_, k) => {
    const at = k / (count - 1);
    return { at, value: start + at * span };
  });
}
