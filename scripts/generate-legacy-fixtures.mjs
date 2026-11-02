#!/usr/bin/env node
// Runs the original (legacy) compiled JavaScript in a Node VM and records
// reference results as JSON fixtures. The TypeScript port is tested against
// these so we know the new code computes the same things as the original.
//
// Usage: node scripts/generate-legacy-fixtures.mjs
// Output: src/testing/legacy/*.json
//
// NaN and ±Infinity are encoded as the strings "NaN", "Infinity", "-Infinity"
// because JSON has no representation for them.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const legacyDir = join(root, 'legacy', 'javascripts');
const outDir = join(root, 'src', 'testing', 'legacy');

// --- Load the legacy code ---------------------------------------------------

const context = vm.createContext({ Math, console });
for (const file of [
  'numeric-1.2.6.min.js',
  'quaternion.js',
  'roots.js',
  'lambert.js',
  'orbit.js',
  'celestialbodies.js',
]) {
  vm.runInContext(readFileSync(join(legacyDir, file), 'utf8'), context, { filename: file });
}
const { CelestialBody, Orbit, lambert, roots } = context;

// --- Helpers ----------------------------------------------------------------

const BODY_NAMES = [
  'Kerbol', 'Moho', 'Eve', 'Gilly', 'Kerbin', 'Mun', 'Minmus', 'Duna', 'Ike',
  'Dres', 'Jool', 'Laythe', 'Vall', 'Tylo', 'Bop', 'Pol', 'Eeloo',
];

const encode = (_key, value) => {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  // Arrays created inside the VM are not `instanceof Array` here; normalise them.
  if (value && typeof value === 'object' && typeof value.length === 'number' && !Array.isArray(value)) {
    return Array.from(value);
  }
  return value;
};

const write = (name, data) => {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, encode, 1) + '\n');
  console.log(`wrote ${path}`);
};

const vec = (v) => (v == null ? null : Array.from(v));

const hohmannTime = (origin, destination) => {
  const mu = origin.orbit.referenceBody.gravitationalParameter;
  const a = (origin.orbit.semiMajorAxis + destination.orbit.semiMajorAxis) / 2;
  return Math.PI * Math.sqrt((a * a * a) / mu);
};

const synodicPeriod = (origin, destination) =>
  Math.abs(1 / (1 / origin.orbit.period() - 1 / destination.orbit.period()));

const altitudeToVelocity = (body, altitudeKm) =>
  altitudeKm == null ? null : altitudeKm === 0 ? 0 : body.circularOrbitVelocity(altitudeKm * 1e3);

// --- Roots ------------------------------------------------------------------

{
  const cases = [];
  const functions = {
    cubic: (x) => x * x * x - 2 * x - 5,
    cos: (x) => Math.cos(x) - x,
    exp: (x) => Math.exp(x) - 3,
  };
  for (const [name, f] of Object.entries(functions)) {
    cases.push({ method: 'brentsMethod', fn: name, a: 0, b: 3, relativeAccuracy: 1e-6, result: roots.brentsMethod(0, 3, 1e-6, f) });
  }
  const minimise = {
    parabola: (x) => (x - 1.234) * (x - 1.234) + 2,
    sinus: (x) => Math.sin(x),
  };
  cases.push({ method: 'goldenSectionSearch', fn: 'parabola', a: -5, b: 5, epsilon: 1e-6, result: roots.goldenSectionSearch(-5, 5, 1e-6, minimise.parabola) });
  cases.push({ method: 'goldenSectionSearch', fn: 'sinus', a: 3, b: 6, epsilon: 1e-4, result: roots.goldenSectionSearch(3, 6, 1e-4, minimise.sinus) });
  write('roots', { machineEpsilon: roots.MACHINE_EPSILON, cases });
}

// --- Celestial bodies and orbits ---------------------------------------------

const SAMPLE_TIMES = [0, 123456, 9.2e6, 3.7e7, 1.21e8];
{
  const bodies = BODY_NAMES.map((name) => {
    const body = CelestialBody[name];
    const result = {
      name,
      mass: body.mass,
      radius: body.radius,
      gravitationalParameter: body.gravitationalParameter,
      sphereOfInfluence: body.sphereOfInfluence ?? null,
      circularOrbitVelocityAt100km: body.circularOrbitVelocity(100e3),
    };
    if (body.orbit) {
      const o = body.orbit;
      result.orbit = {
        referenceBody: o.referenceBody.name(),
        semiMajorAxis: o.semiMajorAxis,
        eccentricity: o.eccentricity,
        inclination: o.inclination,
        longitudeOfAscendingNode: o.longitudeOfAscendingNode,
        argumentOfPeriapsis: o.argumentOfPeriapsis,
        meanAnomalyAtEpoch: o.meanAnomalyAtEpoch,
        period: o.period(),
        meanMotion: o.meanMotion(),
        apoapsis: o.apoapsis(),
        periapsis: o.periapsis(),
        semiLatusRectum: o.semiLatusRectum(),
        normalVector: vec(o.normalVector()),
        samples: SAMPLE_TIMES.map((t) => {
          const nu = o.trueAnomalyAt(t);
          return {
            t,
            meanAnomaly: o.meanAnomalyAt(t),
            eccentricAnomaly: o.eccentricAnomalyAt(t),
            trueAnomaly: nu,
            radius: o.radiusAtTrueAnomaly(nu),
            speed: o.speedAtTrueAnomaly(nu),
            position: vec(o.positionAtTrueAnomaly(nu)),
            velocity: vec(o.velocityAtTrueAnomaly(nu)),
            timeAtTrueAnomaly: o.timeAtTrueAnomaly(nu, t),
          };
        }),
      };
    }
    return result;
  });
  write('bodies', bodies);
}

// --- Orbit.fromPositionAndVelocity -------------------------------------------

{
  const cases = [];
  for (const [name, t] of [['Kerbin', 1e6], ['Moho', 5e6], ['Eeloo', 2e7], ['Minmus', 4e5]]) {
    const o = CelestialBody[name].orbit;
    const nu = o.trueAnomalyAt(t);
    const p = o.positionAtTrueAnomaly(nu);
    // Perturb the velocity so we get a genuinely different orbit.
    const v = o.velocityAtTrueAnomaly(nu).map((c, i) => c * (1.1 + 0.05 * i) + 25);
    const r = Orbit.fromPositionAndVelocity(o.referenceBody, p, v, t);
    cases.push({
      referenceBody: o.referenceBody.name(),
      position: vec(p),
      velocity: vec(v),
      t,
      semiMajorAxis: r.semiMajorAxis,
      eccentricity: r.eccentricity,
      inclination: r.inclination,
      longitudeOfAscendingNode: r.longitudeOfAscendingNode,
      argumentOfPeriapsis: r.argumentOfPeriapsis,
      timeOfPeriapsisPassage: r.timeOfPeriapsisPassage,
      trueAnomalyAtPosition: r.trueAnomalyAtPosition(p),
    });
  }
  write('orbit-from-state', cases);
}

// --- Lambert -----------------------------------------------------------------

{
  const mu = CelestialBody.Kerbol.gravitationalParameter;
  const kerbin = CelestialBody.Kerbin.orbit;
  const duna = CelestialBody.Duna.orbit;
  const moho = CelestialBody.Moho.orbit;
  const cases = [];
  const add = (label, pos1, pos2, dt, maxRevs, prograde) => {
    cases.push({ label, mu, pos1: vec(pos1), pos2: vec(pos2), dt, maxRevs, prograde, solutions: lambert(mu, pos1, pos2, dt, maxRevs, prograde) });
  };
  const at = (o, t) => o.positionAtTrueAnomaly(o.trueAnomalyAt(t));
  add('kerbin-duna short', at(kerbin, 0), at(duna, 5e6), 5e6, 0, 1);
  add('kerbin-duna long', at(kerbin, 3e6), at(duna, 3e6 + 1.1e7), 1.1e7, 0, 1);
  add('kerbin-duna >180deg', at(kerbin, 0), at(duna, 9e6), 9e6, 0, 1);
  add('kerbin-moho multi-rev', at(kerbin, 0), at(moho, 2.5e7), 2.5e7, 10, 1);
  add('kerbin-moho retrograde', at(kerbin, 0), at(moho, 4e6), 4e6, 0, -1);
  add('hyperbolic fast', at(kerbin, 0), at(duna, 4e5), 4e5, 0, 1);
  write('lambert', cases);
}

// --- Transfers ---------------------------------------------------------------

{
  const missions = [
    { origin: 'Kerbin', destination: 'Duna', initialAltitude: 100, finalAltitude: 100 },
    { origin: 'Kerbin', destination: 'Eve', initialAltitude: 100, finalAltitude: 100 },
    { origin: 'Kerbin', destination: 'Moho', initialAltitude: 80, finalAltitude: 50 },
    { origin: 'Kerbin', destination: 'Dres', initialAltitude: 100, finalAltitude: null },
    { origin: 'Kerbin', destination: 'Jool', initialAltitude: 100, finalAltitude: 0 },
    { origin: 'Kerbin', destination: 'Eeloo', initialAltitude: 100, finalAltitude: 100 },
    { origin: 'Duna', destination: 'Kerbin', initialAltitude: 60, finalAltitude: 100 },
    { origin: 'Mun', destination: 'Minmus', initialAltitude: 20, finalAltitude: 20 },
    { origin: 'Laythe', destination: 'Tylo', initialAltitude: 0, finalAltitude: 50 },
  ];
  const GRID = 12;
  const transferTypes = ['ballistic', 'optimalPlaneChange', 'optimal'];

  const pickScalars = (t) => {
    const keys = [
      'angle', 'ejectionInclination', 'ejectionAngle', 'ejectionDeltaV',
      'planeChangeAngleToIntercept', 'planeChangeDeltaV', 'planeChangeTime', 'planeChangeAngle',
      'insertionInclination', 'insertionDeltaV', 'deltaV',
      'ejectionNormalDeltaV', 'ejectionProgradeDeltaV', 'ejectionRadialDeltaV', 'ejectionHeading', 'ejectionPitch',
    ];
    const r = {};
    for (const k of keys) r[k] = t[k] === undefined ? null : t[k];
    r.ejectionVelocity = vec(t.ejectionVelocity);
    r.ejectionDeltaVector = vec(t.ejectionDeltaVector);
    r.insertionVelocity = vec(t.insertionVelocity);
    return r;
  };

  const results = missions.map((m) => {
    const origin = CelestialBody[m.origin];
    const destination = CelestialBody[m.destination];
    const initialOrbitalVelocity = altitudeToVelocity(origin, m.initialAltitude);
    const finalOrbitalVelocity = altitudeToVelocity(destination, m.finalAltitude);
    const hohmann = hohmannTime(origin, destination);
    const synodic = synodicPeriod(origin, destination);
    const earliestDeparture = 1e6;
    const xScale = synodic;
    const shortestTimeOfFlight = 0.5 * hohmann;
    const yScale = hohmann;

    const perType = {};
    for (const transferType of transferTypes) {
      const grid = [];
      let best = { deltaV: Infinity };
      for (let j = 0; j < GRID; j++) {
        const dt = shortestTimeOfFlight + (j / (GRID - 1)) * yScale;
        const row = [];
        for (let i = 0; i < GRID; i++) {
          const t0 = earliestDeparture + (i / (GRID - 1)) * xScale;
          const tr = Orbit.transfer(transferType, origin, destination, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity);
          row.push(tr.deltaV);
          if (tr.deltaV < best.deltaV) best = { deltaV: tr.deltaV, t0, dt };
        }
        grid.push(row);
      }

      const detailed = (t0, dt) => {
        const tr = Orbit.transfer(transferType, origin, destination, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity);
        const scalars = pickScalars(Orbit.transferDetails(tr, origin, t0, initialOrbitalVelocity));
        let refined = null;
        if (initialOrbitalVelocity) {
          const fresh = Orbit.transfer(transferType, origin, destination, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity);
          const rt = Orbit.refineTransfer(fresh, transferType, origin, destination, t0, dt, initialOrbitalVelocity, finalOrbitalVelocity);
          refined = pickScalars(rt);
        }
        return { t0, dt, transfer: scalars, refined };
      };

      perType[transferType] = {
        grid,
        best: detailed(best.t0, best.dt),
        samples: [
          detailed(earliestDeparture + 0.25 * xScale, shortestTimeOfFlight + 0.4 * yScale),
          detailed(earliestDeparture + 0.8 * xScale, shortestTimeOfFlight + 0.9 * yScale),
        ],
      };
    }

    return {
      ...m,
      initialOrbitalVelocity,
      finalOrbitalVelocity,
      earliestDeparture,
      xScale,
      shortestTimeOfFlight,
      yScale,
      gridSize: GRID,
      transfers: perType,
    };
  });

  write('transfers', results);
}
