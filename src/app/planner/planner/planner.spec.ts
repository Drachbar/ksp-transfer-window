import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { PorkchopPlot } from '../porkchop-plot/porkchop-plot';
import { MISSION_STORAGE, STORAGE_KEY } from '../mission-state';
import { NARROW_SCREEN, Planner, SEARCH_DEBOUNCE_MS } from './planner';
import { signal } from '@angular/core';
import { WindowSearch } from '../../search/window-search';
import type { WindowSearchRequest } from '../../search/window-search-protocol';
import type { WindowSearchResult } from '../../search/window-finder';
import { sampleResult } from '../../../testing/sample-windows';
import { DEFAULT_MISSION, returnMission, toSearchRequest } from '../mission';
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
  /** Searches for the way home (slot 'return'). */
  returnCalls: PendingSearch[] = [];
  porkchopRequests: unknown[] = [];
  porkchop(request: unknown) {
    this.porkchopRequests.push(request);
    return new Promise<never>(() => {});
  }
  search(request: WindowSearchRequest, onProgress?: (f: number) => void, slot = 'windows') {
    const list = slot === 'return' ? this.returnCalls : this.calls;
    return new Promise<WindowSearchResult>((resolve, reject) => list.push({ request, onProgress, resolve, reject }));
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

  describe('porkchop plot', () => {
    const showPlot = async () => {
      await finishSearch();
      Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('porkchop'))!.click();
      await settle();
      await settle();
    };
    const plot = () => fixture.debugElement.query(By.directive(PorkchopPlot))?.componentInstance as PorkchopPlot | undefined;

    it('is only calculated when asked for', async () => {
      await finishSearch();
      expect(plot()).toBeUndefined();
      expect(search.porkchopRequests.length).toBe(0);
      await showPlot();
      expect(plot()).toBeDefined();
      expect(search.porkchopRequests.length).toBe(1);
    });

    it('shows the point picked in the plot', async () => {
      await showPlot();
      const w = result.windows[1];
      plot()!.pick.emit({ departureTime: w.departureTime + 5 * 21600, timeOfFlight: w.timeOfFlight });
      await fixture.whenStable();
      const card = el.querySelector('app-window-card')!;
      expect(card.textContent).toContain('Selected point');
      expect(card.textContent).toContain(formatDate(w.departureTime + 5 * 21600, KERBIN_CALENDAR));
    });

    it('confirms the pick next to the plot, with a way to jump to the details', async () => {
      await showPlot();
      const w = result.windows[0];
      plot()!.pick.emit({ departureTime: w.departureTime, timeOfFlight: w.timeOfFlight });
      await fixture.whenStable();
      const note = el.querySelector('[data-testid="picked"]')!;
      expect(note.textContent).toContain(formatDate(w.departureTime, KERBIN_CALENDAR));
      const card = el.querySelector('app-window-card') as HTMLElement;
      card.scrollIntoView = vi.fn();
      Array.from(note.querySelectorAll('button')).find((b) => b.textContent!.includes('Show details'))!.click();
      expect(card.scrollIntoView).toHaveBeenCalled();
    });

    it('goes back to a window when one is picked in the list', async () => {
      await showPlot();
      plot()!.pick.emit({ departureTime: result.windows[0].departureTime + 21600, timeOfFlight: result.windows[0].timeOfFlight });
      await fixture.whenStable();
      el.querySelectorAll<HTMLButtonElement>('app-window-list button.window')[1].click();
      await fixture.whenStable();
      expect(el.querySelector('app-window-card')!.textContent).toContain('Window 2');
    });
  });

  it('shows the suggested plane-change transfer when asked', async () => {
    const w = result.windows[0];
    const alternative = { ...w, deltaV: w.deltaV - 300, transfer: { ...w.transfer, planeChangeDeltaV: 250, planeChangeTime: w.departureTime + 1e6 } };
    await finishSearch({ ...result, windows: [{ ...w, planeChangeAlternative: alternative }, ...result.windows.slice(1)] });
    el.querySelector<HTMLButtonElement>('[data-testid="plane-change-tip"] button')!.click();
    await fixture.whenStable();
    const card = el.querySelector('app-window-card')!;
    expect(card.querySelector('h2')!.textContent).toContain('With mid-course plane change');
    expect(card.querySelector('[data-field="total"]')!.textContent).toBe(formatDeltaV(w.deltaV - 300));
  });

  it('lets you choose a window above the details', async () => {
    await finishSearch();
    const list = el.querySelector('app-window-list')!;
    const card = el.querySelector('app-window-card')!;
    expect(list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('return trip', () => {
    const home = sampleResult().windows[1]; // stands in for a Duna → Kerbin window
    const homeResult = { windows: [home], departNow: null };

    it('looks for the way home from the window that is shown', async () => {
      await finishSearch();
      expect(search.returnCalls.length).toBe(1);
      expect(search.returnCalls[0].request).toEqual({ ...toSearchRequest(returnMission(DEFAULT_MISSION, result.windows[0])), windowCount: 3 });
      expect(el.querySelector('[aria-labelledby="step-return"]')!.textContent).toMatch(/looking for/i);
    });

    it('shows the next window home in the card', async () => {
      await finishSearch();
      search.returnCalls[0].resolve(homeResult);
      await settle();
      const step = el.querySelector('[aria-labelledby="step-return"]')!.textContent!;
      expect(step).toContain('Return to Kerbin');
      expect(step).toContain(formatDate(home.departureTime, KERBIN_CALENDAR));
    });

    it('looks again when another window is chosen', async () => {
      await finishSearch();
      el.querySelectorAll<HTMLButtonElement>('app-window-list button.window')[2].click();
      await settle();
      expect(search.returnCalls.at(-1)!.request.now).toBeGreaterThanOrEqual(result.windows[2].arrivalTime);
    });

    it('shows the trip home in detail when asked', async () => {
      await finishSearch();
      search.returnCalls[0].resolve(homeResult);
      await settle();
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Show the return trip'))!.click();
      await settle();
      const card = el.querySelector('app-window-card')!;
      expect(card.querySelector('h2')!.textContent).toContain('Return to Kerbin');
      expect(card.querySelector('#step-depart')!.textContent).toContain('Depart from Duna');
      expect(card.querySelector('[data-field="countdown"]')!.textContent).toContain('after you arrive');
      expect(card.querySelector('[aria-labelledby="step-return"]')).toBeNull();
    });

    it('does not plan a way home for a flyby', async () => {
      const capture = el.querySelector<HTMLInputElement>('#mission-capture')!;
      capture.click();
      await settle();
      search.calls.at(-1)!.resolve(result);
      await settle();
      expect(search.returnCalls.length).toBe(0);
      expect(el.querySelector('[aria-labelledby="step-return"]')).toBeNull();
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

  it('shows the shape of the results while the first search runs', async () => {
    expect(el.querySelector('[data-testid="skeleton"]')).not.toBeNull();
    await finishSearch();
    expect(el.querySelector('[data-testid="skeleton"]')).toBeNull();
  });

  it('marks the results as out of date while the form is invalid', async () => {
    await finishSearch();
    const day = el.querySelector<HTMLInputElement>('#mission-day')!;
    day.value = '999';
    day.dispatchEvent(new Event('input'));
    await settle();
    expect(el.querySelector('[data-testid="stale-note"]')!.textContent).toMatch(/previous input/i);
    expect(el.querySelector('.result')!.classList).toContain('stale');

    day.value = '1';
    day.dispatchEvent(new Event('input'));
    await settle();
    expect(el.querySelector('[data-testid="stale-note"]')).toBeNull();
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

describe('Planner search timing', () => {
  it('searches straight away on load, and only debounces later changes', async () => {
    const search = new FakeWindowSearch();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WindowSearch, useValue: search },
        { provide: SEARCH_DEBOUNCE_MS, useValue: 60_000 },
        { provide: MISSION_STORAGE, useValue: null },
      ],
    });
    const fixture = TestBed.createComponent(Planner);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    expect(search.calls.length).toBe(1);

    const day = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#mission-day')!;
    day.value = '20';
    day.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 20));
    expect(search.calls.length).toBe(1); // still waiting for the debounce
  });
});

describe('Planner on a narrow screen', () => {
  let fixture: ComponentFixture<Planner>;
  let search: FakeWindowSearch;
  let el: HTMLElement;
  const narrow = signal(true);

  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    narrow.set(true);
    search = new FakeWindowSearch();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WindowSearch, useValue: search },
        { provide: SEARCH_DEBOUNCE_MS, useValue: 0 },
        { provide: MISSION_STORAGE, useValue: null },
        { provide: NARROW_SCREEN, useValue: narrow },
      ],
    });
    fixture = TestBed.createComponent(Planner);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label);

  it('shows the form until there are results', () => {
    expect(el.querySelector('app-mission-form')).not.toBeNull();
  });

  it('folds the form into a one-line summary once there are results, so they come first', async () => {
    search.calls[0].resolve(sampleResult());
    await settle();
    expect(el.querySelector('app-mission-form')).toBeNull();
    const summary = el.querySelector('[data-testid="mission-summary"]')!.textContent!.replace(/\s+/g, ' ');
    expect(summary).toContain('Kerbin → Duna');
    expect(summary).toContain('Year 1, Day 1');
  });

  it('opens the form again for editing, and closes it when done', async () => {
    search.calls[0].resolve(sampleResult());
    await settle();
    button('Edit')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-mission-form')).not.toBeNull();
    button('Done')!.click();
    await fixture.whenStable();
    expect(el.querySelector('app-mission-form')).toBeNull();
  });

  it('always shows the form on a wide screen', async () => {
    narrow.set(false);
    search.calls[0].resolve(sampleResult());
    await settle();
    expect(el.querySelector('app-mission-form')).not.toBeNull();
    expect(button('Edit')).toBeUndefined();
    expect(button('Done')).toBeUndefined();
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
