import { describe, expect, test } from 'vitest';
import { createEventBus } from '../src/utils/eventBus';
import { GameState } from '../src/js/gameplay/state/GameState';
import { DialogRuntime } from '../src/js/gameplay/dialog/DialogRuntime';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    }
  };
}

describe('DialogRuntime', () => {
  test('runs line -> choice -> end and applies commands', async () => {
    const bus = createEventBus();
    const state = new GameState({ eventBus: bus, storage: createMemoryStorage() });
    state.setVar('name', 'Player');

    const graph = {
      id: 'test',
      start: 'start',
      nodes: {
        start: { type: 'line', speaker: 'NPC', text: 'Hello {{var.name}}', next: 'menu' },
        menu: {
          type: 'choice',
          text: 'Choose:',
          choices: [
            { text: 'Set flag', next: 'end', commands: [{ op: 'setFlag', key: 'did', value: true }] },
            { text: 'Hidden', next: 'end', condition: { flag: 'never' } }
          ]
        },
        end: { type: 'end', commands: [{ op: 'endDialog' }] }
      }
    };

    const store = { getGraph: async () => graph };
    const runtime = new DialogRuntime({ eventBus: bus, state, store, world: {} as any });

    const updates: any[] = [];
    bus.on('dialog:updated', (payload) => updates.push(payload));

    await runtime.startDialog('test', {});
    expect(runtime.isActive()).toBe(true);
    expect(updates[0].renderedText).toBe('Hello Player');

    runtime.advance();
    expect(updates.at(-1).choices.length).toBe(1);

    runtime.choose(0);
    expect(state.getFlag('did')).toBe(true);
    expect(runtime.isActive()).toBe(false);
  });

  test('supports goto nodes', async () => {
    const bus = createEventBus();
    const state = new GameState({ eventBus: bus, storage: createMemoryStorage() });
    state.setFlag('x', true);

    const graph = {
      id: 'test2',
      start: 'gate',
      nodes: {
        gate: { type: 'goto', condition: { flag: 'x' }, target: 'a', elseTarget: 'b' },
        a: { type: 'line', text: 'A', next: 'end' },
        b: { type: 'line', text: 'B', next: 'end' },
        end: { type: 'end', commands: [{ op: 'endDialog' }] }
      }
    };

    const store = { getGraph: async () => graph };
    const runtime = new DialogRuntime({ eventBus: bus, state, store, world: {} as any });

    await runtime.startDialog('test2', {});
    expect(runtime.getSnapshot().renderedText).toBe('A');
  });
});

