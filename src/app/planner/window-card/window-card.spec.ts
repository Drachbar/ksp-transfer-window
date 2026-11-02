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

  it('names the parking orbit the burn starts from', async () => {
    expect((await render()).querySelector('#step-burn')!.textContent).toContain('from a 100 km orbit');
  });

  it('does not talk about a "0 km orbit" when there is no parking orbit', async () => {
    const el = await render(window, { ...DEFAULT_MISSION, initialAltitudeKm: 0 });
    const heading = el.querySelector('#step-burn')!.textContent!;
    expect(heading).not.toContain('0 km');
    expect(heading).toContain('Ejection burn');
  });

  it('shows the phase angle', async () => {
    expect(field(await render(), 'phase-angle')).toBe(formatAngle(window.phaseAngle));
  });

  it('shows where the planets are at departure, in the departure step', async () => {
    const step = (await render()).querySelector('[aria-labelledby="step-depart"]')!;
    expect(step.querySelector('app-solar-system-diagram')).not.toBeNull();
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

  describe('mid-course plane change', () => {
    const alternative: TransferWindow = {
      ...window,
      deltaV: window.deltaV - 300,
      transfer: { ...window.transfer, deltaV: window.deltaV - 300, planeChangeDeltaV: 250, planeChangeTime: window.departureTime + 100 * 21600, planeChangeAngle: 0.1 },
    };

    it('suggests a cheaper transfer with a plane change, and offers to show it', async () => {
      const el = await render({ ...window, planeChangeAlternative: alternative });
      const tip = el.querySelector('[data-testid="plane-change-tip"]')!;
      const percent = Math.round((300 / window.deltaV) * 100);
      expect(tip.textContent).toContain(`saves ${formatDeltaV(300)} (${percent}%)`);
      const shown: TransferWindow[] = [];
      fixture.componentInstance.showAlternative.subscribe((w) => shown.push(w));
      tip.querySelector('button')!.click();
      expect(shown).toEqual([alternative]);
    });

    it('does not suggest anything without an alternative', async () => {
      expect((await render()).querySelector('[data-testid="plane-change-tip"]')).toBeNull();
    });

    it('adds the plane change burn as a step when the transfer has one', async () => {
      const el = await render(alternative);
      const step = el.querySelector('[aria-labelledby="step-plane-change"]')!;
      expect(step.textContent).toContain('Mid-course plane change');
      expect(field(el, 'plane-change')).toBe(formatDeltaV(250));
      expect(field(el, 'plane-change-time')).toBe(formatDate(window.departureTime + 100 * 21600, KERBIN_CALENDAR));
      expect(field(el, 'plane-change-angle')).toBe(formatAngle(0.1, 1));
      expect(el.querySelector('#step-arrive')!.textContent).toContain('4');
    });

    it('has no plane change step for a ballistic transfer', async () => {
      expect((await render()).querySelector('[aria-labelledby="step-plane-change"]')).toBeNull();
    });
  });

  it('flags an ejection that could not be refined', async () => {
    expect((await render()).querySelector('[data-testid="estimate-note"]')).toBeNull();
    const el = await render({ ...window, refined: false });
    expect(el.querySelector('[data-testid="estimate-note"]')!.textContent).toMatch(/estimate/i);
  });
});
