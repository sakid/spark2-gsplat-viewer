// NEW PROXY ANIMATION
export function createStatusReporter(statusElement) {
  let currentStatusElement = statusElement ?? null;
  let lastMessage = '';
  let lastKind = 'info';

  const applyStatus = (target, message, kind) => {
    target.textContent = message;
    target.dataset.kind = kind;
    target.className = kind;
  };

  const resolveStatusElement = (root = null) => {
    if (root && typeof root.querySelector === 'function') {
      const scoped = root.querySelector('#status');
      if (scoped) {
        currentStatusElement = scoped;
        return scoped;
      }
    }

    if (currentStatusElement?.isConnected) {
      return currentStatusElement;
    }

    if (typeof document !== 'undefined') {
      const status = document.getElementById('status');
      if (status) {
        currentStatusElement = status;
        return status;
      }
    }

    return currentStatusElement;
  };

  const setStatus = (message, kind = 'info') => {
    lastMessage = message;
    lastKind = kind;
    const target = resolveStatusElement();
    if (!target) {
      if (kind === 'error') {
        console.error(message);
      }
      return;
    }
    applyStatus(target, message, kind);
  };

  const resync = (root = null) => {
    const target = resolveStatusElement(root);
    if (!target || !lastMessage) return;
    applyStatus(target, lastMessage, lastKind);
  };

  return { setStatus, resync };
}
