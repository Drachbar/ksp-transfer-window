import { InjectionToken, inject, Service } from '@angular/core';
import { runWindowSearch, type WindowSearchRequest, type WorkerRequest, type WorkerResponse } from './window-search-protocol';
import type { WindowSearchResult } from './window-finder';

/** Creates the Web Worker that runs window searches, or null where workers are not supported. */
export const WINDOW_SEARCH_WORKER = new InjectionToken<(() => Worker) | null>('WINDOW_SEARCH_WORKER', {
  providedIn: 'root',
  factory: () =>
    typeof Worker !== 'undefined' ? () => new Worker(new URL('./window-finder.worker', import.meta.url), { type: 'module' }) : null,
});

/** Runs transfer window searches off the main thread. Starting a new search cancels the running one. */
@Service()
export class WindowSearch {
  private readonly createWorker = inject(WINDOW_SEARCH_WORKER);
  private nextId = 1;
  private cancelRunning?: () => void;

  search(request: WindowSearchRequest, onProgress?: (fraction: number) => void): Promise<WindowSearchResult> {
    this.cancelRunning?.();
    const id = this.nextId++;

    return new Promise<WindowSearchResult>((resolve, reject) => {
      const handle = (message: WorkerResponse, done: () => void) => {
        if (message.id !== id) return;
        if (message.type === 'progress') {
          onProgress?.(message.fraction);
          return;
        }
        done();
        if (message.type === 'result') resolve(message.result);
        else reject(new Error(message.message));
      };

      if (!this.createWorker) {
        // No worker support: run on the main thread, but still asynchronously.
        let cancelled = false;
        this.cancelRunning = () => {
          cancelled = true;
          reject(new DOMException('Search cancelled', 'AbortError'));
        };
        setTimeout(() => {
          if (!cancelled) runWindowSearch({ id, request }, (m) => handle(m, () => (this.cancelRunning = undefined)));
        });
        return;
      }

      const worker = this.createWorker();
      const finish = () => {
        worker.terminate();
        if (this.cancelRunning === cancel) this.cancelRunning = undefined;
      };
      const cancel = () => {
        finish();
        reject(new DOMException('Search cancelled', 'AbortError'));
      };
      this.cancelRunning = cancel;
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => handle(data, finish);
      worker.onerror = (e) => {
        finish();
        reject(new Error(e.message || 'Window search failed'));
      };
      worker.postMessage({ id, request } satisfies WorkerRequest);
    });
  }
}
