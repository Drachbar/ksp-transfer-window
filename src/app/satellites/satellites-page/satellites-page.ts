import { Component, computed, effect, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { ConstellationDiagram } from '../constellation-diagram/constellation-diagram';
import { DEFAULT_PLAN, evaluatePlan, planFromQueryParams, planSchema, planToQueryParams, type SatellitePlan } from '../plan';
import { DSN_LEVELS, RELAY_ANTENNAS } from '../comms';
import { formatDeltaV, formatDistance } from '../../planner/format';
import { formatPeriod, KERBIN_CALENDAR } from '../../astro/game-time';
import { BODIES, BODY_NAMES } from '../../astro/bodies';

const direction = (dv: number) => (dv >= 0 ? 'prograde' : 'retrograde');
/** Orbital periods in Kerbin days and hours, to the hundredth of a second: small errors add up over many orbits. */
const period = (t: number) => formatPeriod(t, KERBIN_CALENDAR);

/** Plan a network of evenly spaced satellites: stationary orbits, resonant deployment, CommNet range. */
@Component({
  selector: 'app-satellites-page',
  imports: [FormField, ConstellationDiagram],
  templateUrl: './satellites-page.html',
  styleUrl: './satellites-page.scss',
})
export class SatellitesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly bodies = BODY_NAMES;
  protected readonly antennas = RELAY_ANTENNAS;
  protected readonly dsnLevels = DSN_LEVELS;

  protected readonly plan = signal<SatellitePlan>({
    ...DEFAULT_PLAN,
    ...planFromQueryParams((key) => this.route.snapshot.queryParamMap.get(key)),
  });
  protected readonly planForm = form(this.plan, planSchema);

  /** What the game's contracts call it: keostationary around Kerbin, stationary elsewhere. */
  protected readonly stationaryName = computed(() => (this.plan().body === 'Kerbin' ? 'Keostationary' : 'Stationary'));

  protected readonly result = computed(() => (this.planForm().valid() ? evaluatePlan(this.plan()) : null));

  protected readonly view = computed(() => {
    const r = this.result();
    if (!r) return null;
    const c = r.constellation;
    const p = this.plan();
    const body = BODIES[p.body];
    const releaseAltitude = formatDistance(c.target.altitude);
    const otherApsis = c.releaseAt === 'apoapsis' ? c.deployment.periapsis : c.deployment.apoapsis;
    return {
      body,
      target: releaseAltitude,
      period: period(c.target.period),
      carrierDeltaV: formatDeltaV(Math.abs(c.carrierBurns[0]) + Math.abs(c.carrierBurns[1])),
      satelliteDeltaV: formatDeltaV(c.satelliteBurn),
      steps: [
        `From your ${formatDistance(p.parkingAltitudeKm * 1e3)} parking orbit, burn ${formatDeltaV(Math.abs(c.carrierBurns[0]))} ${direction(c.carrierBurns[0])} to raise your apoapsis to ${releaseAltitude}.`,
        `At apoapsis, burn ${formatDeltaV(Math.abs(c.carrierBurns[1]))} ${direction(c.carrierBurns[1])} to put the other side of your orbit at ${formatDistance(otherApsis - body.radius)}. The carrier now comes back to this point every ${period(c.deployment.period)}.`,
        `Each time the carrier reaches ${c.releaseAt}, release a satellite and burn ${formatDeltaV(c.satelliteBurn)} ${c.satelliteBurnDirection} with it to circularise. After ${p.count} laps all ${p.count} satellites are in place, ${formatDistance(c.spacing)} apart.`,
      ],
      deployment: {
        periapsis: formatDistance(c.deployment.periapsis - body.radius),
        apoapsis: formatDistance(c.deployment.apoapsis - body.radius),
        period: period(c.deployment.period),
      },
      spacing: formatDistance(c.spacing),
      lineOfSight: c.lineOfSightAltitude === null ? '–' : formatDistance(c.lineOfSightAltitude),
      problems: c.problems,
      comms: {
        neighbours: { ...r.comms.neighbours, distance: formatDistance(r.comms.neighbours.distance), range: formatDistance(r.comms.neighbours.range) },
        home: { ...r.comms.home, distance: formatDistance(r.comms.home.distance), range: formatDistance(r.comms.home.range) },
        antenna: r.antenna.name,
        dsn: DSN_LEVELS[p.dsnLevel].name,
        atHome: body === BODIES.Kerbin,
      },
    };
  });

  constructor() {
    // Keep the URL in step with a valid plan, so it can be shared.
    effect(() => {
      if (!this.planForm().valid()) return;
      void this.router.navigate([], { relativeTo: this.route, queryParams: planToQueryParams(this.plan()), replaceUrl: true });
    });
  }

  protected setDsnLevel(value: string) {
    this.planForm.dsnLevel().value.set(Number(value));
  }

  /** The first error to show for a field. */
  protected error(field: { (): { invalid(): boolean; errors(): { message?: string }[] } }): string | undefined {
    const state = field();
    return state.invalid() ? state.errors()[0]?.message : undefined;
  }
}
