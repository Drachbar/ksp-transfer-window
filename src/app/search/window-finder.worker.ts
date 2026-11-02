/// <reference lib="webworker" />

import { runWindowSearch, type WorkerRequest } from './window-search-protocol';

addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => runWindowSearch(data, (message) => postMessage(message)));
