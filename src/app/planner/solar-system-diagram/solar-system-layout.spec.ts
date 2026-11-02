import { describePhase, layoutSystem, type SystemLayout } from './solar-system-layout';
import { BODIES } from '../../astro/bodies';
import { sampleResult } from '../../../testing/sample-windows';

const RADIUS = 100;
const angleOf = (p: { x: number; y: number }) => Math.atan2(-p.y, p.x); // math angle of a screen point
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('layoutSystem', () => {
  const w = sampleResult().windows[0]; // Kerbin → Duna
  let layout: SystemLayout;
  beforeAll(
    () =>
      (layout = layoutSystem({
        origin: BODIES.Kerbin,
        destination: BODIES.Duna,
        time: w.departureTime,
        radius: RADIUS,
        transfer: { departureVelocity: w.departureVelocity, arrivalTime: w.arrivalTime },
      })),
  );
  const body = (name: string) => layout.bodies.find((b) => b.name === name)!;

  it('shows every body orbiting the same parent, with roles', () => {
    expect(layout.bodies.map((b) => b.name)).toEqual(['Moho', 'Eve', 'Kerbin', 'Duna', 'Dres', 'Jool', 'Eeloo']);
    expect(body('Kerbin').role).toBe('origin');
    expect(body('Duna').role).toBe('destination');
    expect(body('Eve').role).toBe('other');
    expect(layout.parent).toBe('Kerbol');
  });

  it('puts the origin at the bottom', () => {
    expect(body('Kerbin').x).toBeCloseTo(0, 6);
    expect(body('Kerbin').y).toBeGreaterThan(0);
  });

  it('keeps the true angles between the bodies', () => {
    const t = w.departureTime;
    const pos = (name: 'Kerbin' | 'Duna' | 'Jool') => {
      const o = BODIES[name].orbit!;
      return o.positionAtTrueAnomaly(o.trueAnomalyAt(t));
    };
    for (const name of ['Duna', 'Jool'] as const) {
      const real = Math.atan2(pos(name)[1], pos(name)[0]) - Math.atan2(pos('Kerbin')[1], pos('Kerbin')[0]);
      const shown = angleOf(body(name)) - angleOf(body('Kerbin'));
      expect(Math.abs(wrap(shown - real))).toBeLessThan(1e-3); // coordinates are rounded to 0.01
    }
  });

  it('compresses distances but keeps their order, fitting everything in the radius', () => {
    const r = (name: string) => Math.hypot(body(name).x, body(name).y);
    const order = ['Moho', 'Eve', 'Kerbin', 'Duna', 'Dres', 'Jool', 'Eeloo'];
    // Mean distances are ordered; allow eccentric orbits to wander a little.
    expect(r('Moho')).toBeLessThan(r('Kerbin'));
    expect(r('Kerbin')).toBeLessThan(r('Jool'));
    for (const name of order) expect(r(name)).toBeLessThanOrEqual(RADIUS + 1e-9);
    // Compression keeps the inner planets visible
    expect(r('Moho') / RADIUS).toBeGreaterThan(0.25);
  });

  it('draws each orbit as a closed path through the body', () => {
    expect(layout.orbits.map((o) => o.name)).toEqual(layout.bodies.map((b) => b.name));
    for (const o of layout.orbits) expect(o.path).toMatch(/^M [-\d.]+ [-\d.]+( L [-\d.]+ [-\d.]+)+ Z$/);
  });

  it('draws the transfer from the origin to where the destination will be on arrival', () => {
    const t = layout.transfer!;
    const [sx, sy] = t.path.match(/^M ([-\d.]+) ([-\d.]+)/)!.slice(1).map(Number);
    expect(Math.hypot(sx - body('Kerbin').x, sy - body('Kerbin').y)).toBeLessThan(1);
    const end = t.path.trim().split(' L ').at(-1)!.split(' ').map(Number);
    expect(Math.hypot(end[0] - t.arrival.x, end[1] - t.arrival.y)).toBeLessThan(0.5);
    // The arrival point is on Duna's orbit, ahead of where Duna is at departure.
    expect(wrap(angleOf(t.arrival) - angleOf(body('Duna')))).toBeGreaterThan(0);
  });

  it('can be drawn without a transfer', () => {
    expect(layoutSystem({ origin: BODIES.Kerbin, destination: BODIES.Duna, time: 0, radius: RADIUS }).transfer).toBeUndefined();
  });

  it('shows moons around their planet', () => {
    const moons = layoutSystem({ origin: BODIES.Mun, destination: BODIES.Minmus, time: 0, radius: RADIUS });
    expect(moons.parent).toBe('Kerbin');
    expect(moons.bodies.map((b) => b.name)).toEqual(['Mun', 'Minmus']);
  });

  it('measures the phase angle the way it is drawn', () => {
    expect(Math.abs(wrap(layout.phaseAngle - (angleOf(body('Duna')) - angleOf(body('Kerbin')))))).toBeLessThan(1e-3);
  });
});

describe('describePhase', () => {
  const DEG = Math.PI / 180;
  it('says ahead or behind, within ±180°', () => {
    expect(describePhase('Duna', 'Kerbin', 36 * DEG)).toBe('Duna is 36° ahead of Kerbin');
    expect(describePhase('Eve', 'Kerbin', -54 * DEG)).toBe('Eve is 54° behind Kerbin');
    expect(describePhase('Moho', 'Kerbin', -252 * DEG)).toBe('Moho is 108° ahead of Kerbin');
    expect(describePhase('Jool', 'Kerbin', 300 * DEG)).toBe('Jool is 60° behind Kerbin');
  });
});
