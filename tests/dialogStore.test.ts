import { describe, expect, test } from 'vitest';
import { DialogStore } from '../src/js/gameplay/dialog/DialogStore';

describe('dialog store', () => {
  test('loads built-in dialog graphs when remote index is unavailable', async () => {
    const store = new DialogStore({
      fetchFn: async () => ({ ok: false, status: 503, json: async () => ({}) })
    });

    const intro = await store.getGraph('sean_intro');
    expect(intro.id).toBe('sean_intro');
    expect(intro.start).toBe('start');

    const found = await store.getGraph('sheep_found');
    expect(found.id).toBe('sheep_found');
    expect(found.nodes.start.type).toBe('line');

    await expect(store.getGraph('missing_dialog')).rejects.toThrow('Unknown dialog id');
  });
});
