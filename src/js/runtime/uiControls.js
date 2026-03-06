import { bindUi } from '../internal/uiBindings';

export function bindUiWhenReady(state) {
  const bind = (root = document) => {
    state.uiDispose();
    state.uiDispose = bindUi(state.eventBus, root);
    state.uiRoot = root;
    state.uiBound = true;
  };

  const onControlsReady = (payload) => {
    const root = payload?.root;
    if (root instanceof HTMLElement) {
      if (!root.querySelector('#panel')) return;
      bind(root);
      return;
    }
    if (document.getElementById('panel')) bind();
  };

  const onControlsDisposed = () => {
    state.uiDispose();
    state.uiDispose = () => {};
    state.uiRoot = null;
    state.uiBound = false;
  };

  state.uiReadyDispose();
  const disposers = [
    state.eventBus.on?.('ui:controlsReady', onControlsReady) ?? (() => state.eventBus.off?.('ui:controlsReady', onControlsReady)),
    state.eventBus.on?.('ui:controlsDisposed', onControlsDisposed) ?? (() => state.eventBus.off?.('ui:controlsDisposed', onControlsDisposed))
  ];
  state.uiReadyDispose = () => {
    for (const dispose of disposers.splice(0)) dispose();
  };

  if (document.getElementById('panel')) {
    bind();
  }
}

export function getControl(state, id) {
  const uiScoped = state.uiRoot?.querySelector?.(`#${id}`);
  if (uiScoped) return uiScoped;
  return document.getElementById(id);
}

export function setInputValue(state, id, value) {
  const input = getControl(state, id);
  if (!input) return;
  if ('value' in input) input.value = value;
}

export function setChecked(state, id, checked) {
  const input = getControl(state, id);
  if (!input || !('checked' in input)) return;
  input.checked = Boolean(checked);
}

export function readChecked(state, id, fallback = false) {
  const input = getControl(state, id);
  if (!input || !('checked' in input)) return fallback;
  return Boolean(input.checked);
}

export function readNumber(state, id, fallback = 0) {
  const input = getControl(state, id);
  if (!input || !('value' in input)) return fallback;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

export function readText(state, id, fallback = '') {
  const input = getControl(state, id);
  if (!input || !('value' in input)) return fallback;
  const value = String(input.value ?? '').trim();
  return value || fallback;
}

