import { missionBudget, surfaceDeltaV } from './budget';
import { BODIES } from '../astro/bodies';
import { DEFAULT_MISSION, type Mission } from './mission';
import { periapsisRaiseAfterAerocapture } from './aerobraking';
import { sampleResult } from '../../testing/sample-windows';

describe('surfaceDeltaV', () => {
  it('computes landing on an airless body: deorbit, then kill the speed at the surface, plus 5 % for gravity', () => {
    const mun = BODIES.Mun;
    const mu = mun.gravitationalParameter;
    const r = mun.radius + 100e3;
    const a = (r + mun.radius) / 2;
    const deorbit = Math.sqrt(mu / r) - Math.sqrt(mu * (2 / r - 1 / a));
    const touchdown = Math.sqrt(mu * (2 / mun.radius - 1 / a));
    const s = surfaceDeltaV(mun, 100e3)!;
    expect(s.landing).toBeCloseTo((deorbit + touchdown) * 1.05, 6);
    expect(s.ascent).toBeCloseTo(s.landing, 6);
    expect(s.approximate).toBe(true);
  });

  it('is cheaper from a lower orbit', () => {
    expect(surfaceDeltaV(BODIES.Minmus, 20e3)!.landing).toBeLessThan(surfaceDeltaV(BODIES.Minmus, 100e3)!.landing);
  });

  it('uses typical values for bodies with an atmosphere, landing on parachutes', () => {
    expect(surfaceDeltaV(BODIES.Kerbin, 100e3)).toMatchObject({ ascent: 3400, landing: 0, approximate: true });
    expect(surfaceDeltaV(BODIES.Eve, 100e3)!.ascent).toBe(8000);
    expect(surfaceDeltaV(BODIES.Duna, 100e3)!.ascent).toBe(1450);
    expect(surfaceDeltaV(BODIES.Duna, 100e3)!.landing).toBeGreaterThan(0); // thin air: parachutes are not enough
    expect(surfaceDeltaV(BODIES.Laythe, 100e3)!.ascent).toBe(3200);
  });

  it('has nothing to land on at Jool or the Sun', () => {
    expect(surfaceDeltaV(BODIES.Jool, 100e3)).toBeNull();
    expect(surfaceDeltaV(BODIES.Kerbol, 100e3)).toBeNull();
  });
});

describe('missionBudget', () => {
  const [outbound, homeward] = sampleResult().windows; // stand-ins for Kerbin → Duna and back
  const legs = (b: ReturnType<typeof missionBudget>) => b.rows.map((r) => r.label);
  const everything = { launch: true, land: true, comeBack: true };

  it('adds up the whole mission', () => {
    const b = missionBudget(DEFAULT_MISSION, outbound, homeward, everything);
    expect(legs(b)).toEqual([
      'Launch from Kerbin to a 100 km orbit',
      'Ejection burn',
      'Capture at Duna',
      'Landing on Duna',
      'Ascent from Duna',
      'Return to Kerbin',
      'Landing on Kerbin',
    ]);
    expect(b.total).toBeCloseTo(b.rows.reduce((sum, r) => sum + r.deltaV, 0), 6);
    expect(b.approximate).toBe(true);
    expect(b.rows[1].deltaV).toBeCloseTo(outbound.transfer.ejectionDeltaV + outbound.transfer.planeChangeDeltaV, 6);
    expect(b.rows[2].deltaV).toBeCloseTo(outbound.transfer.insertionDeltaV, 6);
    // Aerobraking home is on by default: only the periapsis lift is added.
    expect(b.rows[5].deltaV).toBeCloseTo(homeward.deltaV + periapsisRaiseAfterAerocapture(BODIES.Kerbin, 100e3)!, 6);
  });

  it('explains launches and landings separately', () => {
    const b = missionBudget(DEFAULT_MISSION, outbound, homeward, everything);
    const note = (label: string) => b.rows.find((r) => r.label === label)!.note!;
    expect(note('Launch from Kerbin to a 100 km orbit')).not.toMatch(/parachute/i);
    expect(note('Landing on Kerbin')).toMatch(/parachute/i);
    expect(note('Ascent from Duna')).not.toMatch(/parachute/i);
    expect(note('Landing on Duna')).toMatch(/powered touchdown/i);
  });

  it('leaves out what you switch off', () => {
    expect(legs(missionBudget(DEFAULT_MISSION, outbound, homeward, { launch: false, land: false, comeBack: false }))).toEqual([
      'Ejection burn',
      'Capture at Duna',
    ]);
  });

  it('cannot plan the way back before it is known', () => {
    expect(legs(missionBudget(DEFAULT_MISSION, outbound, null, everything))).not.toContain('Return to Kerbin');
  });

  it('counts the periapsis lift back home only when aerobraking there', () => {
    const home = (aerobrakeHome: boolean) =>
      missionBudget({ ...DEFAULT_MISSION, aerobrakeHome }, outbound, homeward, everything).rows.find((r) => r.label === 'Return to Kerbin')!.deltaV;
    expect(home(false)).toBeCloseTo(homeward.deltaV, 6);
    expect(home(true)).toBeCloseTo(homeward.deltaV + periapsisRaiseAfterAerocapture(BODIES.Kerbin, 100e3)!, 6);
  });

  it('counts only the periapsis lift when aerobraking', () => {
    const m: Mission = { ...DEFAULT_MISSION, aerobrake: true };
    const b = missionBudget(m, outbound, homeward, everything);
    const capture = b.rows.find((r) => r.label === 'Capture at Duna')!;
    expect(capture.deltaV).toBeCloseTo(periapsisRaiseAfterAerocapture(BODIES.Duna, 100e3)!, 6);
    expect(capture.approximate).toBe(true);
  });

  it('has no landing on a body without a surface, and nothing to capture into on a flyby', () => {
    const jool = missionBudget({ ...DEFAULT_MISSION, destination: 'Jool' }, outbound, homeward, everything);
    expect(legs(jool)).not.toContain('Landing on Jool');
    const flyby = missionBudget({ ...DEFAULT_MISSION, capture: false }, outbound, homeward, everything);
    expect(legs(flyby)).toEqual(['Launch from Kerbin to a 100 km orbit', 'Ejection burn']);
  });
});
