// CommNet range: can the satellites talk to each other and to Kerbin?
//
// In KSP 1 the maximum distance between two antennas is sqrt(powerA × powerB)
// times the difficulty's range modifier (1 by default). Power ratings are the
// `antennaPower` values from the stock part files (GameData/Squad/Parts).

import { BODIES, type CelestialBody } from '../astro/bodies';

export interface Antenna {
  name: string;
  /** (m) */
  power: number;
  /** Relay antennas can pass on other vessels' signals. */
  relay: boolean;
}

export const ANTENNAS: Antenna[] = [
  { name: 'Communotron 16', power: 500e3, relay: false },
  { name: 'Communotron 16-S', power: 500e3, relay: false },
  { name: 'HG-5 High Gain Antenna', power: 5e6, relay: true },
  { name: 'Communotron DTS-M1', power: 2e9, relay: false },
  { name: 'RA-2 Relay Antenna', power: 2e9, relay: true },
  { name: 'Communotron HG-55', power: 15e9, relay: false },
  { name: 'RA-15 Relay Antenna', power: 15e9, relay: true },
  { name: 'Communotron 88-88', power: 100e9, relay: false },
  { name: 'RA-100 Relay Antenna', power: 100e9, relay: true },
];

/** Antennas that can relay other vessels' signals: the only useful ones on network satellites. */
export const RELAY_ANTENNAS = ANTENNAS.filter((a) => a.relay);

/** Tracking Station (Deep Space Network) power per upgrade level. Not in the part files; the commonly quoted stock values. */
export const DSN_LEVELS = [
  { name: 'Level 1', power: 2e9 },
  { name: 'Level 2', power: 50e9 },
  { name: 'Level 3', power: 250e9 },
];

export const linkRange = (powerA: number, powerB: number, rangeModifier = 1) => Math.sqrt(powerA * powerB) * rangeModifier;

/** The chain of bodies from `body` up to the root (the Sun), starting with `body`. */
const lineage = (body: CelestialBody) => {
  const chain: CelestialBody[] = [body];
  while (chain.at(-1)!.orbit) chain.push(chain.at(-1)!.orbit!.referenceBody as CelestialBody);
  return chain;
};

/** The largest possible distance between `body` and Kerbin (both at the far sides of their orbits). */
export function maxDistanceToHome(body: CelestialBody): number {
  const ours = lineage(body);
  const home = lineage(BODIES.Kerbin);
  const common = ours.find((b) => home.includes(b))!;
  const reach = (chain: CelestialBody[]) => chain.slice(0, chain.indexOf(common)).reduce((sum, b) => sum + b.orbit!.apoapsis(), 0);
  return reach(ours) + reach(home);
}

export interface Link {
  distance: number;
  range: number;
  ok: boolean;
}

export interface CommsInput {
  body: CelestialBody;
  /** Satellites' orbit, from the centre of the body (m). */
  orbitRadius: number;
  /** Distance between neighbouring satellites (m). */
  spacing: number;
  antenna: Antenna;
  /** Index into DSN_LEVELS. */
  dsnLevel: number;
  rangeModifier?: number;
}

export function commsCheck({ body, orbitRadius, spacing, antenna, dsnLevel, rangeModifier = 1 }: CommsInput): { neighbours: Link; home: Link } {
  const link = (distance: number, range: number): Link => ({ distance, range, ok: range >= distance });
  // Worst case home: the satellite on the far side of its body, the body as far from Kerbin as it gets
  // (around Kerbin itself: the far side of Kerbin from the Tracking Station).
  const homeDistance = body === BODIES.Kerbin ? orbitRadius + body.radius : maxDistanceToHome(body) + orbitRadius;
  return {
    neighbours: link(spacing, linkRange(antenna.power, antenna.power, rangeModifier)),
    home: link(homeDistance, linkRange(antenna.power, DSN_LEVELS[dsnLevel].power, rangeModifier)),
  };
}
