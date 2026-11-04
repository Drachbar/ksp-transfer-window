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

/** One handle of a manoeuvre node to pull, with the axis it lies on (for the navball colours). */
export interface BurnPart {
  text: string;
  axis: 'prograde' | 'normal';
}

/** The handles to pull, leaving out any that round to zero. */
export function burnParts(prograde: number, normal: number): BurnPart[] {
  const part = (v: number, axis: BurnPart['axis'], positive: string, negative: string): BurnPart | null => {
    const rounded = Math.round(v);
    return rounded === 0 ? null : { text: `${integer.format(Math.abs(rounded))} m/s ${rounded > 0 ? positive : negative}`, axis };
  };
  return [part(prograde, 'prograde', 'prograde', 'retrograde'), part(normal, 'normal', 'normal', 'anti-normal')].filter((p) => p !== null);
}

/** "1,027 m/s prograde and 205 m/s anti-normal": the manoeuvre node handles to pull. */
export function describeBurn(prograde: number, normal: number): string {
  return burnParts(prograde, normal)
    .map((p) => p.text)
    .join(' and ');
}

const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** "2,863.3 km", or "15 Gm" from a billion metres up. */
export function formatDistance(metres: number): string {
  return metres >= 1e9 ? `${oneDecimal.format(metres / 1e9)} Gm` : `${oneDecimal.format(metres / 1e3)} km`;
}
