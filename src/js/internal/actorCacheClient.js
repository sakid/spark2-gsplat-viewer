import {
  ACTOR_CACHE_SERVER_ORIGIN,
  ACTOR_CACHE_SERVER_TIMEOUT_MS,
  normalizeActorCacheManifest
} from './actorCacheShared';

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener?.('abort', abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abort);
    }
  };
}

async function readJson(response) {
  const data = await response.json().catch(() => null);
  if (response.ok) return data;
  const message = data?.error || data?.message || `HTTP ${response.status}`;
  const error = new Error(message);
  error.code = data?.code || `HTTP_${response.status}`;
  error.status = response.status;
  throw error;
}

function normalizeJobState(state, origin) {
  if (!state || typeof state !== 'object') return state;
  if (typeof state.manifestUrl === 'string' && state.manifestUrl) {
    return {
      ...state,
      manifestUrl: new URL(state.manifestUrl, origin).href
    };
  }
  return state;
}

export function createActorCacheClient({ origin = ACTOR_CACHE_SERVER_ORIGIN, timeoutMs = ACTOR_CACHE_SERVER_TIMEOUT_MS } = {}) {
  const jobsUrl = `${origin}/jobs`;

  return {
    origin,
    async submitJob(request, sourceFile = null, signal = undefined) {
      const timeout = withTimeout(signal, timeoutMs);
      try {
        let response;
        if (sourceFile) {
          const formData = new FormData();
          formData.set('request', JSON.stringify(request));
          formData.set('sourceFile', sourceFile, sourceFile.name || request.sourceName || 'actor-source.spz');
          response = await fetch(jobsUrl, {
            method: 'POST',
            body: formData,
            signal: timeout.signal
          });
        } else {
          response = await fetch(jobsUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
            signal: timeout.signal
          });
        }
        return normalizeJobState(await readJson(response), origin);
      } finally {
        timeout.cleanup();
      }
    },
    async getJob(jobId, signal = undefined) {
      const timeout = withTimeout(signal, timeoutMs);
      try {
        const response = await fetch(`${jobsUrl}/${encodeURIComponent(jobId)}`, { signal: timeout.signal });
        return normalizeJobState(await readJson(response), origin);
      } finally {
        timeout.cleanup();
      }
    },
    async waitForJob(jobId, {
      pollMs = 750,
      signal = undefined,
      onUpdate = () => {}
    } = {}) {
      while (true) {
        const state = await this.getJob(jobId, signal);
        onUpdate(state);
        if (state?.status === 'done' || state?.status === 'error') {
          return state;
        }
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, pollMs);
          signal?.addEventListener?.('abort', () => {
            clearTimeout(timer);
            reject(signal.reason || new Error('aborted'));
          }, { once: true });
        });
      }
    },
    async fetchManifest(url, signal = undefined) {
      const timeout = withTimeout(signal, timeoutMs);
      try {
        const response = await fetch(url, { signal: timeout.signal });
        const json = await readJson(response);
        return normalizeActorCacheManifest(json, response.url || url || origin);
      } finally {
        timeout.cleanup();
      }
    },
    async fetchBindingArrays(manifest, signal = undefined) {
      const timeout = withTimeout(signal, timeoutMs);
      try {
        const [indicesResponse, weightsResponse] = await Promise.all([
          fetch(manifest.skinIndicesUrl, { signal: timeout.signal }),
          fetch(manifest.skinWeightsUrl, { signal: timeout.signal })
        ]);
        if (!indicesResponse.ok) throw new Error(`Failed to fetch skin indices: HTTP ${indicesResponse.status}`);
        if (!weightsResponse.ok) throw new Error(`Failed to fetch skin weights: HTTP ${weightsResponse.status}`);
        const [indicesBuffer, weightsBuffer] = await Promise.all([
          indicesResponse.arrayBuffer(),
          weightsResponse.arrayBuffer()
        ]);
        return {
          indices: new Uint16Array(indicesBuffer),
          weights: new Float32Array(weightsBuffer)
        };
      } finally {
        timeout.cleanup();
      }
    }
  };
}
