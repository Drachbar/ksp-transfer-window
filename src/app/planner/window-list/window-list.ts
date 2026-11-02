import { Component, computed, input, model } from '@angular/core';
import { calendarOf, nowOf, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { formatDuration, formatShortDate } from '../../astro/game-time';
import type { TransferWindow } from '../../search/window-finder';

/** The upcoming windows; pick one to see its details. */
@Component({
  selector: 'app-window-list',
  templateUrl: './window-list.html',
  styleUrl: './window-list.scss',
})
export class WindowList {
  readonly windows = input.required<TransferWindow[]>();
  readonly mission = input.required<Mission>();
  /** Index of the selected window. */
  readonly selected = model(0);

  protected readonly rows = computed(() => {
    const windows = this.windows();
    const calendar = calendarOf(this.mission());
    const now = nowOf(this.mission());
    const cheapest = windows.reduce((best, w, i) => (w.deltaV < windows[best].deltaV ? i : best), 0);
    return windows.map((w, i) => {
      const row = {
        departure: formatShortDate(w.departureTime, calendar),
        wait: w.departureTime - now < 1 ? 'now' : `in ${formatDuration(w.departureTime - now, calendar)}`,
        flightTime: formatDuration(w.timeOfFlight, calendar),
        deltaV: formatDeltaV(w.deltaV),
        cheapest: i === cheapest,
      };
      return {
        ...row,
        label: `${row.departure}, ${row.wait}, flight ${row.flightTime}, ${row.deltaV}${row.cheapest ? ', cheapest' : ''}`,
      };
    });
  });
}
