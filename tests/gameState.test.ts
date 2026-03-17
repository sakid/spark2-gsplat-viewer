import { describe, expect, test, vi } from 'vitest';
import { GameState, GAME_STATE_STORAGE_KEY } from '../src/js/gameplay/state/GameState';
import { createEventBus } from '../src/utils/eventBus';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    }
  };
}

describe('GameState', () => {
  test('sets and reads flags/vars/quests', () => {
    const bus = createEventBus();
    const storage = createMemoryStorage();
    const state = new GameState({ eventBus: bus, storage });

    state.setFlag('met', true);
    expect(state.getFlag('met')).toBe(true);

    state.setVar('name', 'Aly');
    expect(state.getVar('name')).toBe('Aly');

    state.incVar('count', 2);
    expect(state.getVar('count')).toBe(2);

    state.startQuest('sheep');
    expect(state.getQuest('sheep')?.status).toBe('active');
    state.setQuestStage('sheep', 'find');
    expect(state.getQuest('sheep')?.stage).toBe('find');
    state.completeQuest('sheep');
    expect(state.getQuest('sheep')?.status).toBe('completed');
  });

  test('autosaves to storage (debounced)', () => {
    vi.useFakeTimers();
    const bus = createEventBus();
    const storage = createMemoryStorage();
    const state = new GameState({ eventBus: bus, storage });

    state.setFlag('x', true);
    expect(storage.getItem(GAME_STATE_STORAGE_KEY)).toBe(null);

    vi.advanceTimersByTime(300);
    const raw = storage.getItem(GAME_STATE_STORAGE_KEY);
    expect(raw).toContain('"flags"');
    vi.useRealTimers();
  });

  test('loads from storage snapshot', () => {
    const bus = createEventBus();
    const storage = createMemoryStorage();
    storage.setItem(
      GAME_STATE_STORAGE_KEY,
      JSON.stringify({
        flags: { met_sean: true },
        vars: { name: 'Sean' },
        quests: { sheep: { status: 'active', stage: 'find' } },
        meta: { version: 1, createdAt: 'x', updatedAt: 'y' }
      })
    );

    const state = new GameState({ eventBus: bus, storage });
    expect(state.load()).toBe(true);
    expect(state.getFlag('met_sean')).toBe(true);
    expect(state.getVar('name')).toBe('Sean');
    expect(state.getQuest('sheep')?.stage).toBe('find');
  });
});

