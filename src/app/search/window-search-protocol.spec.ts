import { handleWorkerRequest, toSearchParams, type PorkchopRequest, type WindowSearchRequest, type WorkerResponse } from './window-search-protocol';
import { computePorkchop } from './porkchop';
import { defaultSearchRanges } from './ranges';
import { findTransferWindows } from './window-finder';
import { BODIES } from '../astro/bodies';

const request: WindowSearchRequest = {
  origin: 'Kerbin',
  destination: 'Duna',
  now: 0,
  initialAltitude: 100e3,
  finalAltitude: 100e3,
  windowCount: 2,
};

describe('toSearchParams', () => {
  it('turns body names and parking orbit altitudes into search parameters', () => {
    const p = toSearchParams(request);
    expect(p.origin).toBe(BODIES.Kerbin);
    expect(p.destination).toBe(BODIES.Duna);
    expect(p.initialOrbitalVelocity).toBe(BODIES.Kerbin.circularOrbitVelocity(100e3));
    expect(p.finalOrbitalVelocity).toBe(BODIES.Duna.circularOrbitVelocity(100e3));
    expect(p.transferType).toBe('ballistic');
    expect(p.windowCount).toBe(2);
  });

  it('treats a null final altitude as "no insertion burn" (flyby)', () => {
    expect(toSearchParams({ ...request, finalAltitude: null }).finalOrbitalVelocity).toBeNull();
  });

  it('rejects unknown bodies', () => {
    expect(() => toSearchParams({ ...request, origin: 'Laythe2' as never })).toThrow(/unknown/i);
  });
});

describe('handleWorkerRequest: windows', () => {
  it('posts progress and then the same result as findTransferWindows, without the transfer orbit objects', () => {
    const messages: WorkerResponse[] = [];
    handleWorkerRequest({ id: 7, kind: 'windows', request }, (m) => messages.push(m));

    const progress = messages.filter((m) => m.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((m) => m.id === 7)).toBe(true);

    const last = messages.at(-1)!;
    expect(last.type).toBe('result');
    if (last.type !== 'result') return;
    const expected = findTransferWindows(toSearchParams(request));
    expect(last.result.windows.map((w) => w.departureTime)).toEqual(expected.windows.map((w) => w.departureTime));
    expect(last.result.windows.map((w) => w.deltaV)).toEqual(expected.windows.map((w) => w.deltaV));
    for (const w of last.result.windows) expect(w.transfer.orbit).toBeUndefined();
    // Must survive structured cloning (postMessage)
    expect(() => structuredClone(last)).not.toThrow();
  });

  it('posts an error instead of throwing', () => {
    const messages: WorkerResponse[] = [];
    handleWorkerRequest({ id: 1, kind: 'windows', request: { ...request, destination: 'Laythe' } }, (m) => messages.push(m));
    expect(messages).toEqual([{ id: 1, type: 'error', message: expect.stringMatching(/same/i) }]);
  });
});

describe('handleWorkerRequest: porkchop', () => {
  const porkchopRequest: PorkchopRequest = { ...request, earliestDeparture: 1e6, departureSpan: 2e7, width: 12, height: 10 };

  it('computes the Δv grid over the default time-of-flight range and hands over its buffer', () => {
    const messages: WorkerResponse[] = [];
    const transfers: (Transferable[] | undefined)[] = [];
    handleWorkerRequest({ id: 3, kind: 'porkchop', request: porkchopRequest }, (m, t) => {
      messages.push(m);
      transfers.push(t);
    });

    const last = messages.at(-1)!;
    expect(last.type).toBe('porkchop');
    if (last.type !== 'porkchop') return;
    const params = toSearchParams(porkchopRequest);
    const ranges = defaultSearchRanges(params.origin, params.destination);
    const expected = computePorkchop({
      ...params,
      transferType: 'ballistic',
      earliestDeparture: 1e6,
      departureSpan: 2e7,
      shortestTimeOfFlight: ranges.shortestTimeOfFlight,
      timeOfFlightSpan: ranges.timeOfFlightSpan,
      width: 12,
      height: 10,
    });
    expect(last.result).toMatchObject({
      earliestDeparture: 1e6,
      departureSpan: 2e7,
      shortestTimeOfFlight: ranges.shortestTimeOfFlight,
      timeOfFlightSpan: ranges.timeOfFlightSpan,
      width: 12,
      height: 10,
      minDeltaV: expected.minDeltaV,
      minIndex: expected.minIndex,
    });
    expect(Array.from(last.result.deltaVs)).toEqual(Array.from(expected.deltaVs));
    expect(transfers.at(-1)).toEqual([last.result.deltaVs.buffer]);
    expect(messages.some((m) => m.type === 'progress')).toBe(true);
  });

  it('posts an error for an impossible route', () => {
    const messages: WorkerResponse[] = [];
    handleWorkerRequest({ id: 4, kind: 'porkchop', request: { ...porkchopRequest, destination: 'Laythe' } }, (m) => messages.push(m));
    expect(messages).toEqual([{ id: 4, type: 'error', message: expect.stringMatching(/same/i) }]);
  });
});
