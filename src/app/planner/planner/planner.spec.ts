import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MISSION_STORAGE, STORAGE_KEY } from '../mission-state';
import { Planner, SEARCH_DEBOUNCE_MS } from './planner';
import { WindowSearch } from '../../search/window-search';
import type { WindowSearchRequest } from '../../search/window-search-protocol';
import type { WindowSearchResult } from '../../search/window-finder';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION, toSearchRequest } from '../mission';
import { formatDate, formatDuration, KERBIN_CALENDAR } from '../../astro/game-time';
import { formatDeltaV } from '../format';

interface PendingSearch {
  request: WindowSearchRequest;
  onProgress?: (f: number) => void;
  resolve: (r: WindowSearchResult) => void;
  reject: (e: unknown) => void;
}

class FakeWindowSearch {
  calls: PendingSearch[] = [];
  search(request: WindowSearchRequest, onProgress?: (f: number) => void) {
    return new Promise<WindowSearchResult>((resolve, reject) => this.calls.push({ request, onProgress, resolve, reject }));
  }
}

describe('Planner', () => {
  let fixture: ComponentFixture<Planner>;
  let search: FakeWindowSearch;
  let el: HTMLElement;
  const result = sampleResult();

  /** Lets effects run, their (0 ms) debounce timers fire and the view update. */
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    search = new FakeWindowSearch();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WindowSearch, useValue: search },
        { provide: SEARCH_DEBOUNCE_MS, useValue: 0 },
        { provide: MISSION_STORAGE, useValue: null },
      ],
    });
    fixture = TestBed.createComponent(Planner);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  const finishSearch = async (r: WindowSearchResult = result) => {
    search.calls.at(-1)!.resolve(r);
    await settle();
  };

  it('searches for the default mission straight away', () => {
    expect(search.calls.length).toBe(1);
    expect(search.calls[0].request).toEqual(toSearchRequest(DEFAULT_MISSION));
  });

  it('shows progress while searching', async () => {
    search.calls[0].onProgress!(0.4);
    await fixture.whenStable();
    const bar = el.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
  });

  it('shows the next window and the list of upcoming windows', async () => {
    await finishSearch();
    const card = el.querySelector('app-window-card')!;
    expect(card.textContent).toContain('Next window');
    expect(card.textContent).toContain(formatDate(result.windows[0].departureTime, KERBIN_CALENDAR));
    expect(el.querySelectorAll('app-window-list button.window').length).toBe(result.windows.length);
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('compares leaving now with waiting for the next window', async () => {
    await finishSearch();
    const summary = el.querySelector('[data-testid="summary"]')!.textContent!.replace(/\s+/g, ' ');
    expect(summary).toContain(`Leaving now costs ${formatDeltaV(result.departNow!.deltaV)}`);
    expect(summary).toContain(`Waiting ${formatDuration(result.windows[0].departureTime, KERBIN_CALENDAR)}`);
    expect(summary).toContain(`saves ${formatDeltaV(result.departNow!.deltaV - result.windows[0].deltaV)}`);
  });

  describe('when leaving now is cheaper than the next window', () => {
    const cheapNow = { ...result, departNow: { ...result.departNow!, deltaV: result.windows[0].deltaV - 100 } };

    it('suggests leaving now', async () => {
      await finishSearch(cheapNow);
      const summary = el.querySelector('[data-testid="summary"]')!.textContent!.replace(/\s+/g, ' ');
      expect(summary).toContain(`Leaving now costs ${formatDeltaV(cheapNow.departNow.deltaV)}, less than the next window`);
      expect(el.querySelector('app-window-card')!.textContent).toContain('Leave now');
    });

    it('lists "now" first', async () => {
      await finishSearch(cheapNow);
      const rows = el.querySelectorAll<HTMLButtonElement>('app-window-list button.window');
      expect(rows.length).toBe(result.windows.length + 1);
      expect(rows[0].textContent).toContain('now');
      rows[1].click();
      await fixture.whenStable();
      expect(el.querySelector('app-window-card')!.textContent).toContain('Next window');
    });
  });

  it('shows the window picked in the list', async () => {
    await finishSearch();
    el.querySelectorAll<HTMLButtonElement>('app-window-list button.window')[2].click();
    await fixture.whenStable();
    const card = el.querySelector('app-window-card')!;
    expect(card.textContent).toContain('Window 3');
    expect(card.textContent).toContain(formatDate(result.windows[2].departureTime, KERBIN_CALENDAR));
  });

  it('searches again when the mission changes', async () => {
    await finishSearch();
    const day = el.querySelector<HTMLInputElement>('#mission-day')!;
    day.value = '50';
    day.dispatchEvent(new Event('input'));
    await settle();
    expect(search.calls.length).toBe(2);
    expect(search.calls[1].request.now).toBe(49 * 6 * 3600);
  });

  it('starts over at the first window after a new search', async () => {
    await finishSearch();
    el.querySelectorAll<HTMLButtonElement>('app-window-list button.window')[1].click();
    await fixture.whenStable();
    const day = el.querySelector<HTMLInputElement>('#mission-day')!;
    day.value = '2';
    day.dispatchEvent(new Event('input'));
    await settle();
    await finishSearch();
    expect(el.querySelector('app-window-card')!.textContent).toContain('Next window');
  });

  it('does not search while the mission is invalid', async () => {
    await finishSearch();
    const day = el.querySelector<HTMLInputElement>('#mission-day')!;
    day.value = '999';
    day.dispatchEvent(new Event('input'));
    await settle();
    expect(search.calls.length).toBe(1);
  });

  it('shows search errors', async () => {
    search.calls[0].reject(new Error('Kerbin and Laythe do not orbit the same body'));
    await settle();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('do not orbit the same body');
  });

  it('ignores searches that were cancelled by a newer one', async () => {
    search.calls[0].reject(new DOMException('Search cancelled', 'AbortError'));
    await settle();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('Planner state', () => {
  class MemoryStorage {
    data = new Map<string, string>();
    getItem = (k: string) => this.data.get(k) ?? null;
    setItem = (k: string, v: string) => void this.data.set(k, v);
  }
  let search: FakeWindowSearch;
  let storage: MemoryStorage;

  beforeEach(() => {
    search = new FakeWindowSearch();
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: Planner }]),
        { provide: WindowSearch, useValue: search },
        { provide: SEARCH_DEBOUNCE_MS, useValue: 0 },
        { provide: MISSION_STORAGE, useValue: storage },
      ],
    });
  });

  const open = async (url: string) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, Planner);
    await harness.fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await harness.fixture.whenStable();
    return harness;
  };

  it('opens the mission described in the URL', async () => {
    await open('/?from=Mun&to=Minmus&year=2&day=3&hour=1&orbit=20&capture=none&calendar=kerbin');
    expect(search.calls[0].request).toMatchObject({ origin: 'Mun', destination: 'Minmus', initialAltitude: 20e3, finalAltitude: null });
    expect(search.calls[0].request.now).toBe((426 + 2) * 6 * 3600 + 3600);
  });

  it('falls back to the mission from the last visit', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_MISSION, destination: 'Eve', day: 30 }));
    await open('/');
    expect(search.calls[0].request).toMatchObject({ destination: 'Eve', now: 29 * 6 * 3600 });
  });

  it('prefers the URL over the last visit', async () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_MISSION, destination: 'Eve' }));
    await open('/?to=Jool');
    expect(search.calls[0].request.destination).toBe('Jool');
  });

  it('puts the searched mission in the URL and remembers it', async () => {
    await open('/?to=Dres');
    const url = TestBed.inject(Router).url;
    expect(url).toContain('from=Kerbin');
    expect(url).toContain('to=Dres');
    expect(url).toContain('capture=100');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toMatchObject({ destination: 'Dres' });
  });

  it('copes with nonsense in the URL', async () => {
    await open('/?from=Narnia&day=banana');
    expect(search.calls[0].request).toEqual(toSearchRequest(DEFAULT_MISSION));
  });
});
