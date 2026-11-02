import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SolarSystemDiagram } from './solar-system-diagram';
import { describePhase, layoutSystem } from './solar-system-layout';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION } from '../mission';
import { BODIES } from '../../astro/bodies';

describe('SolarSystemDiagram', () => {
  let fixture: ComponentFixture<SolarSystemDiagram>;
  let el: HTMLElement;
  const window = sampleResult().windows[0];

  beforeEach(async () => {
    fixture = TestBed.createComponent(SolarSystemDiagram);
    fixture.componentRef.setInput('window', window);
    fixture.componentRef.setInput('mission', DEFAULT_MISSION);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label)!;
  const phaseAt = (t: number) => layoutSystem({ origin: BODIES.Kerbin, destination: BODIES.Duna, time: t, radius: 100 }).phaseAngle;

  it('draws every planet, labelling the origin, the destination and the Sun', () => {
    const drawn = Array.from(el.querySelectorAll('[data-body]')).map((c) => c.getAttribute('data-body'));
    expect(drawn).toEqual(['Moho', 'Eve', 'Kerbin', 'Duna', 'Dres', 'Jool', 'Eeloo']);
    const labels = Array.from(el.querySelectorAll('svg text')).map((t) => t.textContent!.trim());
    expect(labels).toEqual(expect.arrayContaining(['Kerbin', 'Duna', 'Kerbol']));
    expect(labels).not.toContain('Jool');
  });

  it('shows the positions at departure by default, with the transfer', () => {
    expect(button('At departure').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="transfer"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="arrival"]')).not.toBeNull();
    const description = describePhase('Duna', 'Kerbin', phaseAt(window.departureTime));
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe(`At departure, ${description}`);
  });

  it('can show where everything is now, for comparing with the map view in the game', async () => {
    button('Now').click();
    await fixture.whenStable();
    expect(button('Now').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="transfer"]')).toBeNull();
    const now = describePhase('Duna', 'Kerbin', phaseAt(0));
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe(`Now, ${now}`);
    const caption = el.querySelector('figcaption')!.textContent!.replace(/\s+/g, ' ');
    expect(caption).toContain(`Now: ${now}.`);
    expect(caption).toContain(`At departure: ${describePhase('Duna', 'Kerbin', phaseAt(window.departureTime))}.`);
  });

  it('says that distances are not to scale', () => {
    expect(el.querySelector('figcaption')!.textContent).toMatch(/not to scale/i);
  });

  it('draws moons around their planet', async () => {
    fixture.componentRef.setInput('mission', { ...DEFAULT_MISSION, origin: 'Mun', destination: 'Minmus' });
    fixture.componentRef.setInput('window', { ...sampleResult().departNow!, transfer: { ...sampleResult().departNow!.transfer } });
    await fixture.whenStable();
    expect(Array.from(el.querySelectorAll('[data-body]')).map((c) => c.getAttribute('data-body'))).toEqual(['Mun', 'Minmus']);
  });
});
