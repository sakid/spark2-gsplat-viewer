import { afterEach, describe, expect, test, vi } from 'vitest';
import { createActorCacheClient } from '../src/js/internal/actorCacheClient';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('actorCacheClient', () => {
  test('normalizes relative manifest URLs to the sidecar origin', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: 'job-1',
        status: 'done',
        stage: 'done',
        progress: 1,
        manifestUrl: '/artifacts/job-1/manifest.json'
      })
    }) as unknown as typeof fetch;

    const client = createActorCacheClient({ origin: 'http://127.0.0.1:3210' });
    const state = await client.getJob('job-1');

    expect(state.manifestUrl).toBe('http://127.0.0.1:3210/artifacts/job-1/manifest.json');
  });
});
