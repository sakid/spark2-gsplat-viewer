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

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setMovementControlsVisible(enabled, root = document) {
  root.querySelectorAll?.('.movement-controls').forEach((node) => {
    node.style.display = enabled ? '' : 'none';
  });
}

function bindExclusiveModes(eventBus, disposers, root = document, onModeChange = () => {}) {
  const entries = [
    { id: 'object-edit-mode', mode: 'object-edit', event: 'editor:objectEditMode' },
    { id: 'gameplay-level-enabled', mode: 'gameplay', event: 'gameplay:enable' },
    { id: 'sheep-gizmo-enabled', mode: 'sheep-edit', event: 'environment:sheepGizmoEnabled' },
    { id: 'voxel-edit-mode', mode: 'voxel-edit', event: 'environment:voxelEditMode' }
  ].map((entry) => ({ ...entry, input: byId(entry.id, root) }));

  const setMode = (mode) => {
    for (const entry of entries) {
      if (!entry.input) continue;
      const enabled = entry.mode === mode;
      entry.input.checked = enabled;
      if (entry.event) eventBus.emit(entry.event, enabled);
    }
    eventBus.emit('controls:mode', mode);
    onModeChange(mode);
  };

  for (const entry of entries) {
    on(entry.input, 'change', () => {
      if (entry.input?.checked) return setMode(entry.mode);
      if (entry.event) eventBus.emit(entry.event, false);
      const fallback = entries.find((item) => item.input?.checked)?.mode ?? 'view';
      eventBus.emit('controls:mode', fallback);
      onModeChange(fallback);
    }, disposers);
  }

  const initial = entries.find((entry) => entry.input?.checked)?.mode ?? 'view';
  if (initial === 'view') {
    for (const entry of entries) {
      if (entry.event) eventBus.emit(entry.event, false);
    }
    eventBus.emit('controls:mode', 'view');
    onModeChange('view');
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
  const panel = byId('panel', root);
  const minimalUiMode = byId('minimal-ui-mode', root);
  const splatInput = byId('file-input', root);
  const splatLoadedName = byId('splat-loaded-name', root);
  const interactionMode = byId('interaction-mode', root);
  const gameplayLevelEnabled = byId('gameplay-level-enabled', root);
  const gameplayStartLevel = byId('gameplay-start-level-btn', root);
  const gameplayStopLevel = byId('gameplay-stop-level-btn', root);
  const gameplayResetProgress = byId('gameplay-reset-progress-btn', root);
  const gameplayLevelStatus = byId('gameplay-level-status', root);
  const loadButton = byId('load-btn', root);
  const clearButton = byId('clear-btn', root);
  const proxyInput = byId('proxy-file-input', root);
  const runVoxelWorkflow = byId('run-voxel-workflow-btn', root);
  const workflowSummary = byId('workflow-summary', root);
  const realignProxy = byId('realign-proxy-btn', root);
  const proxyFlipUpDown = byId('proxy-flip-updown', root);
  const proxyMirrorX = byId('proxy-mirror-x', root);
  const proxyMirrorZ = byId('proxy-mirror-z', root);
  const proxyAlignProfile = byId('proxy-align-profile', root);
  const generateVoxel = byId('generate-voxel-btn', root);
  const regenerateVoxelRig = byId('regenerate-voxel-rig-btn', root);
  const exportVoxelGlb = byId('export-voxel-glb-btn', root);
  const voxelEditMode = byId('voxel-edit-mode', root);
  const voxelEditControls = byId('voxel-edit-controls', root);
  const voxelSelectionCount = byId('voxel-selection-count', root);
  const voxelDeleteBtn = byId('voxel-delete-btn', root);
  const voxelUndoBtn = byId('voxel-undo-btn', root);
  const voxelSelectConnectedBtn = byId('voxel-select-connected-btn', root);
  const voxelInvertSelectionBtn = byId('voxel-invert-selection-btn', root);
  const voxelExtractActorBtn = byId('voxel-extract-actor-btn', root);
  const voxelActorPoseMode = byId('voxel-actor-pose-mode', root);
  const voxelAutoSegmentBtn = byId('voxel-auto-segment-btn', root);
  const voxelSegColorThreshold = byId('voxel-seg-color-threshold', root);
  const voxelSegMinCount = byId('voxel-seg-min-count', root);
  const viewMode = byId('view-mode', root);
  const showProxy = byId('show-proxy-mesh', root);
  const showProxyBones = byId('show-proxy-bones', root);
  const objectEditMode = byId('object-edit-mode', root);
  const editorSnapEnabled = byId('editor-snap-enabled', root);
  const editorGizmoSpace = byId('editor-gizmo-space', root);
  const editorTranslateSnap = byId('editor-translate-snap', root);
  const editorRotateSnap = byId('editor-rotate-snap', root);
  const editorScaleSnap = byId('editor-scale-snap', root);
  const editorUndoBtn = byId('editor-undo-btn', root);
  const editorRedoBtn = byId('editor-redo-btn', root);
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
  const sceneNameInput = byId('scene-name', root);
  const saveSceneFileBtn = byId('save-scene-file-btn', root);
  const openSceneFileBtn = byId('open-scene-file-btn', root);
  const loadSceneFileInput = byId('load-scene-file-input', root);
  const sceneSlotNameInput = byId('scene-slot-name', root);
  const sceneSlotSelect = byId('scene-slot-select', root);
  const saveSceneSlotBtn = byId('save-scene-slot-btn', root);
  const loadSceneSlotBtn = byId('load-scene-slot-btn', root);
  const deleteSceneSlotBtn = byId('delete-scene-slot-btn', root);
  const sheepAlignX = byId('sheep-align-x', root);
  const sheepAlignY = byId('sheep-align-y', root);
  const sheepAlignZ = byId('sheep-align-z', root);
  const sheepAlignPitch = byId('sheep-align-pitch', root);
  const sheepAlignYaw = byId('sheep-align-yaw', root);
  const sheepAlignRoll = byId('sheep-align-roll', root);
  const sheepAlignScale = byId('sheep-align-scale', root);
  const sheepGizmoEnabled = byId('sheep-gizmo-enabled', root);
  const sheepGizmoTarget = byId('sheep-gizmo-target', root);
  const sheepGizmoMode = byId('sheep-gizmo-mode', root);
  const sheepAlignApply = byId('sheep-align-apply-btn', root);
  const sheepAlignAutoCenter = byId('sheep-align-autocenter-btn', root);
  const sheepAlignReset = byId('sheep-align-reset-btn', root);
  const sheepCropEnabled = byId('sheep-crop-enabled', root);
  const sheepCropShowBox = byId('sheep-crop-show-box', root);
  const sheepCropCenterX = byId('sheep-crop-center-x', root);
  const sheepCropCenterY = byId('sheep-crop-center-y', root);
  const sheepCropCenterZ = byId('sheep-crop-center-z', root);
  const sheepCropSizeX = byId('sheep-crop-size-x', root);
  const sheepCropSizeY = byId('sheep-crop-size-y', root);
  const sheepCropSizeZ = byId('sheep-crop-size-z', root);
  const sheepCropApply = byId('sheep-crop-apply-btn', root);
  const sheepCropFit = byId('sheep-crop-fit-btn', root);
  const sheepCropReset = byId('sheep-crop-reset-btn', root);
  const advancedSections = Array.from(root.querySelectorAll?.('.advanced-only') ?? []);

  let proxyKind = 'none';
  let currentMode = 'view';
  let voxelSelectionState = { selectedCount: 0, canUndo: false };
  const initialLoadedText = String(splatLoadedName?.textContent ?? '')
    .replace(/^Loaded:\s*/i, '')
    .trim()
    .toLowerCase();
  let hasSplat = Boolean(initialLoadedText) && initialLoadedText !== 'none';
  let gameplayLevelActive = false;

  const getViewMode = () => (viewMode?.value === 'splats-only' ? 'splats-only' : 'full');
  const isSplatsOnly = () => getViewMode() === 'splats-only';
  const hasProxy = () => proxyKind === 'external' || proxyKind === 'voxel';
  const hasSplatSelection = () => Boolean(splatInput?.files?.[0]);
  const setInteractionModeLabel = (mode) => {
    currentMode = mode || 'view';
    if (!interactionMode) return;
    const label =
      mode === 'voxel-edit' ? 'voxel edit'
      : mode === 'object-edit' ? 'object edit'
      : mode === 'gameplay' ? 'third person gameplay'
      : mode === 'dialog' ? 'dialog'
      : mode === 'sheep-edit' ? 'sheep gizmo edit'
      : 'view';
    interactionMode.textContent = `Interaction mode: ${label}`;
  };
  const setMinimalUi = (minimal) => {
    panel?.classList?.toggle?.('advanced-hidden', minimal);
    for (const section of advancedSections) {
      if ('hidden' in section) section.hidden = minimal;
      if (minimal && 'open' in section) section.open = false;
    }
  };

  const readSheepAlign = () => ({
    x: asFiniteNumber(sheepAlignX?.value, 0),
    y: asFiniteNumber(sheepAlignY?.value, 0),
    z: asFiniteNumber(sheepAlignZ?.value, 0),
    pitch: asFiniteNumber(sheepAlignPitch?.value, 0),
    yaw: asFiniteNumber(sheepAlignYaw?.value, 0),
    roll: asFiniteNumber(sheepAlignRoll?.value, 0),
    scale: Math.max(asFiniteNumber(sheepAlignScale?.value, 1), 0.0001)
  });

  const applySheepAlignInputs = (state = {}) => {
    if (sheepAlignX) sheepAlignX.value = String(asFiniteNumber(state.x, 0));
    if (sheepAlignY) sheepAlignY.value = String(asFiniteNumber(state.y, 0));
    if (sheepAlignZ) sheepAlignZ.value = String(asFiniteNumber(state.z, 0));
    if (sheepAlignPitch) sheepAlignPitch.value = String(asFiniteNumber(state.pitch, 0));
    if (sheepAlignYaw) sheepAlignYaw.value = String(asFiniteNumber(state.yaw, 0));
    if (sheepAlignRoll) sheepAlignRoll.value = String(asFiniteNumber(state.roll, 0));
    if (sheepAlignScale) sheepAlignScale.value = String(Math.max(asFiniteNumber(state.scale, 1), 0.0001));
  };

  const emitSheepAlign = () => {
    eventBus.emit('environment:sheepAlign', readSheepAlign());
  };

  const readSheepCropBox = () => ({
    center: {
      x: asFiniteNumber(sheepCropCenterX?.value, 0),
      y: asFiniteNumber(sheepCropCenterY?.value, 0),
      z: asFiniteNumber(sheepCropCenterZ?.value, 0)
    },
    size: {
      x: Math.max(asFiniteNumber(sheepCropSizeX?.value, 1), 0.01),
      y: Math.max(asFiniteNumber(sheepCropSizeY?.value, 1), 0.01),
      z: Math.max(asFiniteNumber(sheepCropSizeZ?.value, 1), 0.01)
    }
  });

  const applySheepCropInputs = (state = {}) => {
    if (sheepCropEnabled && 'enabled' in state) sheepCropEnabled.checked = Boolean(state.enabled);
    if (sheepCropShowBox && 'helperVisible' in state) sheepCropShowBox.checked = Boolean(state.helperVisible);
    if (sheepCropCenterX) sheepCropCenterX.value = String(asFiniteNumber(state.center?.x, 0));
    if (sheepCropCenterY) sheepCropCenterY.value = String(asFiniteNumber(state.center?.y, 0));
    if (sheepCropCenterZ) sheepCropCenterZ.value = String(asFiniteNumber(state.center?.z, 0));
    if (sheepCropSizeX) sheepCropSizeX.value = String(Math.max(asFiniteNumber(state.size?.x, 1), 0.01));
    if (sheepCropSizeY) sheepCropSizeY.value = String(Math.max(asFiniteNumber(state.size?.y, 1), 0.01));
    if (sheepCropSizeZ) sheepCropSizeZ.value = String(Math.max(asFiniteNumber(state.size?.z, 1), 0.01));
  };

  const emitSheepCropBox = () => {
    eventBus.emit('environment:sheepCropBox', readSheepCropBox());
  };

  const emitEditorSnapSettings = () => {
    eventBus.emit('editor:snapSettingsChanged', {
      enabled: Boolean(editorSnapEnabled?.checked ?? true),
      space: editorGizmoSpace?.value === 'local' ? 'local' : 'world',
      translate: Math.max(0.01, asFiniteNumber(editorTranslateSnap?.value, 0.25)),
      rotate: Math.max(0.1, asFiniteNumber(editorRotateSnap?.value, 15)),
      scale: Math.max(0.01, asFiniteNumber(editorScaleSnap?.value, 0.1))
    });
  };

  const applyHistoryState = (state) => {
    if (editorUndoBtn) editorUndoBtn.disabled = !Boolean(state?.canUndo);
    if (editorRedoBtn) editorRedoBtn.disabled = !Boolean(state?.canRedo);
  };

  const applyGameplayLevelState = (state = {}) => {
    gameplayLevelActive = Boolean(state?.active);
    if (gameplayLevelEnabled) gameplayLevelEnabled.checked = gameplayLevelActive;
    if (gameplayLevelStatus) {
      const text = state?.text ? String(state.text) : gameplayLevelActive ? 'Level active.' : 'Level inactive.';
      gameplayLevelStatus.textContent = text;
    }
  };

  const applyVoxelSelectionState = (state = {}) => {
    voxelSelectionState = {
      selectedCount: Math.max(0, Math.floor(asFiniteNumber(state?.selectedCount, 0))),
      canUndo: Boolean(state?.canUndo)
    };
    if (voxelSelectionCount) voxelSelectionCount.textContent = `${voxelSelectionState.selectedCount} selected`;
    syncViewingInputs();
  };

  const syncWorkflowSummary = () => {
    if (!workflowSummary) return;
    if (proxyKind === 'voxel') {
      workflowSummary.textContent = 'Workflow status: complete (voxelized, rigged, procedural animation playing).';
      return;
    }
    if (proxyKind === 'external') {
      workflowSummary.textContent = 'Workflow status: external proxy loaded. Run voxel workflow to auto-rig procedural bones.';
      return;
    }
    if (hasSplat) {
      workflowSummary.textContent = 'Workflow status: Step 1 complete. Run Step 2 to voxelize, rig, and animate.';
      return;
    }
    if (hasSplatSelection()) {
      workflowSummary.textContent = 'Workflow status: file selected. Import splat (Step 1) or run full workflow.';
      return;
    }
    workflowSummary.textContent = 'Workflow status: choose a splat file to begin.';
  };

  const syncViewingInputs = () => {
    const splatsOnly = isSplatsOnly();
    const proxyAvailable = hasProxy();
    if (showProxy) showProxy.disabled = splatsOnly || !proxyAvailable;
    if (showProxyBones) showProxyBones.disabled = splatsOnly || !proxyAvailable;
    if (showLightHelpers) showLightHelpers.disabled = splatsOnly;
    if (showLightGizmos) showLightGizmos.disabled = splatsOnly;
    if (lightingProbes) lightingProbes.disabled = splatsOnly;
    if (realignProxy) realignProxy.disabled = proxyKind !== 'external';
    if (proxyAlignProfile) proxyAlignProfile.disabled = proxyKind !== 'external';
    if (proxyFlipUpDown) proxyFlipUpDown.disabled = proxyKind !== 'external';
    if (proxyMirrorX) proxyMirrorX.disabled = proxyKind !== 'external';
    if (proxyMirrorZ) proxyMirrorZ.disabled = proxyKind !== 'external';
    if (collisionEnabled) {
      collisionEnabled.disabled = !proxyAvailable;
      if (!proxyAvailable && collisionEnabled.checked) {
        collisionEnabled.checked = false;
        eventBus.emit('controls:collision', false);
      }
    }
    if (generateVoxel) generateVoxel.disabled = !hasSplat;
    if (regenerateVoxelRig) regenerateVoxelRig.disabled = proxyKind !== 'voxel';
    if (runVoxelWorkflow) runVoxelWorkflow.disabled = !(hasSplat || hasSplatSelection());
    if (exportVoxelGlb) exportVoxelGlb.disabled = proxyKind !== 'voxel';
    if (gameplayLevelEnabled) gameplayLevelEnabled.disabled = !hasSplat;
    if (gameplayStartLevel) gameplayStartLevel.disabled = !hasSplat || gameplayLevelActive;
    if (gameplayStopLevel) gameplayStopLevel.disabled = !gameplayLevelActive;
    if (gameplayResetProgress) gameplayResetProgress.disabled = !gameplayLevelActive;
    const sheepControls = [
      sheepGizmoEnabled, sheepGizmoTarget, sheepGizmoMode,
      sheepAlignX, sheepAlignY, sheepAlignZ,
      sheepAlignPitch, sheepAlignYaw, sheepAlignRoll, sheepAlignScale,
      sheepAlignApply, sheepAlignAutoCenter, sheepAlignReset,
      sheepCropEnabled, sheepCropShowBox,
      sheepCropCenterX, sheepCropCenterY, sheepCropCenterZ,
      sheepCropSizeX, sheepCropSizeY, sheepCropSizeZ,
      sheepCropApply, sheepCropFit, sheepCropReset
    ];
    for (const control of sheepControls) {
      if (control) control.disabled = !hasSplat;
    }
    if (!hasSplat && sheepCropEnabled?.checked) {
      sheepCropEnabled.checked = false;
      eventBus.emit('environment:sheepCropEnabled', false);
    }
    if (!hasSplat && sheepGizmoEnabled?.checked) {
      sheepGizmoEnabled.checked = false;
      eventBus.emit('environment:sheepGizmoEnabled', false);
    }
    if (!hasSplat && gameplayLevelEnabled?.checked) {
      gameplayLevelEnabled.checked = false;
      eventBus.emit('gameplay:enable', false);
      eventBus.emit('controls:mode', 'view');
      setInteractionModeLabel('view');
    }
    if (voxelEditMode) {
      voxelEditMode.disabled = proxyKind !== 'voxel';
      if (voxelEditMode.disabled && voxelEditMode.checked) {
        voxelEditMode.checked = false;
        eventBus.emit('environment:voxelEditMode', false);
        eventBus.emit('controls:mode', 'view');
        setInteractionModeLabel('view');
      }
    }
    const voxelEditActive = currentMode === 'voxel-edit' && proxyKind === 'voxel';
    if (voxelEditControls && voxelEditControls.style) {
      voxelEditControls.style.display = voxelEditActive ? '' : 'none';
    }
    if (voxelDeleteBtn) voxelDeleteBtn.disabled = !voxelEditActive || voxelSelectionState.selectedCount < 1;
    if (voxelUndoBtn) voxelUndoBtn.disabled = !voxelEditActive || !voxelSelectionState.canUndo;
    if (voxelSelectConnectedBtn) voxelSelectConnectedBtn.disabled = !voxelEditActive || voxelSelectionState.selectedCount !== 1;
    if (voxelInvertSelectionBtn) voxelInvertSelectionBtn.disabled = !voxelEditActive;
    if (voxelExtractActorBtn) voxelExtractActorBtn.disabled = !voxelEditActive || voxelSelectionState.selectedCount < 1;
    if (voxelActorPoseMode) voxelActorPoseMode.disabled = !voxelEditActive;
    if (voxelAutoSegmentBtn) voxelAutoSegmentBtn.disabled = !voxelEditActive;
    if (voxelSegColorThreshold) voxelSegColorThreshold.disabled = !voxelEditActive;
    if (voxelSegMinCount) voxelSegMinCount.disabled = !voxelEditActive;
    syncWorkflowSummary();
  };

  const emitViewingState = () => {
    const splatsOnly = isSplatsOnly();
    eventBus.emit('environment:viewMode', getViewMode());
    eventBus.emit('environment:showProxy', splatsOnly ? false : Boolean(showProxy?.checked));
    eventBus.emit('environment:showProxyBones', splatsOnly ? false : Boolean(showProxyBones?.checked));
    eventBus.emit('lights:showHelpers', splatsOnly ? false : (showLightHelpers ? Boolean(showLightHelpers.checked) : true));
    eventBus.emit('lights:showGizmos', splatsOnly ? false : (showLightGizmos ? Boolean(showLightGizmos.checked) : true));
    eventBus.emit('lights:showProbes', splatsOnly ? false : (lightingProbes ? Boolean(lightingProbes.checked) : true));
    syncViewingInputs();
  };

  panelToggle(disposers, root);
  bindExclusiveModes(eventBus, disposers, root, setInteractionModeLabel);
  bindProxyUi(eventBus, disposers, root);
  setMinimalUi(Boolean(minimalUiMode?.checked ?? true));
  const unsubscribeProxyKind = eventBus.on('environment:proxyKind', (kind) => {
    proxyKind = kind === 'external' || kind === 'voxel' ? kind : 'none';
    syncViewingInputs();
  });
  const unsubscribeSplatLoaded = eventBus.on('environment:splatLoaded', (mesh) => {
    hasSplat = Boolean(mesh);
    syncViewingInputs();
  });
  const unsubscribeSheepAlignState = eventBus.on('environment:sheepAlignState', (state) => {
    applySheepAlignInputs(state ?? {});
  });
  const unsubscribeSheepCropState = eventBus.on('environment:sheepCropState', (state) => {
    applySheepCropInputs(state ?? {});
    syncViewingInputs();
  });
  const unsubscribeHistoryState = eventBus.on('editor:historyState', (state) => {
    applyHistoryState(state);
  });
  const unsubscribeGameplayLevelState = eventBus.on('gameplay:levelState', (state) => {
    applyGameplayLevelState(state ?? {});
    syncViewingInputs();
  });
  const unsubscribeVoxelSelectionState = eventBus.on('voxel:selectionChanged', (state) => {
    applyVoxelSelectionState(state ?? {});
  });
  disposers.push(unsubscribeProxyKind);
  disposers.push(unsubscribeSplatLoaded);
  disposers.push(unsubscribeSheepAlignState);
  disposers.push(unsubscribeSheepCropState);
  disposers.push(unsubscribeHistoryState);
  disposers.push(unsubscribeGameplayLevelState);
  disposers.push(unsubscribeVoxelSelectionState);
  eventBus.emit('environment:requestProxyKind');
  eventBus.emit('environment:requestSheepAlignState');
  eventBus.emit('environment:requestSheepCropState');
  eventBus.emit('gameplay:requestLevelState');
  eventBus.emit('voxel:requestState');

  on(loadButton, 'click', () => {
    const file = splatInput?.files?.[0] ?? null;
    if (file) {
      eventBus.emit('asset:sessionImported', { file, kind: 'splat' });
      eventBus.emit('environment:loadFile', file);
    }
    else eventBus.emit('environment:loadDefault');
  }, disposers);
  on(splatInput, 'change', syncViewingInputs, disposers);
  on(clearButton, 'click', () => {
    hasSplat = false;
    eventBus.emit('environment:clear');
    syncViewingInputs();
  }, disposers);
  on(proxyInput, 'change', () => {
    const file = proxyInput?.files?.[0];
    if (!file) return;
    eventBus.emit('asset:sessionImported', { file, kind: 'proxy' });
    eventBus.emit('environment:proxyFile', file);
  }, disposers);
  on(runVoxelWorkflow, 'click', () => eventBus.emit('environment:runVoxelWorkflow', { file: splatInput?.files?.[0] ?? null }), disposers);
  on(gameplayStartLevel, 'click', () => {
    if (gameplayLevelEnabled) gameplayLevelEnabled.checked = true;
    eventBus.emit('gameplay:startSplatLevel');
  }, disposers);
  on(gameplayStopLevel, 'click', () => {
    if (gameplayLevelEnabled) gameplayLevelEnabled.checked = false;
    eventBus.emit('gameplay:stopSplatLevel');
  }, disposers);
  on(gameplayResetProgress, 'click', () => {
    eventBus.emit('game:resetRequested');
    eventBus.emit('gameplay:requestLevelState');
  }, disposers);
  on(minimalUiMode, 'change', () => setMinimalUi(Boolean(minimalUiMode?.checked)), disposers);
  on(realignProxy, 'click', () => eventBus.emit('environment:realignProxy'), disposers);
  on(proxyFlipUpDown, 'change', () => eventBus.emit('environment:proxyFlipUpDown', Boolean(proxyFlipUpDown?.checked)), disposers);
  on(proxyMirrorX, 'change', () => eventBus.emit('environment:proxyMirrorX', Boolean(proxyMirrorX?.checked)), disposers);
  on(proxyMirrorZ, 'change', () => eventBus.emit('environment:proxyMirrorZ', Boolean(proxyMirrorZ?.checked)), disposers);
  on(proxyAlignProfile, 'change', () => eventBus.emit('environment:proxyAlignProfile', proxyAlignProfile?.value ?? 'auto'), disposers);
  on(generateVoxel, 'click', () => eventBus.emit('environment:generateVoxel'), disposers);
  on(regenerateVoxelRig, 'click', () => eventBus.emit('environment:regenerateVoxelRig'), disposers);
  on(exportVoxelGlb, 'click', () => eventBus.emit('environment:exportVoxelGlb'), disposers);
  on(voxelDeleteBtn, 'click', () => eventBus.emit('voxel:deleteSelectedRequested'), disposers);
  on(voxelUndoBtn, 'click', () => eventBus.emit('voxel:undoRequested'), disposers);
  on(voxelAutoSegmentBtn, 'click', () => eventBus.emit('voxel:autoSegmentRequested', {
    colorThreshold: Math.max(0.01, Math.min(1, asFiniteNumber(voxelSegColorThreshold?.value, 0.15))),
    minCount: Math.max(1, Math.floor(asFiniteNumber(voxelSegMinCount?.value, 80)))
  }), disposers);
  on(voxelSelectConnectedBtn, 'click', () => eventBus.emit('voxel:selectConnectedRequested'), disposers);
  on(voxelInvertSelectionBtn, 'click', () => eventBus.emit('voxel:invertSelectionRequested'), disposers);
  on(voxelExtractActorBtn, 'click', () => eventBus.emit('voxel:extractActorRequested'), disposers);
  on(voxelActorPoseMode, 'change', () => eventBus.emit('voxel:actorPoseModeRequested', {
    mode: voxelActorPoseMode?.value === 't-pose' ? 't-pose' : 'walk'
  }), disposers);
  on(sheepGizmoTarget, 'change', () => eventBus.emit('environment:sheepGizmoTarget', sheepGizmoTarget?.value ?? 'align'), disposers);
  on(sheepGizmoMode, 'change', () => eventBus.emit('environment:sheepGizmoMode', sheepGizmoMode?.value ?? 'translate'), disposers);
  on(sheepAlignApply, 'click', emitSheepAlign, disposers);
  on(sheepAlignAutoCenter, 'click', () => eventBus.emit('environment:sheepAlignAutoCenter'), disposers);
  on(sheepAlignReset, 'click', () => eventBus.emit('environment:sheepAlignReset'), disposers);
  on(sheepCropEnabled, 'change', () => eventBus.emit('environment:sheepCropEnabled', Boolean(sheepCropEnabled?.checked)), disposers);
  on(sheepCropShowBox, 'change', () => eventBus.emit('environment:sheepCropShowBox', Boolean(sheepCropShowBox?.checked)), disposers);
  on(sheepCropApply, 'click', emitSheepCropBox, disposers);
  on(sheepCropFit, 'click', () => eventBus.emit('environment:sheepCropAutoFit'), disposers);
  on(sheepCropReset, 'click', () => eventBus.emit('environment:sheepCropReset'), disposers);
  on(editorSnapEnabled, 'change', emitEditorSnapSettings, disposers);
  on(editorGizmoSpace, 'change', emitEditorSnapSettings, disposers);
  on(editorTranslateSnap, 'change', emitEditorSnapSettings, disposers);
  on(editorRotateSnap, 'change', emitEditorSnapSettings, disposers);
  on(editorScaleSnap, 'change', emitEditorSnapSettings, disposers);
  on(editorUndoBtn, 'click', () => eventBus.emit('editor:undoRequested'), disposers);
  on(editorRedoBtn, 'click', () => eventBus.emit('editor:redoRequested'), disposers);
  on(viewMode, 'change', emitViewingState, disposers);
  on(showProxy, 'change', emitViewingState, disposers);
  on(showProxyBones, 'change', emitViewingState, disposers);
  on(collisionEnabled, 'change', () => eventBus.emit('controls:collision', Boolean(collisionEnabled?.checked)), disposers);
  on(flipUpDown, 'change', () => eventBus.emit('environment:flipUpDown', Boolean(flipUpDown?.checked)), disposers);
  on(flipLeftRight, 'change', () => eventBus.emit('environment:flipLeftRight', Boolean(flipLeftRight?.checked)), disposers);
  on(qualityImproved, 'change', () => eventBus.emit('quality:improved', Boolean(qualityImproved?.checked)), disposers);
  on(qualityMaxDetail, 'change', () => eventBus.emit('quality:maxDetail', Boolean(qualityMaxDetail?.checked)), disposers);
  on(showLightHelpers, 'change', emitViewingState, disposers);
  on(showLightGizmos, 'change', emitViewingState, disposers);
  on(showMovementControls, 'change', () => {
    const enabled = Boolean(showMovementControls?.checked);
    setMovementControlsVisible(enabled, root);
    eventBus.emit('lights:showMovementControls', enabled);
  }, disposers);
  on(lightingProbes, 'change', emitViewingState, disposers);
  on(outlinerFocus, 'click', () => eventBus.emit('selection:focusRequested'), disposers);
  on(saveSceneFileBtn, 'click', () => {
    eventBus.emit('scene:saveFileRequested', {
      sceneName: sceneNameInput?.value?.trim() || 'Untitled Scene'
    });
  }, disposers);
  on(openSceneFileBtn, 'click', () => {
    eventBus.emit('scene:openFileRequested', { root });
  }, disposers);
  on(loadSceneFileInput, 'change', () => {
    const file = loadSceneFileInput?.files?.[0] ?? null;
    if (!file) return;
    eventBus.emit('scene:openFileRequested', { file, root });
    loadSceneFileInput.value = '';
  }, disposers);
  on(saveSceneSlotBtn, 'click', () => {
    eventBus.emit('scene:saveSlotRequested', {
      slotName: sceneSlotNameInput?.value?.trim() || '',
      sceneName: sceneNameInput?.value?.trim() || 'Untitled Scene',
      root
    });
  }, disposers);
  on(loadSceneSlotBtn, 'click', () => {
    eventBus.emit('scene:loadSlotRequested', {
      slotName: sceneSlotSelect?.value?.trim() || sceneSlotNameInput?.value?.trim() || '',
      root
    });
  }, disposers);
  on(deleteSceneSlotBtn, 'click', () => {
    eventBus.emit('scene:deleteSlotRequested', {
      slotName: sceneSlotSelect?.value?.trim() || sceneSlotNameInput?.value?.trim() || '',
      root
    });
  }, disposers);

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
  eventBus.emit('environment:proxyAlignProfile', proxyAlignProfile?.value ?? 'auto');
  eventBus.emit('environment:sheepGizmoTarget', sheepGizmoTarget?.value ?? 'align');
  eventBus.emit('environment:sheepGizmoMode', sheepGizmoMode?.value ?? 'translate');
  emitSheepAlign();
  eventBus.emit('environment:sheepCropShowBox', Boolean(sheepCropShowBox?.checked));
  eventBus.emit('environment:sheepCropEnabled', Boolean(sheepCropEnabled?.checked));
  emitSheepCropBox();
  emitEditorSnapSettings();
  if (objectEditMode?.checked) {
    eventBus.emit('editor:objectEditMode', true);
  }
  applyVoxelSelectionState({ selectedCount: 0, canUndo: false });
  applyHistoryState({ canUndo: false, canRedo: false });
  emitViewingState();
  eventBus.emit('controls:collision', collisionEnabled ? Boolean(collisionEnabled.checked) : false);
  eventBus.emit('quality:improved', Boolean(qualityImproved?.checked));
  eventBus.emit('quality:maxDetail', Boolean(qualityMaxDetail?.checked));
  setMovementControlsVisible(showMovementControls ? Boolean(showMovementControls.checked) : true, root);
  eventBus.emit('lights:showMovementControls', showMovementControls ? Boolean(showMovementControls.checked) : true);
  emitLighting();
  eventBus.emit('scene:slotsRefreshRequested', { root });

  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}
