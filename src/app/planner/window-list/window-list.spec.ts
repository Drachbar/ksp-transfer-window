import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WindowList } from './window-list';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION } from '../mission';
import { formatDate, formatDuration, KERBIN_CALENDAR } from '../../astro/game-time';
import { formatDeltaV } from '../format';

describe('WindowList', () => {
  let fixture: ComponentFixture<WindowList>;
  let el: HTMLElement;
  const { windows } = sampleResult();

  beforeEach(async () => {
    fixture = TestBed.createComponent(WindowList);
    fixture.componentRef.setInput('windows', windows);
    fixture.componentRef.setInput('mission', DEFAULT_MISSION);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  const rows = () => Array.from(el.querySelectorAll<HTMLButtonElement>('button.window'));

  it('lists every window with its departure, flight time and Δv', () => {
    expect(rows().length).toBe(windows.length);
    rows().forEach((row, i) => {
      const w = windows[i];
      expect(row.textContent).toContain(formatDate(w.departureTime, KERBIN_CALENDAR));
      expect(row.textContent).toContain(formatDuration(w.departureTime, KERBIN_CALENDAR));
      expect(row.textContent).toContain(formatDuration(w.timeOfFlight, KERBIN_CALENDAR));
      expect(row.textContent).toContain(formatDeltaV(w.deltaV));
    });
  });

  it('says "now" for a departure at the current time', async () => {
    fixture.componentRef.setInput('windows', [sampleResult().departNow!, ...windows]);
    await fixture.whenStable();
    expect(rows()[0].querySelector('.departure .muted')!.textContent!.trim()).toBe('now');
  });

  it('selects the first window by default', () => {
    expect(rows().map((r) => r.getAttribute('aria-pressed'))).toEqual(['true', ...windows.slice(1).map(() => 'false')]);
  });

  it('selects a window when clicked', async () => {
    rows()[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe(1);
    expect(rows()[1].getAttribute('aria-pressed')).toBe('true');
    expect(rows()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the cheapest window', () => {
    const cheapest = windows.reduce((best, w, i) => (w.deltaV < windows[best].deltaV ? i : best), 0);
    const marked = rows().filter((r) => r.querySelector('.badge'));
    expect(marked).toEqual([rows()[cheapest]]);
    expect(marked[0].textContent).toContain('Cheapest');
  });
});
