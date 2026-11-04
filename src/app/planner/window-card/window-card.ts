import { Component, computed, input, output } from '@angular/core';
import { EjectionDiagram } from '../ejection-diagram/ejection-diagram';
import { SolarSystemDiagram } from '../solar-system-diagram/solar-system-diagram';
import { aerobrakesAt, calendarOf, nowOf, type Mission } from '../mission';
import { arrivalExcessSpeed, entrySpeed, periapsisRaiseAfterAerocapture } from '../aerobraking';
import { burnParts, formatAngle, formatDeltaV, formatSignedDeltaV } from '../format';
import { describePhase } from '../solar-system-diagram/solar-system-layout';
import { formatDate, formatDuration, formatFlightTime, formatShortDate } from '../../astro/game-time';
import { BODIES } from '../../astro/bodies';
import type { TransferWindow } from '../../search/window-finder';

/** The way home from this window: still searching, found (with the mission for the trip home), or none. */
export type ReturnTrip = { state: 'searching' } | { state: 'none' } | { state: 'found'; window: TransferWindow; mission: Mission };

/** Everything you need to fly one transfer window. */
@Component({
  selector: 'app-window-card',
  imports: [EjectionDiagram, SolarSystemDiagram],
  templateUrl: './window-card.html',
  styleUrl: './window-card.scss',
})
export class WindowCard {
  readonly window = input.required<TransferWindow>();
  readonly mission = input.required<Mission>();
  readonly heading = input.required<string>();
  /** What the countdown is relative to; by default the current game time ("in 236d"). */
  readonly countdownFrom = input<string | null>(null);
  /** Asks to show the suggested plane-change transfer instead. */
  readonly showAlternative = output<TransferWindow>();
  /** The trip home after this window; null when there is none to plan (e.g. a flyby). */
  readonly returnTrip = input<ReturnTrip | null>(null);
  /** Asks to show the return trip in detail. */
  readonly showReturn = output<void>();

  protected readonly homeView = computed(() => {
    const trip = this.returnTrip();
    if (trip?.state !== 'found') return null;
    const calendar = calendarOf(this.mission());
    const home = trip.window;
    return {
      departure: formatDate(home.departureTime, calendar),
      wait: formatDuration(home.departureTime - this.window().arrivalTime, calendar),
      deltaV: formatDeltaV(home.deltaV),
      flightTime: formatFlightTime(home.timeOfFlight, calendar),
      arrival: formatDate(home.arrivalTime, calendar),
      roundTrip: formatDeltaV(this.window().deltaV + home.deltaV),
    };
  });

  protected readonly view = computed(() => {
    const w = this.window();
    const m = this.mission();
    const calendar = calendarOf(m);
    const wait = w.departureTime - nowOf(m);
    const destination = BODIES[m.destination];
    const fix = aerobrakesAt(m) ? periapsisRaiseAfterAerocapture(destination, m.finalAltitudeKm * 1e3) : null;
    const aerobrake = aerobrakesAt(m)
      ? { fix: fix === null ? null : formatDeltaV(fix), entrySpeed: formatDeltaV(entrySpeed(destination, arrivalExcessSpeed(w, destination))) }
      : null;
    return {
      departure: formatDate(w.departureTime, calendar),
      departureShort: formatShortDate(w.departureTime, calendar),
      alignment: describePhase(m.destination, m.origin, w.phaseAngle),
      burn: burnParts(w.details.ejectionProgradeDeltaV, w.details.ejectionNormalDeltaV),
      countdown: wait < 1 ? 'now' : this.countdownFrom() ? `${formatDuration(wait, calendar)} ${this.countdownFrom()}` : `in ${formatDuration(wait, calendar)}`,
      total: formatDeltaV(w.deltaV),
      ejection: formatDeltaV(w.transfer.ejectionDeltaV),
      prograde: formatSignedDeltaV(w.details.ejectionProgradeDeltaV),
      normal: formatSignedDeltaV(w.details.ejectionNormalDeltaV),
      ejectionAngle: w.transfer.ejectionAngle,
      ejectionAngleText: formatAngle(w.transfer.ejectionAngle),
      phaseAngle: formatAngle(w.phaseAngle),
      arrival: formatDate(w.arrivalTime, calendar),
      flightTime: formatFlightTime(w.timeOfFlight, calendar),
      capture: aerobrake ? (aerobrake.fix ? `~${aerobrake.fix}` : '–') : m.capture ? formatDeltaV(w.transfer.insertionDeltaV) : 'None (flyby)',
      aerobrake,
      parent: BODIES[m.origin].orbit!.referenceBody.name,
      refined: w.refined,
      planeChange:
        w.transfer.planeChangeDeltaV > 0 && w.transfer.planeChangeTime !== undefined
          ? {
              deltaV: formatDeltaV(w.transfer.planeChangeDeltaV),
              time: formatDate(w.transfer.planeChangeTime, calendar),
              angle: formatAngle(w.transfer.planeChangeAngle, 1),
            }
          : null,
      alternative: w.planeChangeAlternative
        ? {
            departure: formatDate(w.planeChangeAlternative.departureTime, calendar),
            total: formatDeltaV(w.planeChangeAlternative.deltaV),
            saving: formatDeltaV(w.deltaV - w.planeChangeAlternative.deltaV),
            percent: Math.round(((w.deltaV - w.planeChangeAlternative.deltaV) / w.deltaV) * 100),
          }
        : null,
    };
  });
}
