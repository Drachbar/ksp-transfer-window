import { Component, computed, effect, ElementRef, inject, InjectionToken, signal, untracked, viewChild } from '@angular/core';
import { NARROW_SCREEN } from '../../narrow-screen';
import { form } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { loadStoredMission, MISSION_STORAGE, missionFromQueryParams, missionToQueryParams, restoreMission, storeMission } from '../mission-state';
import { MissionForm } from '../mission-form/mission-form';
import { WindowCard, type ReturnTrip } from '../window-card/window-card';
import { WindowList } from '../window-list/window-list';
import { DestinationOverview } from '../destination-overview/destination-overview';
import { MissionBudget } from '../mission-budget/mission-budget';
import { PorkchopPlot, type PorkchopPick } from '../porkchop-plot/porkchop-plot';
import { calendarOf, missionSchema, nowOf, plansTripHome, returnMission, sameSearch, toSearchRequest, type Mission } from '../mission';
import { formatDeltaV } from '../format';
import { formatDate, formatDuration, formatFlightTime } from '../../astro/game-time';
import { WindowSearch } from '../../search/window-search';
import { attachPlaneChangeAlternatives, describeTransfer, nextBestWindow, type TransferWindow, type WindowSearchResult } from '../../search/window-finder';
import { synodicPeriod } from '../../search/ranges';
import { BODIES, type BodyName } from '../../astro/bodies';
import { toSearchParams } from '../../search/window-search-protocol';

/** How long to wait after the last change before searching (ms). */
export const SEARCH_DEBOUNCE_MS = new InjectionToken<number>('SEARCH_DEBOUNCE_MS', { providedIn: 'root', factory: () => 300 });


/** How many windows home to look for. */
const RETURN_WINDOW_COUNT = 3;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

@Component({
  selector: 'app-planner',
  imports: [MissionForm, WindowCard, WindowList, PorkchopPlot, DestinationOverview, MissionBudget],
  templateUrl: './planner.html',
  styleUrl: './planner.scss',
})
export class Planner {
  private readonly windowSearch = inject(WindowSearch);
  private readonly debounceMs = inject(SEARCH_DEBOUNCE_MS);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storage = inject(MISSION_STORAGE);

  /** A shared link wins over the last visit, which wins over the defaults. */
  protected readonly mission = signal<Mission>(
    restoreMission(
      missionFromQueryParams((key) => this.route.snapshot.queryParamMap.get(key)),
      loadStoredMission(this.storage),
    ),
  );
  protected readonly missionForm = form(this.mission, missionSchema);

  protected readonly result = signal<WindowSearchResult | null>(null);
  /** The mission the current result was computed for (the form may have moved on). */
  protected readonly resultMission = signal<Mission>(this.mission());
  /** Search progress in [0, 1], or null when not searching. */
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal(0);
  private searchedOnce = false;
  /** The latest mission searched for (or one that searches for the same windows). */
  private searched: Mission | null = null;
  /** A transfer picked in the porkchop plot; shown instead of the selected window. */
  protected readonly picked = signal<TransferWindow | null>(null);
  /** What the picked transfer is: a point from the plot, a suggested plane change or the trip home. */
  private readonly pickedLabel = signal('Selected point');
  /** The mission the picked transfer belongs to when it is not the searched one (the trip home). */
  private readonly pickedMission = signal<Mission | null>(null);
  /** The way home from the window that is shown. */
  private readonly returnTrip = signal<ReturnTrip | null>(null);
  /** The window to plan the way home from; only changes when the transfer does (not when tips are added). */
  private readonly outbound = computed(() => (this.pickedMission() ? null : (this.selectedWindow() ?? null)), {
    equal: (a, b) => a === b || (!!a && !!b && a.departureTime === b.departureTime && a.timeOfFlight === b.timeOfFlight),
  });

  /** The card shows the trip home itself (not an outbound transfer). */
  protected readonly showingTripHome = computed(() => this.pickedMission() !== null);
  /** The window home from the transfer that is shown, once found. */
  protected readonly homewardWindow = computed(() => {
    const trip = this.returnTrip();
    return trip?.state === 'found' ? trip.window : null;
  });
  protected readonly cardMission = computed(() => this.pickedMission() ?? this.resultMission());
  /** The trip home waits from your arrival, not from today. */
  protected readonly cardCountdownFrom = computed(() => (this.pickedMission() ? 'after you arrive' : null));
  /** No "return" step on the trip home itself. */
  protected readonly cardReturnTrip = computed(() => (this.pickedMission() ? null : this.returnTrip()));
  protected readonly showPlot = signal(false);
  protected readonly showOverview = signal(false);

  protected readonly narrow = inject(NARROW_SCREEN);
  /** On a narrow screen the form folds away once there are results; this opens it again. */
  protected readonly editing = signal(false);
  protected readonly formOpen = computed(() => !this.narrow() || this.editing() || !this.result());
  protected readonly missionSummary = computed(() => {
    const m = this.mission();
    return {
      route: `${m.origin} → ${m.destination}`,
      date: `Year ${m.year}, Day ${m.day}`,
      orbits: m.capture ? `${m.initialAltitudeKm} km → ${m.finalAltitudeKm} km` : `${m.initialAltitudeKm} km, flyby`,
    };
  });
  private readonly card = viewChild('card', { read: ElementRef });

  protected readonly pickedSummary = computed(() => {
    const p = this.picked();
    if (!p) return null;
    const calendar = calendarOf(this.resultMission());
    return { departure: formatDate(p.departureTime, calendar), flight: formatFlightTime(p.timeOfFlight, calendar), deltaV: formatDeltaV(p.deltaV) };
  });

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

  /** The window chosen in the list; the porkchop plot is centred on it. */
  protected readonly listWindow = computed(() => this.options()[this.selected()]);
  protected readonly selectedWindow = computed(() => this.picked() ?? this.listWindow());
  protected readonly heading = computed(() => {
    if (this.picked()) return this.pickedLabel();
    const i = this.selected() - (this.leaveNow() ? 1 : 0);
    return i < 0 ? 'Leave now' : i === 0 ? 'Next window' : `Window ${i + 1}`;
  });
  /** The form no longer describes the results (and cannot, until it is valid again). */
  protected readonly outOfDate = computed(() => !!this.result() && !this.missionForm().valid());
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
      // Only the trip home changed: keep the windows (and the one chosen), just plan the way home again.
      if (this.searched && sameSearch(this.searched, mission)) {
        this.searched = mission;
        this.remember(mission);
        if (untracked(this.progress) === null) this.resultMission.set(mission);
        return;
      }
      // Debounce typing, but do not keep the first search waiting: there is nothing to wait for.
      const delay = this.searchedOnce ? this.debounceMs : 0;
      this.searchedOnce = true;
      const timer = setTimeout(() => this.search(mission), delay);
      onCleanup(() => clearTimeout(timer));
    });

    // Look for the way home from the window that is shown.
    effect((onCleanup) => {
      const outbound = this.outbound();
      const mission = this.resultMission();
      if (!outbound || !plansTripHome(mission)) {
        this.returnTrip.set(null);
        return;
      }
      let stale = false;
      onCleanup(() => (stale = true));
      const home = returnMission(mission, outbound);
      this.returnTrip.set({ state: 'searching' });
      this.windowSearch
        .search({ ...toSearchRequest(home), windowCount: RETURN_WINDOW_COUNT, suggestPlaneChange: false }, undefined, 'return')
        .then((r) => {
          if (stale) return;
          const best = nextBestWindow(r);
          this.returnTrip.set(best ? { state: 'found', window: best, mission: home } : { state: 'none' });
        })
        .catch((e) => {
          if (!stale && !isAbort(e)) this.returnTrip.set({ state: 'none' });
        });
    });
  }

  private async search(mission: Mission) {
    this.searched = mission;
    this.remember(mission);
    this.progress.set(0);
    this.error.set(null);
    const request = toSearchRequest(mission);
    // Plane-change alternatives take a few times longer than the windows themselves: look for them
    // in a second worker at the same time, and add the tips to the windows when they arrive.
    const alternatives = this.windowSearch.search(
      { ...request, transferType: 'optimal', windowCount: (request.windowCount ?? 5) + 2, suggestPlaneChange: false },
      undefined,
      'planeChange',
    );
    alternatives.catch(() => {}); // a failure only means no tips
    try {
      const result = await this.windowSearch.search({ ...request, suggestPlaneChange: false }, (f) => this.progress.set(f));
      this.result.set(result);
      void this.addPlaneChangeTips(result, alternatives, mission);
      // The trip home may have changed while searching.
      this.resultMission.set(this.searched && sameSearch(this.searched, mission) ? this.searched : mission);
      this.selected.set(0);
      this.picked.set(null);
      this.pickedMission.set(null);
      this.progress.set(null);
    } catch (e) {
      if (isAbort(e)) return; // superseded by a newer search
      this.progress.set(null);
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  private async addPlaneChangeTips(result: WindowSearchResult, alternatives: Promise<WindowSearchResult>, mission: Mission) {
    try {
      const { windows } = await alternatives;
      if (this.result() !== result) return; // a newer search has replaced these windows
      const S = synodicPeriod(BODIES[mission.origin], BODIES[mission.destination]);
      this.result.set({ ...result, windows: attachPlaneChangeAlternatives(result.windows, windows, S) });
    } catch {
      // No tips then.
    }
  }

  protected selectFromList(index: number) {
    this.selected.set(index);
    this.picked.set(null);
    this.pickedMission.set(null);
  }

  protected pickFromPlot({ departureTime, timeOfFlight }: PorkchopPick) {
    const params = toSearchParams(toSearchRequest(this.resultMission()));
    this.pickedLabel.set('Selected point');
    this.pickedMission.set(null);
    this.picked.set(describeTransfer(params, departureTime, timeOfFlight));
  }

  protected showPlaneChange(alternative: TransferWindow) {
    this.pickedLabel.set('With mid-course plane change');
    this.pickedMission.set(null);
    this.picked.set(alternative);
  }

  protected showReturnTrip() {
    const trip = this.returnTrip();
    if (trip?.state !== 'found') return;
    this.pickedLabel.set(`Return to ${trip.mission.destination}`);
    this.pickedMission.set(trip.mission);
    this.picked.set(trip.window);
  }

  protected chooseDestination(destination: BodyName) {
    this.missionForm.destination().value.set(destination);
    this.showCard();
  }

  protected showCard() {
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    (this.card()?.nativeElement as HTMLElement | undefined)?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /** Makes the search shareable (URL) and restorable (local storage). */
  private remember(mission: Mission) {
    storeMission(this.storage, mission);
    void this.router.navigate([], { relativeTo: this.route, queryParams: missionToQueryParams(mission), replaceUrl: true });
  }
}
