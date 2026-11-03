import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConstellationDiagram, constellationLayout } from './constellation-diagram';
import { constellation, synchronousOrbit } from '../constellation';
import { BODIES } from '../../astro/bodies';

const kerbin = BODIES.Kerbin;
const target = synchronousOrbit(kerbin).altitude;
const below = constellation({ body: kerbin, targetAltitude: target, count: 3, parkingAltitude: 100e3, deployFrom: 'below' });
const above = constellation({ body: kerbin, targetAltitude: target, count: 4, parkingAltitude: 100e3, deployFrom: 'above' });

describe('constellationLayout', () => {
  it('fits the largest orbit in the radius', () => {
    const l = constellationLayout(above, kerbin, 100);
    expect(Math.max(l.targetRadius, -l.ellipse.cy + l.ellipse.ry, l.ellipse.cy + l.ellipse.ry)).toBeCloseTo(100, 6);
  });

  for (const [name, c] of [['below', below], ['above', above]] as const) {
    it(`draws the deployment orbit through the release point at the top, with the body at a focus (${name})`, () => {
      const l = constellationLayout(c, kerbin, 100);
      expect(l.release).toEqual({ x: 0, y: -l.targetRadius });
      expect(l.ellipse.cy - l.ellipse.ry).toBeCloseTo(-l.targetRadius, 6);
      const focus = Math.sqrt(l.ellipse.ry ** 2 - l.ellipse.rx ** 2);
      expect(Math.abs(l.ellipse.cy)).toBeCloseTo(focus, 6);
    });
  }

  it('puts the satellites evenly around the target orbit, starting at the release point', () => {
    const l = constellationLayout(below, kerbin, 100);
    expect(l.satellites.length).toBe(3);
    expect(l.satellites[0].x).toBeCloseTo(0, 6);
    expect(l.satellites[0].y).toBeCloseTo(-l.targetRadius, 6);
    for (const s of l.satellites) expect(Math.hypot(s.x, s.y)).toBeCloseTo(l.targetRadius, 6);
  });

  it('scales the body and its atmosphere with the orbits', () => {
    const l = constellationLayout(below, kerbin, 100);
    expect(l.bodyRadius / l.targetRadius).toBeCloseTo(kerbin.radius / below.target.radius, 6);
    expect(l.atmosphereRadius / l.bodyRadius).toBeCloseTo((kerbin.radius + 70e3) / kerbin.radius, 6);
  });
});

describe('ConstellationDiagram', () => {
  let fixture: ComponentFixture<ConstellationDiagram>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(ConstellationDiagram);
    fixture.componentRef.setInput('constellation', below);
    fixture.componentRef.setInput('body', kerbin);
    await fixture.whenStable();
  });

  it('draws one marker per satellite and describes the picture', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid="satellite"]').length).toBe(3);
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toMatch(/3 satellites .* Kerbin/);
    expect(el.textContent).toContain('Release at apoapsis');
  });
});
