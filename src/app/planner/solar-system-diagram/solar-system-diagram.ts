import { Component, computed, input, signal } from '@angular/core';
import { describePhase, layoutSystem, type Point } from './solar-system-layout';
import { nowOf, type Mission } from '../mission';
import { BODIES } from '../../astro/bodies';
import type { TransferWindow } from '../../search/window-finder';

const RADIUS = 100;
const ARC_RADIUS = 24;
const round = (v: number) => Math.round(v * 100) / 100;

/** Pushes a label a little further out from the centre than the point it labels. */
const outward = (p: Point, by: number): Point => {
  const r = Math.hypot(p.x, p.y) || 1;
  return { x: round(p.x + (p.x / r) * by), y: round(p.y + (p.y / r) * by) };
};

/** The whole system seen from above, origin at the bottom: do the planets line up? */
@Component({
  selector: 'app-solar-system-diagram',
  templateUrl: './solar-system-diagram.html',
  styleUrl: './solar-system-diagram.scss',
})
export class SolarSystemDiagram {
  readonly window = input.required<TransferWindow>();
  readonly mission = input.required<Mission>();

  protected readonly mode = signal<'departure' | 'now'>('departure');

  private readonly layoutAt = (time: number, withTransfer: boolean) => {
    const m = this.mission();
    const w = this.window();
    return layoutSystem({
      origin: BODIES[m.origin],
      destination: BODIES[m.destination],
      time,
      radius: RADIUS,
      transfer: withTransfer ? { departureVelocity: w.departureVelocity, arrivalTime: w.arrivalTime } : undefined,
    });
  };

  private readonly atDeparture = computed(() => this.layoutAt(this.window().departureTime, true));
  private readonly atNow = computed(() => this.layoutAt(nowOf(this.mission()), false));

  protected readonly layout = computed(() => (this.mode() === 'now' ? this.atNow() : this.atDeparture()));

  protected readonly labels = computed(() =>
    this.layout()
      .bodies.filter((b) => b.role !== 'other')
      .map((b) => ({ name: b.name, ...outward(b, 13) })),
  );

  /** Arc from the origin's direction (straight down) to the destination's, showing the phase angle. */
  protected readonly phaseArc = computed(() => {
    const phase = this.layout().phaseAngle;
    const x = round(ARC_RADIUS * Math.sin(phase));
    const y = round(ARC_RADIUS * Math.cos(phase));
    return `M 0 ${ARC_RADIUS} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 ${phase > 0 ? 0 : 1} ${x} ${y}`;
  });

  private readonly describe = (phase: number) => describePhase(this.mission().destination, this.mission().origin, phase);
  protected readonly departureText = computed(() => this.describe(this.atDeparture().phaseAngle));
  protected readonly nowText = computed(() => this.describe(this.atNow().phaseAngle));
  protected readonly label = computed(() => (this.mode() === 'now' ? `Now, ${this.nowText()}` : `At departure, ${this.departureText()}`));
}
