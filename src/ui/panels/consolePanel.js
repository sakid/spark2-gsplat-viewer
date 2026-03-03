const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

export function createConsolePanel(element, eventBus) {
  const root = document.createElement('div');
  root.className = 'spark-console';
  const list = document.createElement('ul');
  list.className = 'spark-console-list';
  root.append(list);
  element.append(root);

  const selectionLabel = (payload) => {
    if (payload?.target === 'world') return payload?.label || 'World / Level Settings';
    if (payload?.target === 'player') return payload?.object?.name || 'Player';
    return payload?.object?.name || payload?.object?.uuid || 'none';
  };

  const push = (message) => {
    const row = document.createElement('li');
    row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    list.prepend(row);
    while (list.children.length > 100) {
      list.removeChild(list.lastElementChild);
    }
  };

  const disposers = [
    eventUnsub(eventBus, 'sceneLoaded', () => push('Scene loaded')),
    eventUnsub(eventBus, 'objectAdded', (payload) => push(`Object added: ${payload?.object?.name || payload?.object?.uuid || 'unknown'}`)),
    eventUnsub(eventBus, 'objectRemoved', (payload) => push(`Object removed: ${payload?.object?.name || payload?.object?.uuid || 'unknown'}`)),
    eventUnsub(eventBus, 'selectionChanged', (payload) => push(`Selection changed: ${selectionLabel(payload)}`))
  ];

  return () => {
    for (const dispose of disposers) dispose();
    element.replaceChildren();
  };
}
