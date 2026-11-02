import { Component, computed, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { axisTicks, cellAt, deltaVScale, paint, RAMPS, type Cell, type PlotTheme } from './porkchop-scale';
import { calendarOf, nowOf, toSearchRequest, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { formatDate, formatDuration, toGameDate, type Calendar } from '../../astro/game-time';
import { BODIES } from '../../astro/bodies';
import { synodicPeriod } from '../../search/ranges';
import { WindowSearch } from '../../search/window-search';
import { departureTimeAt, timeOfFlightAt } from '../../search/porkchop';
import type { PorkchopResult } from '../../search/window-search-protocol';
import type { TransferWindow } from '../../search/window-finder';

export interface PorkchopPick {
  departureTime: number;
  timeOfFlight: number;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
const shortDate = (t: number, c: Calendar) => {
  const d = toGameDate(t, c);
  return `Y${d.year} D${d.day}`;
};
const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Δv for every departure time × time of flight around a window. Click a point to see that transfer. */
@Component({
  selector: 'app-porkchop-plot',
  templateUrl: './porkchop-plot.html',
  styleUrl: './porkchop-plot.scss',
})
export class PorkchopPlot {
  private readonly windowSearch = inject(WindowSearch);

  readonly mission = input.required<Mission>();
  /** Windows to mark on the plot. */
  readonly windows = input<TransferWindow[]>([]);
  /** The plot spans one synodic period centred on this window. */
  readonly center = input.required<TransferWindow>();
  /** Cells per axis. */
  readonly resolution = input(300);
  readonly pick = output<PorkchopPick>();

  protected readonly grid = signal<PorkchopResult | null>(null);
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  /** The cell under the pointer or keyboard cursor. */
  protected readonly cursor = signal<Cell | null>(null);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = signal<PlotTheme>(prefersDark() ? RAMPS.dark : RAMPS.light);

  protected readonly calendar = computed(() => calendarOf(this.mission()));
  /** Cheap is dark on a light background and light on a dark one. */
  protected readonly cheapEnd = computed(() => (this.theme() === RAMPS.dark ? 'Lighter' : 'Darker'));
  protected readonly scale = computed(() => {
    const g = this.grid();
    return g ? deltaVScale(g.deltaVs) : null;
  });

  protected readonly xTicks = computed(() => {
    const g = this.grid();
    if (!g) return [];
    return axisTicks(g.earliestDeparture, g.departureSpan, 5).map((t) => ({ at: t.at, label: shortDate(t.value, this.calendar()) }));
  });

  protected readonly yTicks = computed(() => {
    const g = this.grid();
    if (!g) return [];
    const day = this.calendar().hoursPerDay * 3600;
    return axisTicks(g.shortestTimeOfFlight, g.timeOfFlightSpan, 5).map((t) => ({ at: t.at, label: `${Math.round(t.value / day)}d` }));
  });

  protected readonly legend = computed(() => {
    const s = this.scale();
    if (!s || !Number.isFinite(s.min)) return null;
    const ramp = this.theme().ramp;
    const stops = ramp.map((c, i) => `${c} ${(i / (ramp.length - 1)) * 100}%`).join(', ');
    return {
      gradient: `linear-gradient(to right, ${stops})`,
      min: formatDeltaV(s.min),
      mid: formatDeltaV(Math.sqrt(s.min * s.max)),
      max: formatDeltaV(s.max),
      impossible: this.theme().impossible,
    };
  });

  /** Windows inside the plot, as percentages of its width and height. */
  protected readonly markers = computed(() => {
    const g = this.grid();
    if (!g) return [];
    const center = this.center();
    return this.windows()
      .map((w) => ({
        x: ((w.departureTime - g.earliestDeparture) / g.departureSpan) * 100,
        y: ((w.timeOfFlight - g.shortestTimeOfFlight) / g.timeOfFlightSpan) * 100,
        selected: w.departureTime === center.departureTime,
        label: `Window ${formatDate(w.departureTime, this.calendar())}, ${formatDeltaV(w.deltaV)}`,
      }))
      .filter((m) => m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 100);
  });

  /** Crosshair and tooltip for the cursor cell. */
  protected readonly hover = computed(() => {
    const g = this.grid();
    const c = this.cursor();
    if (!g || !c) return null;
    const x = ((c.i + 0.5) / g.width) * 100;
    const y = ((c.j + 0.5) / g.height) * 100;
    const cal = this.calendar();
    return {
      x,
      y,
      alignRight: x > 60,
      alignBelow: y > 70,
      departure: formatDate(c.departureTime, cal),
      flight: formatDuration(c.timeOfFlight, cal),
      arrival: formatDate(c.departureTime + c.timeOfFlight, cal),
      deltaV: Number.isFinite(c.deltaV) ? formatDeltaV(c.deltaV) : 'No transfer possible',
    };
  });

  protected readonly description = computed(() => {
    const g = this.grid();
    if (!g) return 'Porkchop plot (loading)';
    const cal = this.calendar();
    const from = formatDate(g.earliestDeparture, cal);
    const to = formatDate(g.earliestDeparture + g.departureSpan, cal);
    if (g.minIndex < 0) return `Porkchop plot for departures from ${from} to ${to}: no transfers possible.`;
    const i = g.minIndex % g.width;
    const j = Math.floor(g.minIndex / g.width);
    return (
      `Porkchop plot of total Δv for departures from ${from} to ${to}. ` +
      `Cheapest: ${formatDeltaV(g.minDeltaV)}, departing ${formatDate(departureTimeAt(g, i), cal)} ` +
      `with a flight time of ${formatDuration(timeOfFlightAt(g, j), cal)}. Use the arrow keys to explore and Enter to select.`
    );
  });

  constructor() {
    // Fetch the grid when the mission or the centre window changes.
    effect((onCleanup) => {
      const mission = this.mission();
      const center = this.center();
      const resolution = this.resolution();
      const S = synodicPeriod(BODIES[mission.origin], BODIES[mission.destination]);
      const earliestDeparture = Math.max(nowOf(mission), center.departureTime - S / 2);
      let stale = false;
      onCleanup(() => (stale = true));

      this.progress.set(0);
      this.error.set(null);
      this.cursor.set(null);
      this.windowSearch
        .porkchop(
          { ...toSearchRequest(mission), earliestDeparture, departureSpan: S, width: resolution, height: resolution },
          (f) => !stale && this.progress.set(f),
        )
        .then((grid) => {
          if (stale) return;
          this.grid.set(grid);
          this.progress.set(null);
        })
        .catch((e) => {
          if (stale || isAbort(e)) return;
          this.progress.set(null);
          this.error.set(e instanceof Error ? e.message : String(e));
        });
    });

    // Follow the OS colour scheme.
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-color-scheme: dark)');
      const update = () => this.theme.set(query.matches ? RAMPS.dark : RAMPS.light);
      query.addEventListener?.('change', update);
    }

    // Draw the grid.
    effect(() => {
      const g = this.grid();
      const s = this.scale();
      const canvas = this.canvas()?.nativeElement;
      const ctx = canvas?.getContext('2d');
      if (!g || !s || !canvas || !ctx) return;
      canvas.width = g.width;
      canvas.height = g.height;
      const image = ctx.createImageData(g.width, g.height);
      paint(g, s, this.theme(), image.data);
      ctx.putImageData(image, 0, 0);
    });
  }

  private cellFromEvent(event: MouseEvent): Cell | null {
    const g = this.grid();
    if (!g) return null;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return cellAt(g, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  }

  protected onPointerMove(event: MouseEvent) {
    this.cursor.set(this.cellFromEvent(event));
  }

  protected onClick(event: MouseEvent) {
    const cell = this.cellFromEvent(event);
    if (cell) this.select(cell);
  }

  protected onFocus() {
    const g = this.grid();
    if (!g || this.cursor()) return;
    // Start at the centre window if it is on the plot, otherwise at the cheapest cell.
    const c = this.center();
    const fx = (c.departureTime - g.earliestDeparture) / g.departureSpan;
    const fy = 1 - (c.timeOfFlight - g.shortestTimeOfFlight) / g.timeOfFlightSpan;
    const start = cellAt(g, fx, fy);
    if (start) this.cursor.set(start);
    else if (g.minIndex >= 0) this.moveTo(g.minIndex % g.width, Math.floor(g.minIndex / g.width));
  }

  protected onKeydown(event: KeyboardEvent) {
    const g = this.grid();
    if (!g) return;
    if (!this.cursor()) this.onFocus();
    const c = this.cursor();
    if (!c) return;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (event.key in moves) {
      const [di, dj] = moves[event.key];
      this.moveTo(c.i + di, c.j + dj);
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      this.select(c);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      this.cursor.set(null);
    }
  }

  private moveTo(i: number, j: number) {
    const g = this.grid()!;
    const ci = Math.min(g.width - 1, Math.max(0, i));
    const cj = Math.min(g.height - 1, Math.max(0, j));
    this.cursor.set({
      i: ci,
      j: cj,
      departureTime: departureTimeAt(g, ci),
      timeOfFlight: timeOfFlightAt(g, cj),
      deltaV: g.deltaVs[cj * g.width + ci],
    });
  }

  private select(cell: Cell) {
    if (!Number.isFinite(cell.deltaV)) return;
    this.pick.emit({ departureTime: cell.departureTime, timeOfFlight: cell.timeOfFlight });
  }
}
