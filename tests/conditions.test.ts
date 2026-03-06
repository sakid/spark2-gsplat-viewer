import { describe, expect, test } from 'vitest';
import { GameState } from '../src/js/gameplay/state/GameState';
import { evalCondition } from '../src/js/gameplay/dialog/conditions';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    }
  };
}

describe('dialog conditions', () => {
  test('evaluates flag conditions', () => {
    const state = new GameState({ storage: createMemoryStorage() });
    state.setFlag('a', true);
    expect(evalCondition({ flag: 'a' }, state)).toBe(true);
    expect(evalCondition({ flag: 'a', is: false }, state)).toBe(false);
  });

  test('evaluates var comparisons', () => {
    const state = new GameState({ storage: createMemoryStorage() });
    state.setVar('n', 5);
    expect(evalCondition({ var: 'n', gt: 3 }, state)).toBe(true);
    expect(evalCondition({ var: 'n', lt: 3 }, state)).toBe(false);
    expect(evalCondition({ var: 'n', eq: 5 }, state)).toBe(true);
  });

  test('evaluates all/any/not', () => {
    const state = new GameState({ storage: createMemoryStorage() });
    state.setFlag('a', true);
    state.setFlag('b', false);
    expect(evalCondition({ all: [{ flag: 'a' }, { not: { flag: 'b' } }] }, state)).toBe(true);
    expect(evalCondition({ any: [{ flag: 'b' }, { flag: 'a' }] }, state)).toBe(true);
  });

  test('evaluates quest status', () => {
    const state = new GameState({ storage: createMemoryStorage() });
    expect(evalCondition({ quest: 'q', status: 'inactive' }, state)).toBe(true);
    state.startQuest('q');
    expect(evalCondition({ quest: 'q', status: 'active' }, state)).toBe(true);
    state.completeQuest('q');
    expect(evalCondition({ quest: 'q', status: 'completed' }, state)).toBe(true);
  });
});

