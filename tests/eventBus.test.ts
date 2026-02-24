import { describe, expect, test, vi } from 'vitest';
import { createEventBus } from '../src/utils/eventBus';

describe('eventBus', () => {
  test('subscribes, emits, and unsubscribes', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const off = bus.on('hello', handler);

    bus.emit('hello', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 1 });

    off();
    bus.emit('hello', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('off removes only targeted handler', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();

    bus.on('tick', a);
    bus.on('tick', b);
    bus.off('tick', a);
    bus.emit('tick', 10);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(10);
  });
});
