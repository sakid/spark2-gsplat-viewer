import { afterEach, describe, expect, test, vi } from 'vitest';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('standardHumanoidRig', () => {
  test('loads the vendored local rig asset instead of a remote URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['rig'], { type: 'model/gltf-binary' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const module = await import('../src/js/internal/standardHumanoidRig');
    const file = await module.getStandardHumanoidRigFile();

    expect(file.name).toBe('xbot_humanoid.glb');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/assets/proxies/xbot_humanoid.glb');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('github');
  });
});
