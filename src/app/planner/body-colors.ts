/** Each body's colour, roughly as it looks in the map view. */
const FILLS: Record<string, string> = {
  Kerbol: '#ffc23d',
  Moho: '#8a6550',
  Eve: '#7b3fa8',
  Gilly: '#a08c76',
  Kerbin: '#2f6eb0',
  Mun: '#8f9296',
  Minmus: '#96d6c0',
  Duna: '#b5502b',
  Ike: '#6c6f73',
  Dres: '#8c8077',
  Jool: '#5c9b2d',
  Laythe: '#2c5c96',
  Vall: '#a9c2d4',
  Tylo: '#c8beb0',
  Bop: '#7a6352',
  Pol: '#d3c487',
  Eeloo: '#dde3e6',
};

const UNKNOWN = '#8a8f94';
const LIGHT_INK = '#ffffff';
const DARK_INK = '#12161a';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The body's colour, and a colour for its name written on it. */
export function bodyColor(name: string): { fill: string; ink: string } {
  const fill = FILLS[name] ?? UNKNOWN;
  const ink = contrastRatio(fill, LIGHT_INK) >= contrastRatio(fill, DARK_INK) ? LIGHT_INK : DARK_INK;
  return { fill, ink };
}
