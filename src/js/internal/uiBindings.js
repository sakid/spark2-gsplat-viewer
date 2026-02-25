// NEW PROXY ANIMATION
import { bindProxyUi } from './proxyUiBindings';
function byId(id, root = document) {
  if (root && typeof root.querySelector === 'function') {
    return root.querySelector(`#${id}`) ?? null;
  }
  return null;
}
function on(element, event, handler, disposers) {
  if (!element) return;
  element.addEventListener(event, handler);
  disposers.push(() => element.removeEventListener(event, handler));
}

function setMovementControlsVisible(enabled, root = document) {
  root.querySelectorAll?.('.movement-controls').forEach((node) => {
    node.style.display = enabled ? '' : 'none';
  });
}

function bindExclusiveModes(eventBus, disposers, root = document) {
  const entries = [
    { id: 'light-edit-mode', mode: 'light-edit', event: 'lights:editMode' },
    { id: 'proxy-edit-mode', mode: 'proxy-edit', event: 'environment:proxyEditMode' },
    { id: 'voxel-edit-mode', mode: 'voxel-edit', event: 'environment:voxelEditMode' },
    { id: 'outliner-edit-mode', mode: 'outliner-edit', event: 'environment:outlinerEditMode' }
  ].map((entry) => ({ ...entry, input: byId(entry.id, root) }));

  const setMode = (mode) => {
    for (const entry of entries) {
      if (!entry.input) continue;
      const enabled = entry.mode === mode;
      entry.input.checked = enabled;
      eventBus.emit(entry.event, enabled);
    }
    eventBus.emit('controls:mode', mode);
  };

  for (const entry of entries) {
    on(entry.input, 'change', () => {
      if (entry.input?.checked) return setMode(entry.mode);
      eventBus.emit(entry.event, false);
      const fallback = entries.find((item) => item.input?.checked)?.mode ?? 'view';
      eventBus.emit('controls:mode', fallback);
    }, disposers);
  }

  const initial = entries.find((entry) => entry.input?.checked)?.mode ?? 'view';
  if (initial === 'view') {
    for (const entry of entries) eventBus.emit(entry.event, false);
    eventBus.emit('controls:mode', 'view');
  } else setMode(initial);
}

function panelToggle(disposers, root = document) {
  const panel = byId('panel', root);
  const hide = byId('hide-panel-btn', root);
  const show = byId('show-panel-btn', root);
  on(hide, 'click', () => { if (panel) panel.hidden = true; if (show) show.hidden = false; }, disposers);
  on(show, 'click', () => { if (panel) panel.hidden = false; if (show) show.hidden = true; }, disposers);
}

export function bindUi(eventBus, root = document) {
  const disposers = [];
  const splatInput = byId('file-input', root);
  const loadButton = byId('load-btn', root);
  const clearButton = byId('clear-btn', root);
  const proxyInput = byId('proxy-file-input', root);
  const realignProxy = byId('realign-proxy-btn', root);
  const proxyFlipUpDown = byId('proxy-flip-updown', root);
  const proxyMirrorX = byId('proxy-mirror-x', root);
  const proxyMirrorZ = byId('proxy-mirror-z', root);
  const generateVoxel = byId('generate-voxel-btn', root);
  const exportVoxelGlb = byId('export-voxel-glb-btn', root);
  const showProxy = byId('show-proxy-mesh', root);
  const collisionEnabled = byId('collision-enabled', root);
  const flipUpDown = byId('flip-updown', root);
  const flipLeftRight = byId('flip-leftright', root);
  const qualityImproved = byId('quality-improved', root);
  const qualityMaxDetail = byId('quality-max-detail', root);
  const showLightHelpers = byId('show-light-helpers', root);
  const showLightGizmos = byId('show-light-gizmos', root);
  const showMovementControls = byId('show-movement-controls', root);
  const lightingProbes = byId('show-lighting-probes', root);
  const physicallyCorrect = byId('physically-correct-lights', root);
  const shadowsEnabled = byId('shadows-enabled', root);
  const toneMapping = byId('tone-mapping', root);
  const toneExposure = byId('tone-mapping-exposure', root);
  const outlinerFocus = byId('outliner-focus-btn', root);

  panelToggle(disposers, root);
  bindExclusiveModes(eventBus, disposers, root);
  bindProxyUi(eventBus, disposers, root);

  on(loadButton, 'click', () => {
    const file = splatInput?.files?.[0] ?? null;
    if (file) eventBus.emit('environment:loadFile', file);
    else eventBus.emit('environment:loadDefault');
  }, disposers);
  on(clearButton, 'click', () => eventBus.emit('environment:clear'), disposers);
  on(proxyInput, 'change', () => proxyInput?.files?.[0] && eventBus.emit('environment:proxyFile', proxyInput.files[0]), disposers);
  on(realignProxy, 'click', () => eventBus.emit('environment:realignProxy'), disposers);
  on(proxyFlipUpDown, 'change', () => eventBus.emit('environment:proxyFlipUpDown', Boolean(proxyFlipUpDown?.checked)), disposers);
  on(proxyMirrorX, 'change', () => eventBus.emit('environment:proxyMirrorX', Boolean(proxyMirrorX?.checked)), disposers);
  on(proxyMirrorZ, 'change', () => eventBus.emit('environment:proxyMirrorZ', Boolean(proxyMirrorZ?.checked)), disposers);
  on(generateVoxel, 'click', () => eventBus.emit('environment:generateVoxel'), disposers);
  on(exportVoxelGlb, 'click', () => eventBus.emit('environment:exportVoxelGlb'), disposers);
  on(showProxy, 'change', () => eventBus.emit('environment:showProxy', Boolean(showProxy?.checked)), disposers);
  on(collisionEnabled, 'change', () => eventBus.emit('controls:collision', Boolean(collisionEnabled?.checked)), disposers);
  on(flipUpDown, 'change', () => eventBus.emit('environment:flipUpDown', Boolean(flipUpDown?.checked)), disposers);
  on(flipLeftRight, 'change', () => eventBus.emit('environment:flipLeftRight', Boolean(flipLeftRight?.checked)), disposers);
  on(qualityImproved, 'change', () => eventBus.emit('quality:improved', Boolean(qualityImproved?.checked)), disposers);
  on(qualityMaxDetail, 'change', () => eventBus.emit('quality:maxDetail', Boolean(qualityMaxDetail?.checked)), disposers);
  on(showLightHelpers, 'change', () => eventBus.emit('lights:showHelpers', Boolean(showLightHelpers?.checked)), disposers);
  on(showLightGizmos, 'change', () => eventBus.emit('lights:showGizmos', Boolean(showLightGizmos?.checked)), disposers);
  on(showMovementControls, 'change', () => {
    const enabled = Boolean(showMovementControls?.checked);
    setMovementControlsVisible(enabled, root);
    eventBus.emit('lights:showMovementControls', enabled);
  }, disposers);
  on(lightingProbes, 'change', () => eventBus.emit('lights:showProbes', Boolean(lightingProbes?.checked)), disposers);
  on(outlinerFocus, 'click', () => eventBus.emit('selection:focusRequested'), disposers);

  const emitLighting = () => eventBus.emit('lights:rendererSettings', {
    physicallyCorrectLights: Boolean(physicallyCorrect?.checked),
    shadowsEnabled: Boolean(shadowsEnabled?.checked),
    toneMapping: toneMapping?.value ?? 'ACESFilmic',
    toneMappingExposure: Number(toneExposure?.value ?? 1)
  });
  on(physicallyCorrect, 'change', emitLighting, disposers);
  on(shadowsEnabled, 'change', emitLighting, disposers);
  on(toneMapping, 'change', emitLighting, disposers);
  on(toneExposure, 'change', emitLighting, disposers);

  eventBus.emit('environment:flipUpDown', Boolean(flipUpDown?.checked));
  eventBus.emit('environment:flipLeftRight', Boolean(flipLeftRight?.checked));
  eventBus.emit('environment:proxyFlipUpDown', Boolean(proxyFlipUpDown?.checked));
  eventBus.emit('environment:proxyMirrorX', Boolean(proxyMirrorX?.checked));
  eventBus.emit('environment:proxyMirrorZ', Boolean(proxyMirrorZ?.checked));
  eventBus.emit('environment:showProxy', Boolean(showProxy?.checked));
  eventBus.emit('controls:collision', collisionEnabled ? Boolean(collisionEnabled.checked) : false);
  eventBus.emit('quality:improved', Boolean(qualityImproved?.checked));
  eventBus.emit('quality:maxDetail', Boolean(qualityMaxDetail?.checked));
  eventBus.emit('lights:showHelpers', showLightHelpers ? Boolean(showLightHelpers.checked) : true);
  eventBus.emit('lights:showGizmos', showLightGizmos ? Boolean(showLightGizmos.checked) : true);
  setMovementControlsVisible(showMovementControls ? Boolean(showMovementControls.checked) : true, root);
  eventBus.emit('lights:showMovementControls', showMovementControls ? Boolean(showMovementControls.checked) : true);
  eventBus.emit('lights:showProbes', lightingProbes ? Boolean(lightingProbes.checked) : true);
  emitLighting();

  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}
