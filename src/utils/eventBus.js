// NEW PROXY ANIMATION
export function createEventBus() {
  const listeners = new Map();

  const on = (event, handler) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(handler);
    return () => off(event, handler);
  };

  const off = (event, handler) => {
    const handlers = listeners.get(event);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      listeners.delete(event);
    }
  };

  const emit = (event, payload) => {
    const handlers = listeners.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }
    if (handlers.size === 1) {
      handlers.values().next().value(payload);
      return;
    }
    for (const handler of [...handlers]) handler(payload);
  };

  const clear = () => {
    listeners.clear();
  };

  return { on, off, emit, clear };
}
