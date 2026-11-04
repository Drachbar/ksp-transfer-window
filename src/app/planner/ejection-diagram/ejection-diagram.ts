import { Component, computed, input } from '@angular/core';
import { formatAngle } from '../format';
import { bodyColor } from '../body-colors';

/**
 * Where on the parking orbit to burn, in screen coordinates (y down) around the
 * planet, with the planet's prograde direction up and the Sun to the left.
 * The ejection angle is measured from the burn point forward (counter-clockwise,
 * the direction of travel) to prograde, so the point lies clockwise of prograde.
 */
export function burnPoint(ejectionAngle: number, radius: number): [number, number] {
  return [radius * Math.sin(ejectionAngle), -radius * Math.cos(ejectionAngle)];
}

const ORBIT_RADIUS = 60;
const ARC_RADIUS = 78;
const round = (v: number) => Math.round(v * 100) / 100;

@Component({
  selector: 'app-ejection-diagram',
  templateUrl: './ejection-diagram.html',
  styleUrl: './ejection-diagram.scss',
})
export class EjectionDiagram {
  /** Angle from the burn point to the origin's prograde direction (rad). */
  readonly ejectionAngle = input.required<number>();
  readonly origin = input.required<string>();
  /** What the origin orbits. */
  readonly parent = input('Sun');

  protected readonly orbitRadius = ORBIT_RADIUS;
  protected readonly color = computed(() => bodyColor(this.origin()));
  protected readonly angleText = computed(() => formatAngle(this.ejectionAngle()));
  protected readonly label = computed(() => `Burn at ${this.angleText()} from ${this.origin()}’s prograde direction`);

  protected readonly burn = computed(() => {
    const [x, y] = burnPoint(this.ejectionAngle(), ORBIT_RADIUS);
    return { x: round(x), y: round(y) };
  });

  /** Short arrow along the direction of travel at the burn point (the burn is prograde). */
  protected readonly burnArrow = computed(() => {
    const a = this.ejectionAngle();
    const { x, y } = this.burn();
    // Counter-clockwise tangent at the burn point, in screen coordinates
    const tx = -Math.cos(a);
    const ty = -Math.sin(a);
    return { x2: round(x + 22 * tx), y2: round(y + 22 * ty) };
  });

  /** Arc from prograde clockwise to the burn point, showing the angle. */
  protected readonly arc = computed(() => {
    const a = this.ejectionAngle();
    const [x, y] = burnPoint(a, ARC_RADIUS);
    const largeArc = a > Math.PI ? 1 : 0;
    return `M 0 ${-ARC_RADIUS} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${largeArc} 1 ${round(x)} ${round(y)}`;
  });

  /** Radial line from the planet through the burn point to the end of the arc. */
  protected readonly radial = computed(() => {
    const [x1, y1] = burnPoint(this.ejectionAngle(), 22);
    const [x2, y2] = burnPoint(this.ejectionAngle(), ARC_RADIUS);
    return { x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) };
  });

  protected readonly arcLabel = computed(() => {
    const [x, y] = burnPoint(this.ejectionAngle() / 2, ARC_RADIUS + 14);
    return { x: round(x), y: round(y) };
  });
}
