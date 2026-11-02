import { TestBed } from '@angular/core/testing';
import { WindowSearch, WINDOW_SEARCH_WORKER } from './window-search';
import { handleWorkerRequest, type WindowSearchRequest, type WorkerRequest, type WorkerResponse } from './window-search-protocol';
import { findTransferWindows } from './window-finder';
import { toSearchParams } from './window-search-protocol';

const request: WindowSearchRequest = {
  origin: 'Kerbin',
  destination: 'Duna',
  now: 0,
  initialAltitude: 100e3,
  finalAltitude: 100e3,
  windowCount: 1,
};

/** Runs the real worker protocol asynchronously, like a Web Worker would. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: WorkerRequest) {
    setTimeout(() =>
      handleWorkerRequest(message, (m) => {
        if (!this.terminated) this.onmessage?.({ data: structuredClone(m) } as MessageEvent<WorkerResponse>);
      }),
    );
  }
  terminate() {
    this.terminated = true;
  }
}

describe('WindowSearch', () => {
  describe('with a worker', () => {
    let service: WindowSearch;
    beforeEach(() => {
      FakeWorker.instances = [];
      TestBed.configureTestingModule({
        providers: [{ provide: WINDOW_SEARCH_WORKER, useValue: () => new FakeWorker() as unknown as Worker }],
      });
      service = TestBed.inject(WindowSearch);
    });

    it('resolves with the search result and reports progress', async () => {
      const progress: number[] = [];
      const result = await service.search(request, (f) => progress.push(f));
      expect(result.windows.map((w) => w.departureTime)).toEqual(findTransferWindows(toSearchParams(request)).windows.map((w) => w.departureTime));
      expect(progress.at(-1)).toBe(1);
    });

    it('terminates the worker when the search is done', async () => {
      await service.search(request);
      expect(FakeWorker.instances[0].terminated).toBe(true);
    });

    it('cancels a running search when a new one starts', async () => {
      const first = service.search(request);
      const second = service.search({ ...request, destination: 'Eve' });
      await expect(first).rejects.toMatchObject({ name: 'AbortError' });
      expect(FakeWorker.instances[0].terminated).toBe(true);
      expect((await second).windows.length).toBe(1);
    });

    it('computes porkchop grids', async () => {
      const progress: number[] = [];
      const grid = await service.porkchop({ ...request, earliestDeparture: 0, departureSpan: 1e7, width: 6, height: 5 }, (f) => progress.push(f));
      expect(grid.deltaVs.length).toBe(30);
      expect(Number.isFinite(grid.minDeltaV)).toBe(true);
      expect(progress.at(-1)).toBe(1);
    });

    it('does not let a porkchop request cancel a window search, or vice versa', async () => {
      const windows = service.search(request);
      const grid = service.porkchop({ ...request, earliestDeparture: 0, departureSpan: 1e7, width: 4, height: 4 });
      await expect(windows).resolves.toBeTruthy();
      await expect(grid).resolves.toBeTruthy();
    });

    it('cancels a running porkchop when a new one starts', async () => {
      const p = { ...request, earliestDeparture: 0, departureSpan: 1e7, width: 4, height: 4 };
      const first = service.porkchop(p);
      const second = service.porkchop(p);
      await expect(first).rejects.toMatchObject({ name: 'AbortError' });
      await expect(second).resolves.toBeTruthy();
    });

    it('rejects when the search fails', async () => {
      await expect(service.search({ ...request, destination: 'Laythe' })).rejects.toThrow(/same/i);
    });
  });

  describe('without worker support', () => {
    it('runs the search directly', async () => {
      TestBed.configureTestingModule({ providers: [{ provide: WINDOW_SEARCH_WORKER, useValue: null }] });
      const result = await TestBed.inject(WindowSearch).search(request);
      expect(result.windows.length).toBe(1);
      expect(result.departNow).not.toBeNull();
    });
  });
});
