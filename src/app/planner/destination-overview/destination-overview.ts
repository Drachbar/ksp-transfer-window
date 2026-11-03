import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { calendarOf, destinationsFor, nowOf, toSearchRequest, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { formatDuration, formatFlightTime, formatShortDate } from '../../astro/game-time';
import type { BodyName } from '../../astro/bodies';
import { WindowSearch } from '../../search/window-search';
import { nextBestWindow, type TransferWindow } from '../../search/window-finder';

type Row = { state: 'searching' } | { state: 'none' } | { state: 'found'; window: TransferWindow };

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** "What can I do now?": the next window to every body you can fly to from the origin. */
@Component({
  selector: 'app-destination-overview',
  templateUrl: './destination-overview.html',
  styleUrl: './destination-overview.scss',
})
export class DestinationOverview {
  private readonly windowSearch = inject(WindowSearch);

  readonly mission = input.required<Mission>();
  readonly choose = output<BodyName>();

  /** Everything that affects the searches; choosing another destination does not. */
  private readonly basis = computed(() => ({ ...this.mission(), destination: this.mission().origin }), {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  private readonly results = signal<Partial<Record<BodyName, Row>>>({});

  protected readonly rows = computed(() => {
    const m = this.mission();
    const calendar = calendarOf(m);
    const now = nowOf(m);
    const results = this.results();
    return destinationsFor(m.origin).map((destination) => {
      const row = results[destination] ?? { state: 'searching' as const };
      const w = row.state === 'found' ? row.window : null;
      return {
        destination,
        current: destination === m.destination,
        state: row.state,
        departure: w ? formatShortDate(w.departureTime, calendar) : '',
        wait: w ? (w.departureTime - now < 1 ? 'now' : `in ${formatDuration(w.departureTime - now, calendar)}`) : '',
        deltaV: w ? formatDeltaV(w.deltaV) : '',
        flightTime: w ? formatFlightTime(w.timeOfFlight, calendar) : '',
      };
    });
  });

  constructor() {
    effect((onCleanup) => {
      const mission = this.basis();
      let stale = false;
      onCleanup(() => (stale = true));
      this.results.set({});
      // One search per destination, each in its own worker slot, so they run in parallel.
      for (const destination of destinationsFor(mission.origin)) {
        const request = { ...toSearchRequest({ ...mission, destination }), windowCount: 1, suggestPlaneChange: false };
        this.windowSearch
          .search(request, undefined, `overview:${destination}`)
          .then((r) => {
            if (stale) return;
            const w = nextBestWindow(r);
            this.results.update((all) => ({ ...all, [destination]: w ? { state: 'found', window: w } : { state: 'none' } }));
          })
          .catch((e) => {
            if (!stale && !isAbort(e)) this.results.update((all) => ({ ...all, [destination]: { state: 'none' } }));
          });
      }
    });
  }
}
