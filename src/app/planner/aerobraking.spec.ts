import { arrivalExcessSpeed, entrySpeed, hasAtmosphere, periapsisRaiseAfterAerocapture } from './aerobraking';
import { BODIES } from '../astro/bodies';
import { sampleResult } from '../../testing/sample-windows';

describe('aerobraking', () => {
  it('knows which bodies have an atmosphere to brake in', () => {
    expect(['Kerbin', 'Eve', 'Duna', 'Jool', 'Laythe'].every((b) => hasAtmosphere(BODIES[b as 'Kerbin']))).toBe(true);
    expect(hasAtmosphere(BODIES.Mun)).toBe(false);
    expect(hasAtmosphere(BODIES.Dres)).toBe(false);
  });

  it('gives the speed at the top of the atmosphere for a given excess speed', () => {
    const duna = BODIES.Duna;
    const r = duna.radius + duna.atmosphereHeight;
    expect(entrySpeed(duna, 0)).toBeCloseTo(Math.sqrt((2 * duna.gravitationalParameter) / r), 6); // escape speed there
    expect(entrySpeed(duna, 1000)).toBeCloseTo(Math.sqrt(1000 ** 2 + (2 * duna.gravitationalParameter) / r), 6);
  });

  it('costs a small burn at apoapsis to lift the periapsis out of the atmosphere', () => {
    const duna = BODIES.Duna;
    const mu = duna.gravitationalParameter;
    const rf = duna.radius + 100e3;
    const rp = duna.radius + duna.atmosphereHeight;
    const expected = Math.sqrt(mu / rf) - Math.sqrt(mu * (2 / rf - 2 / (rf + rp)));
    expect(periapsisRaiseAfterAerocapture(duna, 100e3)).toBeCloseTo(expected, 6);
    expect(periapsisRaiseAfterAerocapture(duna, 100e3)).toBeLessThan(50);
  });

  it('cannot end in an orbit inside the atmosphere', () => {
    expect(periapsisRaiseAfterAerocapture(BODIES.Kerbin, 60e3)).toBeNull();
  });

  it('measures how fast a transfer arrives, relative to the destination', () => {
    const w = sampleResult().windows[0]; // Kerbin → Duna
    const o = BODIES.Duna.orbit!;
    const v = o.velocityAtTrueAnomaly(o.trueAnomalyAt(w.arrivalTime));
    const i = w.transfer.insertionVelocity;
    expect(arrivalExcessSpeed(w, BODIES.Duna)).toBeCloseTo(Math.hypot(i[0] - v[0], i[1] - v[1], i[2] - v[2]), 6);
    expect(arrivalExcessSpeed(w, BODIES.Duna)).toBeGreaterThan(300);
    expect(arrivalExcessSpeed(w, BODIES.Duna)).toBeLessThan(2000);
  });
});
