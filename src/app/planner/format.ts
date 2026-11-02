// Number formatting for the UI.

const MINUS = '−';
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const isNumber = (v: number | undefined | null): v is number => typeof v === 'number' && Number.isFinite(v);

/** "1,047 m/s" */
export function formatDeltaV(v: number | undefined | null): string {
  return isNumber(v) ? `${integer.format(Math.round(v)).replace('-', MINUS)} m/s` : '–';
}

/** "+1,027 m/s", "−334 m/s", "0 m/s" */
export function formatSignedDeltaV(v: number | undefined | null): string {
  if (!isNumber(v)) return '–';
  const rounded = Math.round(v);
  if (rounded === 0) return '0 m/s';
  return `${rounded > 0 ? '+' : MINUS}${integer.format(Math.abs(rounded))} m/s`;
}

/** Radians to "130°" (or with the given number of decimals). */
export function formatAngle(radians: number | undefined | null, decimals = 0): string {
  if (!isNumber(radians)) return '–';
  const degrees = Number(((radians * 180) / Math.PI).toFixed(decimals));
  return `${degrees < 0 ? MINUS : ''}${Math.abs(degrees).toFixed(decimals)}°`;
}
