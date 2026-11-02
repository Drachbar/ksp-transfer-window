import { ComponentFixture, TestBed } from '@angular/core/testing';
import { burnPoint, EjectionDiagram } from './ejection-diagram';

describe('burnPoint', () => {
  // Screen coordinates (y down) around the planet: prograde is up, the Sun is to the left.
  it('is at prograde for 0°', () => {
    const [x, y] = burnPoint(0, 100);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(-100, 9);
  });

  it('moves clockwise from prograde (i.e. the craft reaches it before prograde)', () => {
    const [x, y] = burnPoint(Math.PI / 2, 100);
    expect(x).toBeCloseTo(100, 9); // away from the Sun
    expect(y).toBeCloseTo(0, 9);
    const [x2, y2] = burnPoint(Math.PI, 100);
    expect(x2).toBeCloseTo(0, 9);
    expect(y2).toBeCloseTo(100, 9); // retrograde
  });
});

describe('EjectionDiagram', () => {
  let fixture: ComponentFixture<EjectionDiagram>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(EjectionDiagram);
    fixture.componentRef.setInput('ejectionAngle', (130 * Math.PI) / 180);
    fixture.componentRef.setInput('origin', 'Kerbin');
    await fixture.whenStable();
  });

  it('describes the burn for screen readers', () => {
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Burn at 130° from Kerbin’s prograde direction');
  });

  it('marks the burn point on the parking orbit', () => {
    const marker = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="burn-point"]')!;
    const [x, y] = burnPoint((130 * Math.PI) / 180, 60);
    expect(Number(marker.getAttribute('cx'))).toBeCloseTo(x, 2);
    expect(Number(marker.getAttribute('cy'))).toBeCloseTo(y, 2);
  });

  it('labels the prograde direction and the Sun', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Prograde');
    expect(text).toContain('Sun');
  });

  it('labels the parent body instead of the Sun for moons', async () => {
    fixture.componentRef.setInput('parent', 'Kerbin');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Kerbin');
  });
});
