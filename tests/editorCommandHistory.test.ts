import { describe, expect, test } from 'vitest';
import { EditorCommandHistory } from '../src/js/internal/editorCommandHistory';

describe('EditorCommandHistory', () => {
  test('executes, undoes, and redoes a simple command', () => {
    let value = 0;
    const history = new EditorCommandHistory();

    history.execute({
      label: 'Increment',
      do: () => {
        value += 1;
      },
      undo: () => {
        value -= 1;
      }
    });

    expect(value).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    history.undo();
    expect(value).toBe(0);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(value).toBe(1);
  });

  test('batches commands in a transaction', () => {
    const values: number[] = [];
    const history = new EditorCommandHistory();

    history.beginTransaction('Batch');
    history.execute({
      label: 'Add 1',
      do: () => values.push(1),
      undo: () => values.pop()
    });
    history.execute({
      label: 'Add 2',
      do: () => values.push(2),
      undo: () => values.pop()
    });
    history.commitTransaction();

    expect(values).toEqual([1, 2]);
    history.undo();
    expect(values).toEqual([]);
    history.redo();
    expect(values).toEqual([1, 2]);
  });
});

