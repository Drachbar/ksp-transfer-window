import { Component, computed, effect, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { calendarOf, destinationsFor, ORIGIN_GROUPS, withValidDestination, type Mission } from '../mission';
import { addDays } from '../../astro/game-time';

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
  protected readonly calendar = computed(() => calendarOf({ calendar: this.form().calendar().value() }));

  constructor() {
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
