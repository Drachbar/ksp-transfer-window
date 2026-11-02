import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PorkchopPlot } from './porkchop-plot';
import { WindowSearch } from '../../search/window-search';
import type { PorkchopRequest, PorkchopResult } from '../../search/window-search-protocol';
import { toSearchParams } from '../../search/window-search-protocol';
import { computePorkchop } from '../../search/porkchop';
import { defaultSearchRanges } from '../../search/ranges';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION, toSearchRequest } from '../mission';
import { formatDeltaV } from '../format';
import { formatDate, formatDuration, KERBIN_CALENDAR } from '../../astro/game-time';
import { BODIES } from '../../astro/bodies';

/** Answers porkchop requests with a real (small) grid. */
class FakeSearch {
  requests: PorkchopRequest[] = [];
  fail = false;
  porkchop(request: PorkchopRequest, onProgress?: (f: number) => void): Promise<PorkchopResult> {
    this.requests.push(request);
    if (this.fail) return Promise.reject(new Error('Worker crashed'));
    onProgress?.(0.5);
    const params = toSearchParams(request);
    const ranges = defaultSearchRanges(params.origin, params.destination);
    const grid = {
      earliestDeparture: request.earliestDeparture,
      departureSpan: request.departureSpan,
      shortestTimeOfFlight: ranges.shortestTimeOfFlight,
      timeOfFlightSpan: ranges.timeOfFlightSpan,
      width: request.width,
      height: request.height,
    };
    const p = computePorkchop({ ...params, transferType: 'ballistic', ...grid });
    return Promise.resolve({ ...grid, deltaVs: p.deltaVs, minDeltaV: p.minDeltaV, minIndex: p.minIndex });
  }
}

describe('PorkchopPlot', () => {
  let fixture: ComponentFixture<PorkchopPlot>;
  let search: FakeSearch;
  let el: HTMLElement;
  const { windows } = sampleResult();
  const S = defaultSearchRanges(BODIES.Kerbin, BODIES.Duna).synodicPeriod;

  const render = async (center = windows[0]) => {
    fixture = TestBed.createComponent(PorkchopPlot);
    fixture.componentRef.setInput('mission', DEFAULT_MISSION);
    fixture.componentRef.setInput('windows', windows);
    fixture.componentRef.setInput('center', center);
    fixture.componentRef.setInput('resolution', 30);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    search = new FakeSearch();
    TestBed.configureTestingModule({ providers: [{ provide: WindowSearch, useValue: search }] });
  });

  const plotArea = () => el.querySelector<HTMLElement>('[data-testid="plot-area"]')!;
  /** jsdom has no layout: give the plot area a 300 × 300 box at (100, 50). */
  const layOut = () => (plotArea().getBoundingClientRect = () => ({ left: 100, top: 50, width: 300, height: 300, right: 400, bottom: 350, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect);
  const pointer = (type: string, x: number, y: number) => plotArea().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));

  it('asks for a grid one synodic period wide, centred on the window', async () => {
    await render(windows[1]);
    expect(search.requests[0]).toEqual({
      ...toSearchRequest(DEFAULT_MISSION),
      earliestDeparture: windows[1].departureTime - S / 2,
      departureSpan: S,
      width: 30,
      height: 30,
    });
  });

  it('does not start before the current game time', async () => {
    await render(windows[0]);
    expect(search.requests[0].earliestDeparture).toBe(Math.max(0, windows[0].departureTime - S / 2));
  });

  it('labels the axes with game dates and flight times', async () => {
    await render();
    const r = search.requests[0];
    const x = el.querySelector('[data-testid="x-axis"]')!.textContent!;
    expect(x).toContain('Departure');
    expect(x).toContain(`Y1 D${Math.floor(r.earliestDeparture / 21600) + 1}`);
    const y = el.querySelector('[data-testid="y-axis"]')!.textContent!;
    expect(y).toContain('Flight time');
    const days = (t: number) => `${Math.round(t / 21600)}d`;
    const r2 = defaultSearchRanges(BODIES.Kerbin, BODIES.Duna);
    expect(y).toContain(days(r2.shortestTimeOfFlight));
    expect(y).toContain(days(r2.shortestTimeOfFlight + r2.timeOfFlightSpan)); // no years, even past one year
  });

  it('explains which end of the colour scale is cheap, matching the theme', async () => {
    await render();
    expect(el.querySelector('.hint')!.textContent).toContain('Darker is cheaper'); // jsdom: light theme
  });

  it('has a legend from the cheapest Δv up, and explains blank cells', async () => {
    await render();
    const legend = el.querySelector('[data-testid="legend"]')!.textContent!;
    expect(legend).toMatch(/\d[\d,]* m\/s/);
    expect(legend).toContain('No transfer');
  });

  it('marks the transfer windows that fall inside the plot, highlighting the centre one', async () => {
    await render(windows[1]);
    const markers = Array.from(el.querySelectorAll('[data-testid="window-marker"]'));
    expect(markers.length).toBe(1);
    expect(markers[0].classList).toContain('selected');
  });

  it('shows the transfer under the pointer', async () => {
    await render();
    layOut();
    pointer('pointermove', 250, 200); // middle of the plot
    await fixture.whenStable();
    const tip = el.querySelector('[role="tooltip"]')!.textContent!.replace(/\s+/g, ' ');
    expect(tip).toContain('Depart');
    expect(tip).toMatch(/\d[\d,]* m\/s/);
    pointer('pointerleave', 0, 0);
    await fixture.whenStable();
    expect(el.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('picks the transfer that is clicked', async () => {
    await render();
    layOut();
    const picks: { departureTime: number; timeOfFlight: number }[] = [];
    fixture.componentInstance.pick.subscribe((p) => picks.push(p));
    pointer('click', 100 + 15, 50 + 285); // bottom-left cell area
    expect(picks.length).toBe(1);
    expect(picks[0].departureTime).toBeCloseTo(search.requests[0].earliestDeparture + (1 / 29) * S, 3);
  });

  it('can be used with the keyboard', async () => {
    await render();
    const picks: { departureTime: number; timeOfFlight: number }[] = [];
    fixture.componentInstance.pick.subscribe((p) => picks.push(p));
    const area = plotArea();
    area.dispatchEvent(new FocusEvent('focus'));
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(picks.length).toBe(1);
    expect(el.querySelector('[role="tooltip"]')).not.toBeNull();
  });

  it('describes itself for screen readers', async () => {
    await render();
    const label = plotArea().getAttribute('aria-label')!;
    expect(label).toContain('Porkchop plot');
    expect(label).toContain(formatDeltaV(search.requests.length ? (await search.porkchop(search.requests[0])).minDeltaV : 0));
    expect(label).toContain(formatDate(windows[0].departureTime, KERBIN_CALENDAR).split(',')[0]);
  });

  it('shows errors', async () => {
    search.fail = true;
    await render();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Worker crashed');
  });
});
