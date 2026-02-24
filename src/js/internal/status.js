// NEW PROXY ANIMATION
export function createStatusReporter(statusElement) {
  const setStatus = (message, kind = 'info') => {
    if (!statusElement) {
      if (kind === 'error') {
        console.error(message);
      }
      return;
    }
    statusElement.textContent = message;
    statusElement.dataset.kind = kind;
    statusElement.className = kind;
  };

  return { setStatus };
}
