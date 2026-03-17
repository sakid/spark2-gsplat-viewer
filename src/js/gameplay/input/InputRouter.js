function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toLowerCase?.() ?? '';
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function mapKeyToAction(event) {
  const code = event?.code ?? '';
  if (code === 'KeyE') return 'Interact';
  if (code === 'Space' || code === 'Enter') return 'DialogAdvance';
  if (code === 'Escape') return 'DialogClose';
  if (/^Digit[1-9]$/.test(code)) return `DialogChoice${code.slice(-1)}`;
  return null;
}

export class InputRouter {
  constructor({ eventBus, getMode, isDialogActive }) {
    this.eventBus = eventBus;
    this.getMode = typeof getMode === 'function' ? getMode : () => 'view';
    this.isDialogActive = typeof isDialogActive === 'function' ? isDialogActive : () => false;
    this.unsubscribers = [];
  }

  init() {
    const on = (event, handler) => {
      const dispose = this.eventBus.on?.(event, handler) ?? (() => this.eventBus.off?.(event, handler));
      this.unsubscribers.push(dispose);
    };

    on('dom:keydown', (event) => this.onKeyDown(event));
  }

  onKeyDown(event) {
    if (event?.repeat) return;
    if (isEditableTarget(event?.target)) return;

    const action = mapKeyToAction(event);
    if (!action) return;

    const dialogActive = Boolean(this.isDialogActive());
    const mode = this.getMode();

    if (dialogActive) {
      if (action === 'Interact') return;
      this.eventBus.emit('input:action', { action });
      return;
    }

    if (mode !== 'view' && mode !== 'gameplay') return;
    if (action !== 'Interact') return;
    this.eventBus.emit('input:action', { action });
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
  }
}
