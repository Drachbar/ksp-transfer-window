import { ANTENNAS, commsCheck, DSN_LEVELS, linkRange, maxDistanceToHome } from './comms';
import { BODIES } from '../astro/bodies';

describe('antennas', () => {
  it('has the stock antennas with the power ratings from the game’s part files', () => {
    const power = Object.fromEntries(ANTENNAS.map((a) => [a.name, a.power]));
    expect(power).toEqual({
      'Communotron 16': 500e3,
      'Communotron 16-S': 500e3,
      'HG-5 High Gain Antenna': 5e6,
      'Communotron DTS-M1': 2e9,
      'RA-2 Relay Antenna': 2e9,
      'Communotron HG-55': 15e9,
      'RA-15 Relay Antenna': 15e9,
      'Communotron 88-88': 100e9,
      'RA-100 Relay Antenna': 100e9,
    });
    expect(ANTENNAS.filter((a) => a.relay).map((a) => a.name)).toEqual(['HG-5 High Gain Antenna', 'RA-2 Relay Antenna', 'RA-15 Relay Antenna', 'RA-100 Relay Antenna']);
  });

  it('has the three Tracking Station levels', () => {
    expect(DSN_LEVELS.map((l) => l.power)).toEqual([2e9, 50e9, 250e9]);
  });
});

describe('linkRange', () => {
  it('is the geometric mean of the two antennas’ power, times the difficulty modifier', () => {
    expect(linkRange(500e3, 500e3)).toBeCloseTo(500e3, 6);
    expect(linkRange(5e6, 2e9)).toBeCloseTo(Math.sqrt(5e6 * 2e9), 3);
    expect(linkRange(5e6, 5e6, 0.5)).toBeCloseTo(2.5e6, 3);
  });
});

describe('maxDistanceToHome', () => {
  it('is zero around Kerbin itself', () => {
    expect(maxDistanceToHome(BODIES.Kerbin)).toBe(0);
  });

  it('is the far side of a Kerbin moon’s orbit', () => {
    expect(maxDistanceToHome(BODIES.Mun)).toBeCloseTo(BODIES.Mun.orbit!.apoapsis(), 3);
  });

  it('is both orbits’ far sides for another planet', () => {
    expect(maxDistanceToHome(BODIES.Duna)).toBeCloseTo(BODIES.Duna.orbit!.apoapsis() + BODIES.Kerbin.orbit!.apoapsis(), 3);
  });

  it('adds the moon’s orbit for a moon of another planet', () => {
    expect(maxDistanceToHome(BODIES.Laythe)).toBeCloseTo(
      BODIES.Laythe.orbit!.apoapsis() + BODIES.Jool.orbit!.apoapsis() + BODIES.Kerbin.orbit!.apoapsis(),
      3,
    );
  });
});

describe('commsCheck', () => {
  const hg5 = ANTENNAS.find((a) => a.name === 'HG-5 High Gain Antenna')!;
  const ra2 = ANTENNAS.find((a) => a.name === 'RA-2 Relay Antenna')!;

  it('checks the link between neighbouring satellites', () => {
    const check = commsCheck({ body: BODIES.Kerbin, orbitRadius: 3.46e6, spacing: 4e6, antenna: hg5, dsnLevel: 0 });
    expect(check.neighbours).toEqual({ distance: 4e6, range: 5e6, ok: true });
    expect(commsCheck({ body: BODIES.Kerbin, orbitRadius: 3.46e6, spacing: 6e6, antenna: hg5, dsnLevel: 0 }).neighbours.ok).toBe(false);
  });

  it('checks the link home to the Tracking Station, at the worst moment', () => {
    const atKerbin = commsCheck({ body: BODIES.Kerbin, orbitRadius: 3.46e6, spacing: 4e6, antenna: hg5, dsnLevel: 0 });
    expect(atKerbin.home.distance).toBeCloseTo(3.46e6 + BODIES.Kerbin.radius, 3);
    expect(atKerbin.home.range).toBeCloseTo(Math.sqrt(5e6 * 2e9), 3);
    expect(atKerbin.home.ok).toBe(true);

    const atJool = commsCheck({ body: BODIES.Jool, orbitRadius: 3e7, spacing: 4e7, antenna: ra2, dsnLevel: 2 });
    expect(atJool.home.distance).toBeCloseTo(maxDistanceToHome(BODIES.Jool) + 3e7, 3);
    expect(atJool.home.ok).toBe(atJool.home.range >= atJool.home.distance);
  });
});
