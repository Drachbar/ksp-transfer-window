import { InjectionToken, inject, Service } from '@angular/core';
import {
  handleWorkerRequest,
  type PorkchopRequest,
  type PorkchopResult,
  type WindowSearchRequest,
  type WorkerRequest,
  type WorkerResponse,
} from './window-search-protocol';
import type { WindowSearchResult } from './window-finder';

/** Creates the Web Worker that runs searches, or null where workers are not supported. */
export const WINDOW_SEARCH_WORKER = new InjectionToken<(() => Worker) | null>('WINDOW_SEARCH_WORKER', {
  providedIn: 'root',
  factory: () =>
    typeof Worker !== 'undefined' ? () => new Worker(new URL('./window-finder.worker', import.meta.url), { type: 'module' }) : null,
});

/** Requests in the same slot cancel each other; different slots run side by side. */
type Slot = string;
type Progress = (fraction: number) => void;

/**
 * Runs transfer window searches and porkchop grids off the main thread, each in its own worker.
 * Starting a new request cancels the running one in the same slot (it rejects with an AbortError).
 */
@Service()
export class WindowSearch {
  private readonly createWorker = inject(WINDOW_SEARCH_WORKER);
  private nextId = 1;
  private readonly cancelRunning = new Map<Slot, () => void>();

  /** Finds transfer windows. Use a separate `slot` for searches that should not cancel the main one. */
  search(request: WindowSearchRequest, onProgress?: Progress, slot: Slot = 'windows'): Promise<WindowSearchResult> {
    return this.run({ id: this.nextId++, kind: 'windows', request }, slot, onProgress) as Promise<WindowSearchResult>;
  }

  porkchop(request: PorkchopRequest, onProgress?: Progress): Promise<PorkchopResult> {
    return this.run({ id: this.nextId++, kind: 'porkchop', request }, 'porkchop', onProgress) as Promise<PorkchopResult>;
  }

  private run(message: WorkerRequest, slot: Slot, onProgress?: Progress): Promise<WindowSearchResult | PorkchopResult> {
    const { id } = message;
    this.cancelRunning.get(slot)?.();

    return new Promise((resolve, reject) => {
      let finish = () => {};
      const cancel = () => {
        finish();
        reject(new DOMException('Search cancelled', 'AbortError'));
      };
      const done = () => {
        finish();
        if (this.cancelRunning.get(slot) === cancel) this.cancelRunning.delete(slot);
      };
      this.cancelRunning.set(slot, cancel);

      const handle = (response: WorkerResponse) => {
        if (response.id !== id) return;
        if (response.type === 'progress') {
          onProgress?.(response.fraction);
          return;
        }
        done();
        if (response.type === 'error') reject(new Error(response.message));
        else resolve(response.result);
      };

      if (!this.createWorker) {
        // No worker support: run on the main thread, but still asynchronously.
        let cancelled = false;
        finish = () => (cancelled = true);
        setTimeout(() => {
          if (!cancelled) handleWorkerRequest(message, handle);
        });
        return;
      }

      const worker = this.createWorker();
      finish = () => worker.terminate();
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => handle(data);
      worker.onerror = (e) => {
        done();
        reject(new Error(e.message || 'Search failed'));
      };
      worker.postMessage(message);
    });
  }
}
