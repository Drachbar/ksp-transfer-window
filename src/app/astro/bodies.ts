// The stock KSP 1 solar system, ported from the original celestialbodies.coffee.

import { Orbit, type GravitatingBody } from './orbit';

const G = 6.674e-11;
const DEG = Math.PI / 180;

export class CelestialBody implements GravitatingBody {
  readonly gravitationalParameter: number;
  readonly sphereOfInfluence?: number;

  constructor(
    readonly name: string,
    readonly mass: number,
    readonly radius: number,
    readonly siderealRotation: number,
    readonly orbit?: Orbit,
    readonly atmPressure = 0,
  ) {
    this.gravitationalParameter = G * mass;
    if (orbit) this.sphereOfInfluence = orbit.semiMajorAxis * Math.pow(mass / orbit.referenceBody.mass, 0.4);
  }

  /** Speed of a circular orbit at the given altitude above the surface (metres). */
  circularOrbitVelocity(altitude: number): number {
    return Math.sqrt(this.gravitationalParameter / (altitude + this.radius));
  }
}

/** Orbit from elements in the units KSP uses: degrees, and mean anomaly at epoch in radians. */
const orbit = (
  referenceBody: CelestialBody,
  semiMajorAxis: number,
  eccentricity: number,
  inclinationDeg: number,
  longitudeOfAscendingNodeDeg: number,
  argumentOfPeriapsisDeg: number,
  meanAnomalyAtEpoch: number,
) =>
  new Orbit(referenceBody, {
    semiMajorAxis,
    eccentricity,
    inclination: inclinationDeg * DEG,
    longitudeOfAscendingNode: longitudeOfAscendingNodeDeg * DEG,
    argumentOfPeriapsis: argumentOfPeriapsisDeg * DEG,
    meanAnomalyAtEpoch,
  });

const Kerbol = new CelestialBody('Kerbol', 1.756567e28, 2.616e8, 432000);
const Moho = new CelestialBody('Moho', 2.5263617e21, 250000, 1210000, orbit(Kerbol, 5263138304, 0.2, 7.0, 70.0, 15.0, 3.14));
const Eve = new CelestialBody('Eve', 1.2244127e23, 700000, 80500, orbit(Kerbol, 9832684544, 0.01, 2.1, 15.0, 0, 3.14), 5);
const Gilly = new CelestialBody('Gilly', 1.2420512e17, 13000, 28255, orbit(Eve, 31500000, 0.55, 12.0, 80.0, 10.0, 0.9));
const Kerbin = new CelestialBody('Kerbin', 5.2915793e22, 600000, 21600, orbit(Kerbol, 13599840256, 0.0, 0, 0, 0, 3.14), 1);
const Mun = new CelestialBody('Mun', 9.7600236e20, 200000, 138984.38, orbit(Kerbin, 12000000, 0.0, 0, 0, 0, 1.7));
const Minmus = new CelestialBody('Minmus', 2.6457897e19, 60000, 40400, orbit(Kerbin, 47000000, 0.0, 6.0, 78.0, 38.0, 0.9));
const Duna = new CelestialBody('Duna', 4.5154812e21, 320000, 65517.859, orbit(Kerbol, 20726155264, 0.051, 0.06, 135.5, 0, 3.14), 0.2);
const Ike = new CelestialBody('Ike', 2.7821949e20, 130000, 65517.862, orbit(Duna, 3200000, 0.03, 0.2, 0, 0, 1.7));
const Dres = new CelestialBody('Dres', 3.2191322e20, 138000, 34800, orbit(Kerbol, 40839348203, 0.145, 5.0, 280.0, 90.0, 3.14));
const Jool = new CelestialBody('Jool', 4.2332635e24, 6000000, 36000, orbit(Kerbol, 68773560320, 0.05, 1.304, 52.0, 0, 0.1), 15);
const Laythe = new CelestialBody('Laythe', 2.9397663e22, 500000, 52980.879, orbit(Jool, 27184000, 0, 0, 0, 0, 3.14), 0.8);
const Vall = new CelestialBody('Vall', 3.1088028e21, 300000, 105962.09, orbit(Jool, 43152000, 0, 0, 0, 0, 0.9));
const Tylo = new CelestialBody('Tylo', 4.2332635e22, 600000, 211926.36, orbit(Jool, 68500000, 0, 0.025, 0, 0, 3.14));
const Bop = new CelestialBody('Bop', 3.7261536e19, 65000, 544507.4, orbit(Jool, 128500000, 0.235, 15.0, 10.0, 25.0, 0.9));
const Pol = new CelestialBody('Pol', 1.0813636e19, 44000, 901902.62, orbit(Jool, 179890000, 0.17085, 4.25, 2.0, 15.0, 0.9));
const Eeloo = new CelestialBody('Eeloo', 1.1149358e21, 210000, 19460, orbit(Kerbol, 90118820000, 0.26, 6.15, 50.0, 260.0, 3.14));

export const BODIES = { Kerbol, Moho, Eve, Gilly, Kerbin, Mun, Minmus, Duna, Ike, Dres, Jool, Laythe, Vall, Tylo, Bop, Pol, Eeloo } as const;

export type BodyName = keyof typeof BODIES;

export const BODY_NAMES = Object.keys(BODIES) as BodyName[];

/** The bodies directly orbiting `parent`, in system order. */
export function bodiesOrbiting(parent: CelestialBody): CelestialBody[] {
  return BODY_NAMES.map((n) => BODIES[n] as CelestialBody).filter((b) => b.orbit?.referenceBody === parent);
}
