import { Component, computed, effect, inject, InjectionToken, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { MissionForm } from '../mission-form/mission-form';
import { WindowCard } from '../window-card/window-card';
import { WindowList } from '../window-list/window-list';
import { calendarOf, DEFAULT_MISSION, missionSchema, nowOf, toSearchRequest, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { formatDuration } from '../../astro/game-time';
import { WindowSearch } from '../../search/window-search';
import type { WindowSearchResult } from '../../search/window-finder';

/** How long to wait after the last change before searching (ms). */
export const SEARCH_DEBOUNCE_MS = new InjectionToken<number>('SEARCH_DEBOUNCE_MS', { providedIn: 'root', factory: () => 300 });

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

@Component({
  selector: 'app-planner',
  imports: [MissionForm, WindowCard, WindowList],
  templateUrl: './planner.html',
  styleUrl: './planner.scss',
})
export class Planner {
  private readonly windowSearch = inject(WindowSearch);
  private readonly debounceMs = inject(SEARCH_DEBOUNCE_MS);

  protected readonly mission = signal<Mission>(DEFAULT_MISSION);
  protected readonly missionForm = form(this.mission, missionSchema);

  protected readonly result = signal<WindowSearchResult | null>(null);
  /** The mission the current result was computed for (the form may have moved on). */
  protected readonly resultMission = signal<Mission>(DEFAULT_MISSION);
  /** Search progress in [0, 1], or null when not searching. */
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal(0);

  /** Leaving right now, when that is cheaper than waiting for the next window (e.g. a window that is open now). */
  private readonly leaveNow = computed(() => {
    const r = this.result();
    const now = r?.departNow;
    return now && (!r.windows[0] || now.deltaV < r.windows[0].deltaV) ? now : null;
  });

  /** What to choose between: the upcoming windows, preceded by "now" when that is the better deal. */
  protected readonly options = computed(() => {
    const windows = this.result()?.windows ?? [];
    const now = this.leaveNow();
    return now ? [now, ...windows] : windows;
  });

  protected readonly selectedWindow = computed(() => this.options()[this.selected()]);
  protected readonly heading = computed(() => {
    const i = this.selected() - (this.leaveNow() ? 1 : 0);
    return i < 0 ? 'Leave now' : i === 0 ? 'Next window' : `Window ${i + 1}`;
  });
  protected readonly progressPercent = computed(() => Math.round((this.progress() ?? 0) * 100));

  /** "Leaving now costs … Waiting … for the next window saves …" */
  protected readonly summary = computed(() => {
    const result = this.result();
    const now = result?.departNow;
    const next = result?.windows[0];
    if (!result || !next) return null;
    const mission = this.resultMission();
    const wait = formatDuration(next.departureTime - nowOf(mission), calendarOf(mission));
    if (!now) return { kind: 'no-now' as const, wait };
    const saving = now.deltaV - next.deltaV;
    if (saving < 0) return { kind: 'go-now' as const, now: formatDeltaV(now.deltaV), next: formatDeltaV(next.deltaV), wait };
    if (saving < 1) return { kind: 'same' as const, now: formatDeltaV(now.deltaV) };
    return { kind: 'wait' as const, now: formatDeltaV(now.deltaV), wait, saves: formatDeltaV(saving) };
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.missionForm().valid()) return;
      const mission = this.mission();
      const timer = setTimeout(() => this.search(mission), this.debounceMs);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private async search(mission: Mission) {
    this.progress.set(0);
    this.error.set(null);
    try {
      const result = await this.windowSearch.search(toSearchRequest(mission), (f) => this.progress.set(f));
      this.result.set(result);
      this.resultMission.set(mission);
      this.selected.set(0);
      this.progress.set(null);
    } catch (e) {
      if (isAbort(e)) return; // superseded by a newer search
      this.progress.set(null);
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }
}
