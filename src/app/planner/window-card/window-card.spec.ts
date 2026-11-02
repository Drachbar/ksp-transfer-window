import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WindowCard } from './window-card';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION, type Mission } from '../mission';
import { formatDate, formatDuration, KERBIN_CALENDAR } from '../../astro/game-time';
import { formatAngle, formatDeltaV, formatSignedDeltaV } from '../format';
import type { TransferWindow } from '../../search/window-finder';

describe('WindowCard', () => {
  let fixture: ComponentFixture<WindowCard>;
  const window = sampleResult().windows[0];

  const render = async (w: TransferWindow = window, mission: Mission = DEFAULT_MISSION) => {
    fixture = TestBed.createComponent(WindowCard);
    fixture.componentRef.setInput('window', w);
    fixture.componentRef.setInput('mission', mission);
    fixture.componentRef.setInput('heading', 'Next window');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };
  const field = (el: HTMLElement, name: string) => el.querySelector(`[data-field="${name}"]`)?.textContent?.trim();

  it('shows the heading', async () => {
    expect((await render()).querySelector('h2')!.textContent).toContain('Next window');
  });

  it('shows when to leave, and how long until then', async () => {
    const el = await render();
    expect(field(el, 'departure')).toBe(formatDate(window.departureTime, KERBIN_CALENDAR));
    expect(field(el, 'countdown')).toBe(`in ${formatDuration(window.departureTime, KERBIN_CALENDAR)}`);
  });

  it('says "now" when the departure is the current time', async () => {
    const el = await render(sampleResult().departNow!);
    expect(field(el, 'countdown')).toBe('now');
  });

  it('shows the total Δv', async () => {
    expect(field(await render(), 'total')).toBe(formatDeltaV(window.deltaV));
  });

  it('shows the ejection burn as manoeuvre node components', async () => {
    const el = await render();
    expect(field(el, 'ejection')).toBe(formatDeltaV(window.transfer.ejectionDeltaV));
    expect(field(el, 'prograde')).toBe(formatSignedDeltaV(window.details.ejectionProgradeDeltaV));
    expect(field(el, 'normal')).toBe(formatSignedDeltaV(window.details.ejectionNormalDeltaV));
    expect(field(el, 'ejection-angle')).toBe(formatAngle(window.transfer.ejectionAngle));
  });

  it('shows the phase angle', async () => {
    expect(field(await render(), 'phase-angle')).toBe(formatAngle(window.phaseAngle));
  });

  it('draws where to burn', async () => {
    expect((await render()).querySelector('app-ejection-diagram')).not.toBeNull();
  });

  it('shows the arrival and the capture burn', async () => {
    const el = await render();
    expect(field(el, 'arrival')).toBe(formatDate(window.arrivalTime, KERBIN_CALENDAR));
    expect(field(el, 'flight-time')).toBe(formatDuration(window.timeOfFlight, KERBIN_CALENDAR));
    expect(field(el, 'capture')).toBe(formatDeltaV(window.transfer.insertionDeltaV));
    expect(el.textContent).toContain('100 km');
  });

  it('says there is no capture burn for a flyby', async () => {
    const el = await render(window, { ...DEFAULT_MISSION, capture: false });
    expect(field(el, 'capture')).toBe('None (flyby)');
  });

  it('counts down from the current game time', async () => {
    const el = await render(window, { ...DEFAULT_MISSION, day: 11 });
    expect(field(el, 'countdown')).toBe(`in ${formatDuration(window.departureTime - 10 * 6 * 3600, KERBIN_CALENDAR)}`);
  });

  it('flags an ejection that could not be refined', async () => {
    expect((await render()).querySelector('[data-testid="estimate-note"]')).toBeNull();
    const el = await render({ ...window, refined: false });
    expect(el.querySelector('[data-testid="estimate-note"]')!.textContent).toMatch(/estimate/i);
  });
});
