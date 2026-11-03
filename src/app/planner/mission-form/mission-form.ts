import { Component, computed, effect, input, signal } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { calendarOf, destinationsFor, ORIGIN_GROUPS, withValidDestination, type Mission } from '../mission';
import { addDays } from '../../astro/game-time';
import { BODIES } from '../../astro/bodies';

/** Where you are, where you are going and what day it is in your game. */
@Component({
  selector: 'app-mission-form',
  imports: [FormField],
  templateUrl: './mission-form.html',
  styleUrl: './mission-form.scss',
})
export class MissionForm {
  readonly form = input.required<FieldTree<Mission>>();

  protected readonly originGroups = ORIGIN_GROUPS;
  protected readonly destinations = computed(() => destinationsFor(this.form().origin().value()));
  /** How you arrive: burn into orbit, let the atmosphere capture you, or fly past (no capture). */
  protected readonly arrival = computed(() => {
    const f = this.form();
    return !f.capture().value() ? 'flyby' : f.aerobrake().value() ? 'aerobrake' : 'burn';
  });

  /** Aerobraking at the destination needs an atmosphere there. */
  protected readonly canAerobrake = computed(() => BODIES[this.form().destination().value()].atmosphereHeight > 0);

  /** The options most people never change are folded away, unless one of them needs fixing. */
  protected readonly showMore = signal(false);
  protected readonly moreOpen = computed(() => {
    const f = this.form();
    return this.showMore() || f.initialAltitudeKm().invalid() || f.finalAltitudeKm().invalid() || f.maxFlightDays().invalid();
  });
  /** What the folded options are set to, e.g. "100 km → 100 km · Kerbin time · no time limit". */
  protected readonly moreSummary = computed(() => {
    const m = this.form()().value();
    return [
      m.capture ? `${m.initialAltitudeKm} km → ${m.finalAltitudeKm} km` : `${m.initialAltitudeKm} km parking orbit`,
      m.calendar === 'earth' ? 'Earth time' : 'Kerbin time',
      m.maxFlightDays === null ? 'no time limit' : `max ${m.maxFlightDays} days`,
    ].join(' · ');
  });

  /** Whether home has an atmosphere to aerobrake in on the way back. */
  protected readonly homeHasAtmosphere = computed(() => BODIES[this.form().origin().value()].atmosphereHeight > 0);

  protected setArrival(arrival: 'burn' | 'aerobrake' | 'flyby') {
    const f = this.form();
    f.capture().value.set(arrival !== 'flyby');
    f.aerobrake().value.set(arrival === 'aerobrake');
  }

  protected readonly calendar = computed(() => calendarOf({ calendar: this.form().calendar().value() }));

  constructor() {
    // A destination without air cannot aerobrake: fall back to burning into orbit.
    effect(() => {
      const f = this.form();
      if (f.aerobrake().value() && !this.canAerobrake()) f.aerobrake().value.set(false);
    });

    // Keep the destination reachable when the origin moves to another system.
    effect(() => {
      const f = this.form();
      const mission = f().value();
      const fixed = withValidDestination(mission);
      if (fixed !== mission) f.destination().value.set(fixed.destination);
    });
  }

  protected advance(days: number) {
    const f = this.form();
    const next = addDays({ year: f.year().value(), day: f.day().value() }, days, this.calendar());
    f.year().value.set(next.year);
    f.day().value.set(next.day);
  }

  /** The first error to show for a field, once the user has touched it. */
  protected error(field: FieldTree<number> | FieldTree<number | null>): string | undefined {
    const state = field();
    if (!state.invalid() || !(state.dirty() || state.touched())) return undefined;
    return state.errors()[0]?.message;
  }
}
