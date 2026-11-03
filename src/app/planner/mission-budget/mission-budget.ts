import { Component, computed, input, signal } from '@angular/core';
import { missionBudget, surfaceDeltaV } from '../budget';
import { formatDeltaV } from '../format';
import type { Mission } from '../mission';
import { BODIES } from '../../astro/bodies';
import type { TransferWindow } from '../../search/window-finder';

/** Everything the craft needs, from launch to landing back home. */
@Component({
  selector: 'app-mission-budget',
  templateUrl: './mission-budget.html',
  styleUrl: './mission-budget.scss',
})
export class MissionBudget {
  readonly mission = input.required<Mission>();
  readonly outbound = input.required<TransferWindow>();
  /** The trip home, or null while it is being searched for (or if there is none). */
  readonly homeward = input<TransferWindow | null>(null);

  protected readonly launch = signal(true);
  protected readonly land = signal(true);
  /** The breakdown is folded away until asked for: usually the total is what matters. */
  protected readonly open = signal(false);
  protected readonly comeBack = computed(() => this.mission().roundTrip && this.mission().capture);

  /** Whether the destination has a surface to land on (and you stop there at all). */
  protected readonly canLand = computed(() => {
    const m = this.mission();
    return m.capture && surfaceDeltaV(BODIES[m.destination], m.finalAltitudeKm * 1e3) !== null;
  });

  protected readonly budget = computed(() => {
    const b = missionBudget(this.mission(), this.outbound(), this.homeward(), {
      launch: this.launch(),
      land: this.land(),
      comeBack: this.comeBack(),
    });
    const show = (v: number, approximate: boolean) => `${approximate ? '~' : ''}${formatDeltaV(v)}`;
    const m = this.mission();
    const includes = [
      this.launch() && 'launch',
      'transfer',
      m.capture && this.land() && this.canLand() && 'landing',
      this.comeBack() && this.homeward() && 'trip home',
    ].filter(Boolean);
    return {
      rows: b.rows.map((r) => ({ ...r, value: show(r.deltaV, r.approximate) })),
      total: show(b.total, b.approximate),
      includes: includes.join(', '),
    };
  });
}
