import { Component, computed, input } from '@angular/core';
import type { CelestialBody } from '../../astro/bodies';
import type { Constellation } from '../constellation';
import { bodyColor } from '../../planner/body-colors';

export interface Point {
  x: number;
  y: number;
}

/**
 * Screen layout (y down, body at the origin, to scale): the target orbit, the deployment
 * orbit with its release apsis at the top, and the satellites' final positions.
 */
export function constellationLayout(c: Constellation, body: CelestialBody, radius: number) {
  const top = c.target.radius; // the release point is on the target orbit
  const bottom = c.releaseAt === 'apoapsis' ? c.deployment.periapsis : c.deployment.apoapsis;
  const scale = radius / Math.max(top, bottom);
  const targetRadius = top * scale;
  const n = c.count;
  return {
    bodyRadius: body.radius * scale,
    atmosphereRadius: (body.radius + body.atmosphereHeight) * scale,
    targetRadius,
    ellipse: {
      cx: 0,
      cy: ((bottom - top) / 2) * scale,
      rx: Math.sqrt(top * bottom) * scale,
      ry: ((top + bottom) / 2) * scale,
    },
    release: { x: 0, y: -targetRadius },
    satellites: Array.from({ length: n }, (_, k): Point => {
      const angle = (2 * Math.PI * k) / n;
      return { x: targetRadius * Math.sin(angle), y: -targetRadius * Math.cos(angle) };
    }),
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

@Component({
  selector: 'app-constellation-diagram',
  templateUrl: './constellation-diagram.html',
  styleUrl: './constellation-diagram.scss',
})
export class ConstellationDiagram {
  readonly constellation = input.required<Constellation>();
  readonly body = input.required<CelestialBody>();

  protected readonly color = computed(() => bodyColor(this.body().name));

  protected readonly layout = computed(() => {
    const l = constellationLayout(this.constellation(), this.body(), 100);
    return {
      ...l,
      satellites: l.satellites.map((s) => ({ x: round(s.x), y: round(s.y) })),
    };
  });

  protected readonly label = computed(() => {
    const c = this.constellation();
    const km = Math.round(c.target.altitude / 1e3).toLocaleString('en-US');
    return `${this.layout().satellites.length} satellites ${km} km above ${this.body().name}; the carrier releases one at each ${c.releaseAt}`;
  });
}
