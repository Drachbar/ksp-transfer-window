import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DestinationOverview } from './destination-overview';
import { WindowSearch } from '../../search/window-search';
import type { WindowSearchRequest } from '../../search/window-search-protocol';
import type { WindowSearchResult } from '../../search/window-finder';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION, destinationsFor, toSearchRequest, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { formatFlightTime, formatShortDate, KERBIN_CALENDAR } from '../../astro/game-time';

interface Call {
  request: WindowSearchRequest;
  slot?: string;
  resolve: (r: WindowSearchResult) => void;
}

class FakeWindowSearch {
  calls: Call[] = [];
  search(request: WindowSearchRequest, _onProgress?: unknown, slot?: string) {
    return new Promise<WindowSearchResult>((resolve) => this.calls.push({ request, slot, resolve }));
  }
}

describe('DestinationOverview', () => {
  let fixture: ComponentFixture<DestinationOverview>;
  let search: FakeWindowSearch;
  let el: HTMLElement;
  const sample = sampleResult().windows[0];
  /** A different, recognisable Δv per destination. */
  const windowFor = (i: number) => ({ ...sample, deltaV: 1000 + 100 * i });

  const render = async (mission: Mission = DEFAULT_MISSION) => {
    fixture = TestBed.createComponent(DestinationOverview);
    fixture.componentRef.setInput('mission', mission);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  };
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  const resolveAll = async () => {
    search.calls.forEach((c, i) => c.resolve({ windows: [windowFor(i)], departNow: null }));
    await settle();
  };
  const rows = () => Array.from(el.querySelectorAll('tbody tr'));

  beforeEach(() => {
    search = new FakeWindowSearch();
    TestBed.configureTestingModule({ providers: [{ provide: WindowSearch, useValue: search }] });
  });

  it('searches every destination at once, each in its own worker', async () => {
    await render();
    const destinations = destinationsFor('Kerbin');
    expect(search.calls.map((c) => c.request.destination)).toEqual(destinations);
    expect(new Set(search.calls.map((c) => c.slot)).size).toBe(destinations.length);
    expect(search.calls[0].request).toEqual({ ...toSearchRequest({ ...DEFAULT_MISSION, destination: 'Moho' }), windowCount: 1, suggestPlaneChange: false });
  });

  it('lists the next window for each destination', async () => {
    await render();
    await resolveAll();
    expect(rows().length).toBe(destinationsFor('Kerbin').length);
    const eve = rows()[1].textContent!;
    expect(eve).toContain('Eve');
    expect(eve).toContain(formatShortDate(sample.departureTime, KERBIN_CALENDAR));
    expect(eve).toContain(formatDeltaV(1100));
    expect(eve).toContain(formatFlightTime(sample.timeOfFlight, KERBIN_CALENDAR));
  });

  it('shows each destination as soon as its own search is done', async () => {
    await render();
    search.calls[2].resolve({ windows: [windowFor(2)], departNow: null });
    await settle();
    expect(rows()[2].textContent).toContain(formatDeltaV(1200));
    expect(rows()[0].textContent).toMatch(/searching/i);
  });

  it('marks the destination that is currently planned', async () => {
    await render();
    await resolveAll();
    const current = rows().filter((r) => r.getAttribute('aria-current') === 'true');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('Duna');
  });

  it('chooses a destination', async () => {
    await render();
    await resolveAll();
    const chosen: string[] = [];
    fixture.componentInstance.choose.subscribe((d) => chosen.push(d));
    rows()[4].querySelector('button')!.click();
    expect(chosen).toEqual(['Jool']);
  });

  it('says so when there is no window', async () => {
    await render();
    search.calls[0].resolve({ windows: [], departNow: null });
    await settle();
    expect(rows()[0].textContent).toMatch(/no window/i);
  });

  it('starts over for another origin', async () => {
    await render();
    fixture.componentRef.setInput('mission', { ...DEFAULT_MISSION, origin: 'Mun', destination: 'Minmus' });
    await fixture.whenStable();
    expect(search.calls.at(-1)!.request).toMatchObject({ origin: 'Mun', destination: 'Minmus' });
    expect(rows().length).toBe(1);
  });
});
