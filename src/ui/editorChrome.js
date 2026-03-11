const NAV_MODE_STORAGE_KEY = 'spark-editor-navmode-v1';
const DEFAULT_SNAP_SETTINGS = {
  enabled: true,
  space: 'world',
  translate: 0.25,
  rotate: 15,
  scale: 0.1
};

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

function normalizeMode(mode) {
  if (
    mode === 'view'
    || mode === 'object-edit'
    || mode === 'gameplay'
    || mode === 'sheep-edit'
    || mode === 'voxel-edit'
  ) {
    return mode;
  }
  return 'view';
}

function normalizeNavMode(mode) {
  return mode === 'orbit' ? 'orbit' : 'fly';
}

function normalizeWorkspacePreset(value) {
  return value === 'advanced' ? 'advanced' : 'minimal';
}

function createSelectOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function createButton(label, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

export function createEditorChrome(eventBus) {
  const root = document.createElement('header');
  root.className = 'spark-topbar';

  const modeWrap = document.createElement('div');
  modeWrap.className = 'spark-topbar-group';
  const modeLabel = document.createElement('label');
  modeLabel.className = 'spark-topbar-label';
  modeLabel.textContent = 'Mode';
  const modeSelect = document.createElement('select');
  modeSelect.className = 'spark-topbar-select';
  createSelectOption(modeSelect, 'view', 'View');
  createSelectOption(modeSelect, 'object-edit', 'Object Edit');
  createSelectOption(modeSelect, 'gameplay', 'Gameplay');
  createSelectOption(modeSelect, 'sheep-edit', 'Sheep Edit');
  createSelectOption(modeSelect, 'voxel-edit', 'Voxel Edit');
  modeWrap.append(modeLabel, modeSelect);

  const navWrap = document.createElement('div');
  navWrap.className = 'spark-topbar-group';
  const navLabel = document.createElement('label');
  navLabel.className = 'spark-topbar-label';
  navLabel.textContent = 'Navigation';
  const navSelect = document.createElement('select');
  navSelect.className = 'spark-topbar-select';
  createSelectOption(navSelect, 'fly', 'Fly');
  createSelectOption(navSelect, 'orbit', 'Orbit');
  navWrap.append(navLabel, navSelect);

  const workspaceWrap = document.createElement('div');
  workspaceWrap.className = 'spark-topbar-group';
  const workspaceLabel = document.createElement('label');
  workspaceLabel.className = 'spark-topbar-label';
  workspaceLabel.textContent = 'Workspace';
  const workspaceSelect = document.createElement('select');
  workspaceSelect.className = 'spark-topbar-select';
  createSelectOption(workspaceSelect, 'minimal', 'Minimal');
  createSelectOption(workspaceSelect, 'advanced', 'Advanced');
  const resetLayoutBtn = createButton('Reset Layout');
  workspaceWrap.append(workspaceLabel, workspaceSelect, resetLayoutBtn);

  const transformWrap = document.createElement('div');
  transformWrap.className = 'spark-topbar-group spark-topbar-tools';
  const selectBtn = createButton('Q Select', 'spark-topbar-tool');
  const moveBtn = createButton('W Move', 'spark-topbar-tool');
  const rotateBtn = createButton('E Rotate', 'spark-topbar-tool');
  const scaleBtn = createButton('R Scale', 'spark-topbar-tool');
  transformWrap.append(selectBtn, moveBtn, rotateBtn, scaleBtn);

  const historyWrap = document.createElement('div');
  historyWrap.className = 'spark-topbar-group spark-topbar-actions';
  const undoBtn = createButton('Undo');
  const redoBtn = createButton('Redo');
  const focusBtn = createButton('Focus');
  historyWrap.append(undoBtn, redoBtn, focusBtn);

  const snapWrap = document.createElement('div');
  snapWrap.className = 'spark-topbar-group spark-topbar-snap';
  const snapToggleLabel = document.createElement('label');
  snapToggleLabel.className = 'spark-topbar-checkbox';
  const snapEnabled = document.createElement('input');
  snapEnabled.type = 'checkbox';
  snapEnabled.checked = true;
  const snapText = document.createElement('span');
  snapText.textContent = 'Snap';
  snapToggleLabel.append(snapEnabled, snapText);

  const snapSpace = document.createElement('select');
  snapSpace.className = 'spark-topbar-select';
  createSelectOption(snapSpace, 'world', 'World');
  createSelectOption(snapSpace, 'local', 'Local');

  const snapTranslate = document.createElement('input');
  snapTranslate.type = 'number';
  snapTranslate.min = '0.01';
  snapTranslate.step = '0.01';
  snapTranslate.value = String(DEFAULT_SNAP_SETTINGS.translate);
  snapTranslate.className = 'spark-topbar-number';

  const snapRotate = document.createElement('input');
  snapRotate.type = 'number';
  snapRotate.min = '0.1';
  snapRotate.step = '0.1';
  snapRotate.value = String(DEFAULT_SNAP_SETTINGS.rotate);
  snapRotate.className = 'spark-topbar-number';

  const snapScale = document.createElement('input');
  snapScale.type = 'number';
  snapScale.min = '0.01';
  snapScale.step = '0.01';
  snapScale.value = String(DEFAULT_SNAP_SETTINGS.scale);
  snapScale.className = 'spark-topbar-number';

  snapWrap.append(snapToggleLabel, snapSpace, snapTranslate, snapRotate, snapScale);

  const status = document.createElement('p');
  status.id = 'spark-status';
  status.className = 'info';
  status.textContent = 'Editor ready.';

  root.append(modeWrap, navWrap, workspaceWrap, transformWrap, historyWrap, snapWrap, status);

  let mode = 'view';
  let transformMode = 'translate';
  let navMode = normalizeNavMode(localStorage.getItem(NAV_MODE_STORAGE_KEY));
  let workspacePreset = 'minimal';
  modeSelect.value = mode;
  navSelect.value = navMode;
  workspaceSelect.value = workspacePreset;

  const setActiveTransformButton = (nextMode) => {
    transformMode = nextMode;
    const isSelect = nextMode === 'select';
    selectBtn.classList.toggle('active', isSelect);
    moveBtn.classList.toggle('active', nextMode === 'translate');
    rotateBtn.classList.toggle('active', nextMode === 'rotate');
    scaleBtn.classList.toggle('active', nextMode === 'scale');
  };
  setActiveTransformButton(transformMode);

  const emitMode = (nextMode) => {
    mode = normalizeMode(nextMode);
    modeSelect.value = mode;
    eventBus.emit('editor:objectEditMode', mode === 'object-edit');
    eventBus.emit('gameplay:enable', mode === 'gameplay');
    eventBus.emit('environment:sheepGizmoEnabled', mode === 'sheep-edit');
    eventBus.emit('environment:voxelEditMode', mode === 'voxel-edit');
    eventBus.emit('controls:mode', mode);
  };

  const emitNavMode = (nextNavMode) => {
    navMode = normalizeNavMode(nextNavMode);
    navSelect.value = navMode;
    try {
      localStorage.setItem(NAV_MODE_STORAGE_KEY, navMode);
    } catch {
      // Ignore storage write failures.
    }
    eventBus.emit('controls:navigationMode', navMode);
  };

  const emitSnapSettings = () => {
    const translate = Math.max(0.01, Number(snapTranslate.value) || DEFAULT_SNAP_SETTINGS.translate);
    const rotate = Math.max(0.1, Number(snapRotate.value) || DEFAULT_SNAP_SETTINGS.rotate);
    const scale = Math.max(0.01, Number(snapScale.value) || DEFAULT_SNAP_SETTINGS.scale);
    eventBus.emit('editor:snapSettingsChanged', {
      enabled: Boolean(snapEnabled.checked),
      space: snapSpace.value === 'local' ? 'local' : 'world',
      translate,
      rotate,
      scale
    });
  };

  const onTransformTool = (nextMode) => {
    const normalized = nextMode === 'rotate' || nextMode === 'scale' || nextMode === 'translate' || nextMode === 'select'
      ? nextMode
      : 'translate';
    if (normalized === 'select') {
      emitMode('view');
    } else if (mode !== 'object-edit') {
      emitMode('object-edit');
    }
    eventBus.emit('editor:transformModeRequested', { mode: normalized });
  };

  modeSelect.addEventListener('change', () => {
    emitMode(modeSelect.value);
  });
  navSelect.addEventListener('change', () => {
    emitNavMode(navSelect.value);
  });
  workspaceSelect.addEventListener('change', () => {
    eventBus.emit('workspace:layoutPresetRequested', { preset: normalizeWorkspacePreset(workspaceSelect.value) });
  });
  resetLayoutBtn.addEventListener('click', () => {
    eventBus.emit('workspace:resetLayoutRequested');
  });

  selectBtn.addEventListener('click', () => onTransformTool('select'));
  moveBtn.addEventListener('click', () => onTransformTool('translate'));
  rotateBtn.addEventListener('click', () => onTransformTool('rotate'));
  scaleBtn.addEventListener('click', () => onTransformTool('scale'));

  undoBtn.addEventListener('click', () => eventBus.emit('editor:undoRequested'));
  redoBtn.addEventListener('click', () => eventBus.emit('editor:redoRequested'));
  focusBtn.addEventListener('click', () => eventBus.emit('selection:focusRequested'));

  snapEnabled.addEventListener('change', emitSnapSettings);
  snapSpace.addEventListener('change', emitSnapSettings);
  snapTranslate.addEventListener('change', emitSnapSettings);
  snapRotate.addEventListener('change', emitSnapSettings);
  snapScale.addEventListener('change', emitSnapSettings);

  const disposers = [
    eventUnsub(eventBus, 'controls:mode', (nextMode) => {
      mode = normalizeMode(nextMode);
      modeSelect.value = mode;
    }),
    eventUnsub(eventBus, 'controls:navigationMode', (nextNavMode) => {
      navMode = normalizeNavMode(nextNavMode);
      navSelect.value = navMode;
      try {
        localStorage.setItem(NAV_MODE_STORAGE_KEY, navMode);
      } catch {
        // Ignore storage write failures.
      }
    }),
    eventUnsub(eventBus, 'workspace:layoutPresetChanged', (payload) => {
      workspacePreset = normalizeWorkspacePreset(payload?.preset);
      workspaceSelect.value = workspacePreset;
    }),
    eventUnsub(eventBus, 'editor:transformModeChanged', (payload) => {
      const nextMode = payload?.mode;
      if (nextMode === 'select' || nextMode === 'translate' || nextMode === 'rotate' || nextMode === 'scale') {
        setActiveTransformButton(nextMode);
      }
    }),
    eventUnsub(eventBus, 'editor:snapSettingsChanged', (settings) => {
      if (!settings || typeof settings !== 'object') return;
      if ('enabled' in settings) snapEnabled.checked = Boolean(settings.enabled);
      if ('space' in settings) snapSpace.value = settings.space === 'local' ? 'local' : 'world';
      if ('translate' in settings) snapTranslate.value = String(Math.max(0.01, Number(settings.translate) || DEFAULT_SNAP_SETTINGS.translate));
      if ('rotate' in settings) snapRotate.value = String(Math.max(0.1, Number(settings.rotate) || DEFAULT_SNAP_SETTINGS.rotate));
      if ('scale' in settings) snapScale.value = String(Math.max(0.01, Number(settings.scale) || DEFAULT_SNAP_SETTINGS.scale));
    })
  ];

  emitNavMode(navMode);
  emitSnapSettings();
  eventBus.emit('workspace:requestPreset');

  return {
    element: root,
    dispose() {
      for (const dispose of disposers.splice(0)) dispose();
      root.remove();
    }
  };
}
