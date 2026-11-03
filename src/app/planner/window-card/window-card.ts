import { Component, computed, input, output } from '@angular/core';
import { EjectionDiagram } from '../ejection-diagram/ejection-diagram';
import { SolarSystemDiagram } from '../solar-system-diagram/solar-system-diagram';
import { calendarOf, nowOf, type Mission } from '../mission';
import { describeBurn, formatAngle, formatDeltaV, formatSignedDeltaV } from '../format';
import { describePhase } from '../solar-system-diagram/solar-system-layout';
import { formatDate, formatDuration, formatFlightTime, formatShortDate } from '../../astro/game-time';
import { BODIES } from '../../astro/bodies';
import type { TransferWindow } from '../../search/window-finder';

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
  /** Asks to show the suggested plane-change transfer instead. */
  readonly showAlternative = output<TransferWindow>();

  protected readonly view = computed(() => {
    const w = this.window();
    const m = this.mission();
    const calendar = calendarOf(m);
    const wait = w.departureTime - nowOf(m);
    return {
      departure: formatDate(w.departureTime, calendar),
      departureShort: formatShortDate(w.departureTime, calendar),
      alignment: describePhase(m.destination, m.origin, w.phaseAngle),
      burn: describeBurn(w.details.ejectionProgradeDeltaV, w.details.ejectionNormalDeltaV),
      countdown: wait < 1 ? 'now' : `in ${formatDuration(wait, calendar)}`,
      total: formatDeltaV(w.deltaV),
      ejection: formatDeltaV(w.transfer.ejectionDeltaV),
      prograde: formatSignedDeltaV(w.details.ejectionProgradeDeltaV),
      normal: formatSignedDeltaV(w.details.ejectionNormalDeltaV),
      ejectionAngle: w.transfer.ejectionAngle,
      ejectionAngleText: formatAngle(w.transfer.ejectionAngle),
      phaseAngle: formatAngle(w.phaseAngle),
      arrival: formatDate(w.arrivalTime, calendar),
      flightTime: formatFlightTime(w.timeOfFlight, calendar),
      capture: m.capture ? formatDeltaV(w.transfer.insertionDeltaV) : 'None (flyby)',
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
