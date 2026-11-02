/// <reference lib="webworker" />

import { handleWorkerRequest, type WorkerRequest } from './window-search-protocol';

addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) =>
  handleWorkerRequest(data, (message, transfer) => postMessage(message, transfer ?? [])),
);
