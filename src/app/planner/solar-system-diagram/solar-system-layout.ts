// Where everything is, seen from above (projected onto the reference plane),
// rotated so the origin is at the bottom. Angles are true; distances from the
// centre are compressed (power 0.4) so inner and outer orbits both fit.
// Screen coordinates: y points down, centre at (0, 0).

import { bodiesOrbiting, type CelestialBody } from '../../astro/bodies';
import { Orbit } from '../../astro/orbit';
import { TWO_PI, type Vec3 } from '../../astro/vector';

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutBody extends Point {
  name: string;
  role: 'origin' | 'destination' | 'other';
}

export interface SystemLayout {
  /** The body at the centre. */
  parent: string;
  bodies: LaidOutBody[];
  orbits: { name: string; path: string }[];
  /** Angle from the origin to the destination as drawn (rad, counter-clockwise), in (-π, π]. */
  phaseAngle: number;
  transfer?: { path: string; arrival: Point };
}

export interface LayoutInput {
  origin: CelestialBody;
  destination: CelestialBody;
  /** Game time to show (s). */
  time: number;
  /** Radius available for the outermost orbit. */
  radius: number;
  /** Draw the transfer orbit, departing at `time`. */
  transfer?: { departureVelocity: Vec3; arrivalTime: number };
}

/** Exponent for compressing distances: Moho to Eeloo is a factor 20 in distance, about 3 on screen. */
const DISTANCE_EXPONENT = 0.4;
const ORBIT_SAMPLES = 120;
const TRANSFER_SAMPLES = 60;

const round = (v: number) => Math.round(v * 100) / 100;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const positionAt = (orbit: Orbit, t: number) => orbit.positionAtTrueAnomaly(orbit.trueAnomalyAt(t));

export function layoutSystem({ origin, destination, time, radius, transfer }: LayoutInput): SystemLayout {
  const parent = origin.orbit!.referenceBody as CelestialBody;
  const bodies = bodiesOrbiting(parent);
  const maxDistance = Math.max(...bodies.map((b) => b.orbit!.apoapsis()));

  // Rotate so the origin ends up at the bottom (math angle -π/2).
  const originPosition = positionAt(origin.orbit!, time);
  const rotation = -Math.PI / 2 - Math.atan2(originPosition[1], originPosition[0]);

  const project = (p: Vec3): Point => {
    const angle = Math.atan2(p[1], p[0]) + rotation;
    const r = radius * Math.pow(Math.hypot(p[0], p[1]) / maxDistance, DISTANCE_EXPONENT);
    return { x: round(r * Math.cos(angle)), y: round(-r * Math.sin(angle)) };
  };
  const path = (points: Point[], closed: boolean) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (closed ? ' Z' : '');

  const laidOut = bodies.map((b) => ({
    name: b.name,
    role: b === origin ? ('origin' as const) : b === destination ? ('destination' as const) : ('other' as const),
    ...project(positionAt(b.orbit!, time)),
  }));

  const orbits = bodies.map((b) => ({
    name: b.name,
    path: path(
      Array.from({ length: ORBIT_SAMPLES }, (_, i) => project(b.orbit!.positionAtTrueAnomaly((i / ORBIT_SAMPLES) * TWO_PI))),
      true,
    ),
  }));

  const destinationPosition = positionAt(destination.orbit!, time);
  const phaseAngle = wrap(Math.atan2(destinationPosition[1], destinationPosition[0]) - Math.atan2(originPosition[1], originPosition[0]));

  let laidOutTransfer: SystemLayout['transfer'];
  if (transfer) {
    const orbit = Orbit.fromPositionAndVelocity(parent, originPosition, transfer.departureVelocity, time);
    const span = transfer.arrivalTime - time;
    const points = Array.from({ length: TRANSFER_SAMPLES + 1 }, (_, i) => project(positionAt(orbit, time + (i / TRANSFER_SAMPLES) * span)));
    laidOutTransfer = { path: path(points, false), arrival: project(positionAt(destination.orbit!, transfer.arrivalTime)) };
  }

  return { parent: parent.name, bodies: laidOut, orbits, phaseAngle, transfer: laidOutTransfer };
}

/** "Duna is 36° ahead of Kerbin" / "Eve is 54° behind Kerbin" */
export function describePhase(destination: string, origin: string, phaseAngle: number): string {
  const degrees = Math.round((wrap(phaseAngle) * 180) / Math.PI);
  return `${destination} is ${Math.abs(degrees)}° ${degrees >= 0 ? 'ahead of' : 'behind'} ${origin}`;
}
