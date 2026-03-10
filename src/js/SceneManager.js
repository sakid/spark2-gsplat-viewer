import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { loadSparkModule } from '../spark/previewAdapter';
import { resolveCameraMovement as resolveMovement } from './internal/collisionResolver';
import { selectLodSplatCount } from './internal/lodPolicy';
import { bindUi } from './internal/uiBindings';
import { EditorCommandHistory } from './internal/editorCommandHistory';
import { applySparkCovOnlyPatch } from './internal/patchSparkCovOnly';
import { applySelectionClick, pickSelectionObject } from './internal/selectionPicking';
import { loadSplatFromFile, loadSplatFromUrl } from './internal/splatLoaders';
import { buildSplatSubsetMeshFromVoxelKeys } from './internal/splatSubset';
import { normalizeSplatMeshCounts } from './internal/splatMeshCounts';
import { DEFAULT_BOOT_SPLAT_URL, FALLBACK_SPLAT_URL } from './internal/startupAssets';
import { createActorCacheClient } from './internal/actorCacheClient';
import { DEFAULT_ACTOR_CACHE_REQUEST } from './internal/actorCacheShared';
import { GeneralLights } from './sceneSubjects/GeneralLights';
import { CameraControls } from './sceneSubjects/CameraControls';
import { RenderQuality } from './sceneSubjects/RenderQuality';
import { EnvironmentSplat } from './sceneSubjects/EnvironmentSplat';
import { ButterflySplat } from './sceneSubjects/ButterflySplat';
import { DynoEffectSplat } from './sceneSubjects/DynoEffectSplat';
import { Gameplay } from './sceneSubjects/Gameplay';
import { VoxelSplatActor } from './sceneSubjects/VoxelSplatActor';
import { stampPrim } from '../ui/prim-utils.js';
import { createSceneFile, listSceneSlotNames } from './internal/sceneStateBridge.js';
import { VoxelEditState } from '../viewer/voxelEditState';
import { mergeVoxelKeysToBoxes } from '../viewer/voxelMaskMerge';
import {
  autoSelectPrimaryActorVoxelIndices,
  expandSelectedVoxelKeysForExtraction,
  findLargestConnectedVoxelSeedIndex as findLargestConnectedSeedIndex
} from './internal/voxelSegmentation';

function flattenMapValues(map, target) {
  target.length = 0;
  for (const list of map.values()) target.push(...list);
}

function toTuple3(vector) {
  return [vector.x, vector.y, vector.z];
}

function toTuple4(quaternion) {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function parseLoadedName(raw) {
  if (!raw) return null;
  const normalized = String(raw).replace(/^Loaded:\s*/i, '').trim();
  if (!normalized || normalized.toLowerCase() === 'none') return null;
  const ext = normalized.split('.').pop()?.toLowerCase() ?? '';
  return {
    name: normalized,
    ext,
    loadMode: 'spz'
  };
}

function readSceneBootstrapFlags() {
  if (typeof window === 'undefined') {
    return {
      autoDefaultScene: true
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    autoDefaultScene: params.get('autoDefaultScene') !== '0'
  };
}

function isEditableSelectionObject(object, scene, camera, sparkRenderer) {
  if (!object || object === scene || object === camera || object === sparkRenderer) return false;
  if (!object.parent) return false;
  if (object.isCamera) return false;
  if (object.userData?.editorLocked) return false;
  return true;
}

function toTransformSnapshot(object) {
  return {
    position: toTuple3(object.position),
    quaternion: toTuple4(object.quaternion),
    scale: toTuple3(object.scale)
  };
}

function applyTransformSnapshot(object, snapshot) {
  if (!object || !snapshot) return;
  object.position.set(snapshot.position[0], snapshot.position[1], snapshot.position[2]);
  object.quaternion.set(snapshot.quaternion[0], snapshot.quaternion[1], snapshot.quaternion[2], snapshot.quaternion[3]);
  object.scale.set(snapshot.scale[0], snapshot.scale[1], snapshot.scale[2]);
  object.updateMatrixWorld(true);
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  const eps = 1e-6;
  const valuesA = [...a.position, ...a.quaternion, ...a.scale];
  const valuesB = [...b.position, ...b.quaternion, ...b.scale];
  if (valuesA.length !== valuesB.length) return false;
  for (let i = 0; i < valuesA.length; i += 1) {
    if (Math.abs(valuesA[i] - valuesB[i]) > eps) return false;
  }
  return true;
}

function isTextEntryTarget(target) {
  const hasDomTypes =
    typeof HTMLInputElement !== 'undefined'
    && typeof HTMLTextAreaElement !== 'undefined'
    && typeof HTMLSelectElement !== 'undefined';
  if (!hasDomTypes) return false;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return Boolean(target?.isContentEditable);
}

// NEW PROXY ANIMATION
export class SceneManager {
  constructor({ container, eventBus, statusReporter }) {
    this.container = container;
    this.eventBus = eventBus;
    this.setStatus = statusReporter.setStatus;
    this.colliderMap = new Map();
    this.colliders = [];
    this.dynamicColliderMap = new Map();
    this.dynamicColliders = [];
    this.entities = [];
    this.voxelCollisionData = null;
    this.uiDispose = () => {};
    this.uiReadyDispose = () => {};
    this.tempResolved = new THREE.Vector3();
    this.uiBound = false;
    this.sceneEventsPatched = false;
    this.uiRoot = null;
    this.selectedObjectUuid = null;
    this.selectedObjectUuids = [];
    this.interactionMode = 'view';
    this.selectionDispose = () => {};
    this.editorDisposers = [];
    this.transformDragStart = null;
    this.transformDragging = false;
    this.editorTransformMode = 'translate';
    this.viewMode = 'full';
    this.showProxyRequested = true;
    this.actorPoseModeRequested = 'walk';
    this.selectionRaycaster = new THREE.Raycaster();
    this.selectionPointer = new THREE.Vector2();
    this.pointerDownSelection = null;
    this.selectionOutline = null;
    this.context = null;
    this.lastImportedSplatFile = null;
    this.worldMaskByMesh = new Map();
    this.voxelEditState = new VoxelEditState();
    this.voxelEditStateDispose = this.voxelEditState.onChange(() => this.handleVoxelEditStateChanged());
    this.sceneBootstrapFlags = readSceneBootstrapFlags();
    this.defaultSceneBootstrapPromise = null;
    this.snapSettings = {
      enabled: true,
      space: 'world',
      translate: 0.25,
      rotate: 15,
      scale: 0.1
    };
    this.commandHistory = new EditorCommandHistory({
      onChange: (state) => {
        this.eventBus.emit('editor:historyState', state);
      }
    });
    this.actorCacheClient = createActorCacheClient();
    this.actorCacheState = {
      jobId: null,
      status: 'idle',
      stage: 'idle',
      progress: 0,
      error: null,
      manifestUrl: null
    };
  }

  async init() {
    this.sparkModule = await loadSparkModule();
    const covPatch = applySparkCovOnlyPatch(this.sparkModule);
    if (!covPatch.applied) {
      this.setStatus(`Spark cov-only patch not applied: ${covPatch.reason || 'unknown reason'}`, 'warning');
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#030712');
    this.installSceneEventHooks();

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(2, 1.5, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;

    this.onContextLost = (event) => {
      event.preventDefault();
      this.setStatus('WebGL context was lost. Reload the page to recover rendering.', 'error');
    };

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false);
    this.container.appendChild(this.renderer.domElement);

    this.sparkRenderer = new this.sparkModule.NewSparkRenderer({
      renderer: this.renderer,
      enableLod: true,
      lodSplatCount: selectLodSplatCount(navigator.userAgent),
      maxStdDev: Math.sqrt(8),
      autoUpdate: true,
      covSplats: true
    });

    this.scene.add(this.sparkRenderer);

    this.editorTransformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.editorTransformControls.name = 'EditorTransformControls';
    this.editorTransformControls.enabled = false;
    this.editorTransformControls.visible = false;
    this.editorTransformControls.setMode('translate');
    this.editorTransformControls.setSpace('world');
    this.editorTransformControls.userData = {
      ...(this.editorTransformControls.userData ?? {}),
      editorIgnorePicking: true
    };
    this.scene.add(this.editorTransformControls);

    this.selectionOutline = new THREE.BoxHelper(undefined, 0x6ec1ff);
    this.selectionOutline.name = 'EditorSelectionOutline';
    this.selectionOutline.visible = false;
    this.selectionOutline.userData = {
      ...(this.selectionOutline.userData ?? {}),
      editorIgnorePicking: true
    };
    this.scene.add(this.selectionOutline);

    this.entities = [
      new GeneralLights(),
      new CameraControls(),
      new RenderQuality(),
      new EnvironmentSplat(),
      new ButterflySplat(),
      new DynoEffectSplat(),
      new Gameplay()
    ];

    const context = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      sparkRenderer: this.sparkRenderer,
      sparkModule: this.sparkModule,
      eventBus: this.eventBus,
      setStatus: this.setStatus,
      commandHistory: this.commandHistory,
      replaceColliders: (owner, colliders) => this.replaceColliders(owner, colliders),
      setDynamicColliders: (owner, colliders) => this.setDynamicColliders(owner, colliders),
      clearDynamicColliders: (owner) => this.clearDynamicColliders(owner),
      setVoxelCollisionData: (data) => {
        this.voxelCollisionData = data;
      },
      resolveCameraMovement: (from, to, options) => this.resolveCameraMovement(from, to, options)
    };
    this.context = context;

    for (const entity of this.entities) {
      await entity.init(context);
    }

    const onSelectionChanged = (payload) => {
      const uuids = Array.isArray(payload?.uuids)
        ? payload.uuids.filter((value) => typeof value === 'string')
        : [];
      const objectUuid = payload?.object?.uuid;
      if (typeof objectUuid === 'string' && !uuids.includes(objectUuid)) {
        uuids.unshift(objectUuid);
      }
      this.selectedObjectUuids = uuids;
      this.selectedObjectUuid = uuids[0] ?? null;
      this.updateEditorTransformBinding();
      this.updateSelectionOutline();
    };
    this.selectionDispose = this.eventBus.on?.('selectionChanged', onSelectionChanged)
      ?? (() => this.eventBus.off?.('selectionChanged', onSelectionChanged));

    this.bindEditorControls();
    this.syncVoxelEditData();
    void this.bootstrapDefaultWalkingSceneIfNeeded();
    this.applySnapSettings(this.snapSettings);
    this.commandHistory.emitChange?.();

    this.bindUiWhenReady();
    this.resize();

    this.eventBus.emit('sceneLoaded', {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer
    });

    this.setStatus('SPARK 2.0 proxy-driven engine initialized.', 'success');
  }

  bindUiWhenReady() {
    const bind = (root = document) => {
      this.uiDispose();
      this.uiDispose = bindUi(this.eventBus, root);
      this.uiRoot = root;
      this.uiBound = true;
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
      this.uiDispose();
      this.uiDispose = () => {};
      this.uiRoot = null;
      this.uiBound = false;
    };

    this.uiReadyDispose();
    const disposers = [
      this.eventBus.on?.('ui:controlsReady', onControlsReady) ?? (() => this.eventBus.off?.('ui:controlsReady', onControlsReady)),
      this.eventBus.on?.('ui:controlsDisposed', onControlsDisposed) ?? (() => this.eventBus.off?.('ui:controlsDisposed', onControlsDisposed))
    ];
    this.uiReadyDispose = () => {
      for (const dispose of disposers.splice(0)) dispose();
    };

    if (document.getElementById('panel')) {
      bind();
    }
  }

  bindEditorControls() {
    const controls = this.editorTransformControls;
    if (!controls) return;

    const onDragStateChanged = (event) => {
      const dragging = Boolean(event?.value);
      this.transformDragging = dragging;
      this.eventBus.emit('controls:orbitSuppress', dragging);
      if (dragging) {
        this.transformDragStart = controls.object ? toTransformSnapshot(controls.object) : null;
        return;
      }
      const object = controls.object;
      const before = this.transformDragStart;
      const after = object ? toTransformSnapshot(object) : null;
      this.transformDragStart = null;
      if (!object || !before || !after || snapshotsEqual(before, after)) {
        return;
      }
      this.commandHistory.execute({
        label: `Transform ${object.name || object.type || object.uuid}`,
        do: () => {
          applyTransformSnapshot(object, after);
          this.eventBus.emit('hierarchyChanged');
        },
        undo: () => {
          applyTransformSnapshot(object, before);
          this.eventBus.emit('hierarchyChanged');
        }
      });
    };

    const onObjectChange = () => {
      this.eventBus.emit('hierarchyChanged');
      this.updateSelectionOutline();
    };

    controls.addEventListener('dragging-changed', onDragStateChanged);
    controls.addEventListener('objectChange', onObjectChange);
    this.editorDisposers.push(() => controls.removeEventListener('dragging-changed', onDragStateChanged));
    this.editorDisposers.push(() => controls.removeEventListener('objectChange', onObjectChange));

    const busOn = (event, handler) => {
      const dispose = this.eventBus.on?.(event, handler) ?? (() => this.eventBus.off?.(event, handler));
      this.editorDisposers.push(dispose);
    };

    busOn('controls:mode', (mode) => {
      this.interactionMode = mode || 'view';
      this.updateEditorTransformBinding();
      this.updateSelectionOutline();
      this.emitVoxelSelectionState();
    });
    busOn('asset:sessionImported', (payload) => {
      if (payload?.kind === 'splat' && payload?.file) {
        this.lastImportedSplatFile = payload.file;
      }
    });
    busOn('environment:proxyKind', () => this.syncVoxelEditData());
    busOn('environment:splatLoaded', () => this.syncVoxelEditData());
    busOn('voxel:deleteSelectedRequested', () => this.deleteSelectedVoxels());
    busOn('voxel:undoRequested', () => this.undoVoxelEdit());
    busOn('voxel:invertSelectionRequested', () => this.invertVoxelSelection());
    busOn('voxel:selectConnectedRequested', () => this.selectConnectedVoxels());
    busOn('voxel:autoSegmentRequested', (payload) => this.autoSelectActorVoxels(payload));
    busOn('voxel:preprocessActorRequested', () => {
      void this.preprocessSelectedVoxelActor();
    });
    busOn('voxel:extractActorRequested', () => {
      void this.extractSelectedVoxelActor();
    });
    busOn('voxel:actorPoseModeRequested', (payload) => {
      const requested = typeof payload === 'string' ? payload : payload?.mode;
      this.applyActorPoseMode(requested, { silent: true });
    });
    busOn('environment:viewMode', (mode) => {
      this.viewMode = mode === 'splats-only' ? 'splats-only' : 'full';
      this.applySceneViewMode();
    });
    busOn('environment:showProxy', (enabled) => {
      this.showProxyRequested = Boolean(enabled);
      this.applySceneViewMode();
    });
    busOn('voxel:requestState', () => this.emitVoxelSelectionState());
    busOn('voxel:requestActorCacheState', () => this.emitActorCacheState());
    busOn('editor:transformModeRequested', (payload) => this.handleTransformModeRequested(payload));
    busOn('editor:snapSettingsChanged', (settings) => this.applySnapSettings(settings));
    busOn('editor:undoRequested', () => this.undoEditorCommand());
    busOn('editor:redoRequested', () => this.redoEditorCommand());
    busOn('dom:keydown', (event) => this.handleEditorShortcuts(event));
    busOn('dom:mousedown', (event) => this.handleViewportPointerDown(event));
    busOn('dom:mouseup', (event) => this.handleViewportPointerUp(event));
    busOn('hierarchy:visibilityRequested', (payload) => this.handleVisibilityToggle(payload));
    busOn('hierarchy:lockRequested', (payload) => this.handleLockToggle(payload));
    busOn('hierarchy:reparentRequested', (payload) => this.handleReparentRequest(payload));
    busOn('hierarchy:createFolderRequested', (payload) => this.handleCreateFolder(payload));
    busOn('hierarchy:focusRequested', () => {
      this.eventBus.emit('selection:focusRequested');
    });
    busOn('hierarchyChanged', () => this.updateSelectionOutline());

    this.eventBus.emit('editor:transformModeChanged', { mode: this.editorTransformMode });
  }

  handleVoxelEditStateChanged() {
    this.applyEnvironmentVoxelMaskFromEdits();
    this.emitVoxelSelectionState();
  }

  emitActorCacheState() {
    this.eventBus.emit('voxel:actorCacheStateChanged', { ...this.actorCacheState });
  }

  updateActorCacheState(patch = {}) {
    this.actorCacheState = {
      ...this.actorCacheState,
      ...patch
    };
    this.emitActorCacheState();
  }

  emitVoxelSelectionState() {
    const hasData = Boolean(this.voxelEditState.getVoxelData());
    this.eventBus.emit('voxel:selectionChanged', {
      selectedCount: hasData ? this.voxelEditState.getSelectedCount() : 0,
      canUndo: hasData ? this.voxelEditState.canUndo() : false
    });
  }

  syncVoxelEditData() {
    const environment = this.findEnvironmentEntity();
    const voxelData = environment?.proxyKind === 'voxel' ? (environment?.voxelData ?? null) : null;
    if (this.voxelEditState.getVoxelData() !== voxelData) {
      this.voxelEditState.setVoxelData(voxelData);
    }
    this.emitVoxelSelectionState();
  }

  async bootstrapDefaultWalkingSceneIfNeeded() {
    if (!this.sceneBootstrapFlags.autoDefaultScene) return;
    if (this.defaultSceneBootstrapPromise) return;

    this.defaultSceneBootstrapPromise = (async () => {
      const environment = this.findEnvironmentEntity();
      if (!environment?.splatMesh) return;

      this.setStatus('Default scene: generating voxel proxy for primary actor...', 'info');
      await environment.generateVoxel({ workflow: true });

      this.syncVoxelEditData();
      const voxelData = this.voxelEditState.getVoxelData();
      if (!voxelData?.occupiedKeys?.size) {
        this.setStatus('Default scene setup skipped: voxel data unavailable.', 'warning');
        return;
      }

      this.setStatus('Default scene: auto-segmenting primary actor voxels...', 'info');
      const selection = this.autoSelectActorVoxels(undefined, { silent: true });
      if (!selection?.selectedCount) {
        this.setStatus('Default scene setup skipped: unable to select actor voxels.', 'warning');
        return;
      }
      this.setStatus(
        `Default scene: selected ${selection.selectedCount.toLocaleString()} voxels via ${selection.strategy} segmentation.`,
        'info'
      );

      await this.extractSelectedVoxelActor();

      const refreshedEnvironment = this.findEnvironmentEntity();
      if (refreshedEnvironment?.splatMesh) {
        refreshedEnvironment.splatMesh.visible = false;
      }
      this.eventBus.emit('hierarchyChanged');
      this.setStatus('Default scene ready: isolated actor extracted and walk cycle is playing.', 'success');
    })().catch((error) => {
      this.setStatus(
        `Default scene setup failed: ${error instanceof Error ? error.message : String(error)}`,
        'warning'
      );
    });
  }

  findLargestConnectedVoxelSeedIndex(voxelData) {
    return findLargestConnectedSeedIndex(voxelData);
  }

  normalizeActorPoseMode(mode) {
    return mode === 't-pose' ? 't-pose' : 'walk';
  }

  findSelectedVoxelActor() {
    const selected = this.getPrimarySelectedObject();
    if (!selected) return null;
    let cursor = selected;
    while (cursor) {
      for (const entity of this.entities) {
        if (!(entity instanceof VoxelSplatActor)) continue;
        if (entity.root === cursor || entity.splatMesh === cursor) {
          return entity;
        }
      }
      cursor = cursor.parent ?? null;
    }
    return null;
  }

  applyActorPoseMode(mode, options = {}) {
    const normalized = this.normalizeActorPoseMode(mode);
    this.actorPoseModeRequested = normalized;
    const actors = this.entities.filter((entity) => entity instanceof VoxelSplatActor);
    if (actors.length < 1) return 0;
    const selectedActor = this.findSelectedVoxelActor();
    const target = selectedActor ?? actors[actors.length - 1];
    target.setPoseMode(normalized);
    if (!options?.silent) {
      this.setStatus(
        normalized === 't-pose'
          ? 'Extracted actor switched to T-pose.'
          : 'Extracted actor walk cycle resumed.',
        'success'
      );
    }
    return 1;
  }

  applySceneViewMode() {
    const showVoxelProxies = this.viewMode !== 'splats-only' && this.showProxyRequested;
    for (const entity of this.entities) {
      if (!(entity instanceof VoxelSplatActor)) continue;
      entity.setProxyVisible(showVoxelProxies);
    }
  }

  clearManagedWorldMask(mesh) {
    if (!mesh) return;
    const active = this.worldMaskByMesh.get(mesh);
    if (active && mesh.worldModifier === active.modifier) {
      mesh.worldModifier = undefined;
    }
    this.worldMaskByMesh.delete(mesh);
  }

  applyManagedWorldMask(mesh, boxes) {
    if (!mesh) return;
    this.clearManagedWorldMask(mesh);
    if (!Array.isArray(boxes) || boxes.length < 1) return;

    const edit = new this.sparkModule.SplatEdit();
    for (const box of boxes) {
      if (!box || box.isEmpty?.()) continue;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const sdf = new this.sparkModule.SplatEditSdf({
        type: 'box',
        opacity: 0,
        radius: Math.max(size.x, size.y, size.z) * 0.05
      });
      sdf.position.copy(center);
      sdf.scale.copy(size);
      sdf.updateMatrixWorld(true);
      edit.addSdf(sdf);
    }
    const modifier = new this.sparkModule.SplatModifier(edit);
    mesh.worldModifier = modifier;
    this.worldMaskByMesh.set(mesh, { edit, modifier });
  }

  refreshManagedWorldMasks() {
    for (const [mesh, active] of this.worldMaskByMesh.entries()) {
      if (!mesh || !active?.modifier) {
        this.worldMaskByMesh.delete(mesh);
        continue;
      }
      if (mesh.worldModifier !== active.modifier) {
        mesh.worldModifier = active.modifier;
      }
    }
  }

  applyEnvironmentVoxelMaskFromEdits() {
    const environment = this.findEnvironmentEntity();
    const voxelData = this.voxelEditState.getVoxelData();
    if (!environment?.splatMesh || !voxelData) return;

    const deletedKeys = Array.from(this.voxelEditState.getDeletedKeys());
    const boxes = mergeVoxelKeysToBoxes(deletedKeys, voxelData.resolution, voxelData.origin);
    this.applyManagedWorldMask(environment.splatMesh, boxes);
  }

  deleteSelectedVoxels() {
    this.syncVoxelEditData();
    if (!this.voxelEditState.getVoxelData()) {
      this.setStatus('Generate a voxel proxy before deleting voxels.', 'warning');
      return;
    }
    const deleted = this.voxelEditState.deleteSelected();
    if (deleted.length < 1) {
      this.setStatus('No voxels selected.', 'warning');
      return;
    }
    this.setStatus(`Deleted ${deleted.length.toLocaleString()} voxels.`, 'info');
  }

  undoVoxelEdit() {
    this.syncVoxelEditData();
    if (!this.voxelEditState.getVoxelData()) {
      this.setStatus('Generate a voxel proxy before undoing voxel edits.', 'warning');
      return;
    }
    if (!this.voxelEditState.undo()) {
      this.setStatus('No voxel edits to undo.', 'warning');
      return;
    }
    this.setStatus('Voxel edit undo applied.', 'info');
  }

  invertVoxelSelection() {
    this.syncVoxelEditData();
    if (!this.voxelEditState.getVoxelData()) {
      this.setStatus('Generate a voxel proxy before inverting selection.', 'warning');
      return;
    }
    this.voxelEditState.invertSelection();
  }

  selectConnectedVoxels() {
    this.syncVoxelEditData();
    const voxelData = this.voxelEditState.getVoxelData();
    if (!voxelData) {
      this.setStatus('Generate a voxel proxy before selecting connected voxels.', 'warning');
      return;
    }
    const selected = Array.from(this.voxelEditState.getSelected());
    if (selected.length !== 1) {
      this.setStatus('Select exactly one seed voxel to select connected voxels.', 'warning');
      return;
    }
    this.voxelEditState.selectConnectedFrom(selected[0]);
  }

  autoSelectActorVoxels(options = {}, { silent = false } = {}) {
    this.syncVoxelEditData();
    const voxelData = this.voxelEditState.getVoxelData();
    if (!voxelData) {
      if (!silent) {
        this.setStatus('Generate a voxel proxy before auto-segmenting an actor.', 'warning');
      }
      return null;
    }

    const selection = autoSelectPrimaryActorVoxelIndices(voxelData, {
      colorThreshold: options?.colorThreshold,
      minCount: options?.minCount,
      mergeMinSlenderness: options?.mergeMinSlenderness,
      mergeScoreFraction: options?.mergeScoreFraction,
      mergeMaxGapScale: options?.mergeMaxGapScale,
      maxMergedComponents: options?.maxMergedComponents
    });
    if (!selection.selectedIndices.length) {
      if (!silent) {
        this.setStatus('Actor auto-segmentation found no selectable voxels.', 'warning');
      }
      return null;
    }

    this.voxelEditState.setSelection(selection.selectedIndices);
    if (!silent) {
      const mergedText = selection.strategy === 'color-aware'
        ? ` across ${selection.mergedComponents ?? 1} merged component${(selection.mergedComponents ?? 1) === 1 ? '' : 's'}`
        : '';
      this.setStatus(
        `Actor auto-segment selected ${selection.selectedCount.toLocaleString()} voxels via ${selection.strategy}${mergedText}.`,
        'info'
      );
    }
    return selection;
  }

  getSelectedVoxelKeys(voxelData) {
    const selected = this.voxelEditState.getSelected();
    const keys = new Set();
    for (const index of selected) {
      const key = voxelData.indexToKey[index];
      if (!key) continue;
      if (!voxelData.occupiedKeys.has(key)) continue;
      keys.add(key);
    }
    return keys;
  }

  expandSelectedVoxelKeys(voxelData, selectedKeys, { radius = 1, maxScale = 2.5 } = {}) {
    return expandSelectedVoxelKeysForExtraction(voxelData, selectedKeys, {
      radius,
      maxScale
    });
  }

  buildVoxelSubsetData(voxelData, selectedKeys) {
    const keys = Array.from(selectedKeys).filter((key) => voxelData.keyToIndex.has(key));
    if (keys.length < 1) return null;

    const sourceMesh = voxelData.mesh;
    const sourceGeometry = sourceMesh.geometry?.clone?.() ?? sourceMesh.geometry;
    const sourceMaterial = Array.isArray(sourceMesh.material)
      ? sourceMesh.material.map((material) => material?.clone?.() ?? material)
      : (sourceMesh.material?.clone?.() ?? sourceMesh.material);
    const subsetMesh = new THREE.InstancedMesh(sourceGeometry, sourceMaterial, keys.length);
    subsetMesh.name = 'ExtractedVoxelSubset';
    subsetMesh.frustumCulled = false;
    subsetMesh.renderOrder = sourceMesh.renderOrder;
    subsetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const keyToIndex = new Map();
    const baseIndexToKey = [];
    const baseIndexToColor = [];
    const indexToKey = [];
    const occupiedKeys = new Set();
    const occupiedCounts = new Map();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    let cursor = 0;
    for (const key of keys) {
      const sourceIndex = voxelData.keyToIndex.get(key);
      if (!Number.isInteger(sourceIndex)) continue;

      sourceMesh.getMatrixAt(sourceIndex, matrix);
      subsetMesh.setMatrixAt(cursor, matrix);

      const sourceColor = voxelData.baseIndexToColor[sourceIndex] ?? color.setHex(0x00ff00);
      subsetMesh.setColorAt(cursor, sourceColor);

      keyToIndex.set(key, cursor);
      baseIndexToKey.push(key);
      baseIndexToColor.push(sourceColor.clone());
      indexToKey.push(key);
      occupiedKeys.add(key);
      occupiedCounts.set(key, 1);
      cursor += 1;
    }

    subsetMesh.count = cursor;
    subsetMesh.instanceMatrix.needsUpdate = true;
    if (subsetMesh.instanceColor) {
      subsetMesh.instanceColor.needsUpdate = true;
    }

    return {
      mesh: subsetMesh,
      keyToIndex,
      baseIndexToKey,
      baseIndexToColor,
      indexToKey,
      origin: voxelData.origin.clone(),
      resolution: voxelData.resolution,
      occupiedKeys,
      occupiedCounts,
      activeCount: occupiedKeys.size
    };
  }

  isRenderableSplatMesh(mesh) {
    if (!mesh) return false;
    const packedCount = Number(mesh.packedSplats?.numSplats ?? 0);
    if (Number.isFinite(packedCount) && packedCount > 0) return true;

    const extCount = Number(mesh.extSplats?.numSplats ?? 0);
    if (Number.isFinite(extCount) && extCount > 0) return true;

    if (typeof mesh.forEachSplat === 'function') {
      const stop = { stop: true };
      let seen = 0;
      try {
        mesh.forEachSplat(() => {
          seen += 1;
          if (seen >= 1) throw stop;
        });
      } catch (error) {
        if (error === stop) return true;
      }
      if (seen > 0) return true;
    }

    if (typeof mesh.getBoundingBox !== 'function') return false;
    try {
      const bounds = mesh.getBoundingBox(false);
      return Boolean(bounds && !bounds.isEmpty?.());
    } catch {
      return false;
    }
  }

  configureExtractedSplatMesh(mesh, sourceMesh, sourceTransform = null) {
    mesh.name = `${sourceMesh.name || 'Splat'}::Extracted`;
    if (sourceTransform && Array.isArray(sourceTransform.position) && Array.isArray(sourceTransform.quaternion) && Array.isArray(sourceTransform.scale)) {
      mesh.position.set(sourceTransform.position[0], sourceTransform.position[1], sourceTransform.position[2]);
      mesh.quaternion.set(
        sourceTransform.quaternion[0],
        sourceTransform.quaternion[1],
        sourceTransform.quaternion[2],
        sourceTransform.quaternion[3]
      );
      mesh.scale.set(sourceTransform.scale[0], sourceTransform.scale[1], sourceTransform.scale[2]);
    } else {
      mesh.position.copy(sourceMesh.position);
      mesh.quaternion.copy(sourceMesh.quaternion);
      mesh.scale.copy(sourceMesh.scale);
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = sourceMesh.renderOrder;
    if ('enableLod' in mesh) mesh.enableLod = false;
    if ('enableLoD' in mesh) mesh.enableLoD = false;
    if (typeof sourceMesh.opacity === 'number') {
      mesh.opacity = sourceMesh.opacity;
    }
    if (sourceMesh.recolor?.isColor && mesh.recolor?.isColor) {
      mesh.recolor.copy(sourceMesh.recolor);
    }
    normalizeSplatMeshCounts(
      mesh,
      sourceMesh?.numSplats
        ?? sourceMesh?.packedSplats?.numSplats
        ?? sourceMesh?.extSplats?.numSplats
        ?? 0
    );
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  buildExtractionSourceQueue(source) {
    const queue = [];
    const pushUrl = (url) => {
      if (typeof url !== 'string' || !url) return;
      if (queue.some((item) => item.type === 'url' && item.url === url)) return;
      queue.push({ type: 'url', url });
    };
    const pushFile = (file) => {
      if (!file || typeof file.name !== 'string') return;
      if (queue.some((item) => item.type === 'file' && item.file === file)) return;
      queue.push({ type: 'file', file });
    };

    if (source?.kind === 'file') pushFile(source.file);
    if (source?.kind === 'url') pushUrl(source.url);
    if (source?.file) pushFile(source.file);
    if (source?.url) pushUrl(source.url);
    pushFile(this.lastImportedSplatFile);
    pushUrl(DEFAULT_BOOT_SPLAT_URL);
    pushUrl(FALLBACK_SPLAT_URL);
    return queue;
  }

  async duplicateSplatMeshFromSourceData(sourceMesh) {
    if (!sourceMesh || !this.sparkModule?.SplatMesh) return null;
    if (!sourceMesh.splats && !sourceMesh.packedSplats && !sourceMesh.extSplats) return null;

    const mesh = new this.sparkModule.SplatMesh({
      splats: sourceMesh.splats,
      packedSplats: sourceMesh.packedSplats,
      extSplats: sourceMesh.extSplats,
      covSplats: sourceMesh.covSplats === true,
      editable: sourceMesh.editable,
      raycastable: sourceMesh.raycastable,
      lod: true,
      nonLod: true,
      maxSh: Number(sourceMesh.maxSh) || 3
    });
    if (mesh.initialized) {
      await mesh.initialized;
    }
    return mesh;
  }

  async reloadSplatFromSource(source) {
    if (!source) return null;
    if (source.type === 'file') {
      return loadSplatFromFile({
        file: source.file,
        scene: this.scene,
        sparkRenderer: this.sparkRenderer,
        sparkModule: this.sparkModule,
        previousMesh: null,
        setStatus: (message) => this.setStatus(message, 'info')
      });
    }
    if (source.type === 'url') {
      return loadSplatFromUrl({
        url: source.url,
        scene: this.scene,
        sparkModule: this.sparkModule,
        previousMesh: null
      });
    }
    return null;
  }

  async cloneSplatForExtraction(sourceMesh, source = null) {
    if (!sourceMesh) {
      throw new Error('Missing source splat mesh.');
    }

    let clone = null;
    try {
      clone = sourceMesh.clone(true);
      this.configureExtractedSplatMesh(clone, sourceMesh);
      if (this.isRenderableSplatMesh(clone)) {
        return clone;
      }
      clone.removeFromParent?.();
      clone.dispose?.();
      this.setStatus('Splat clone returned empty data; reloading source for extraction.', 'info');
    } catch {
      clone?.removeFromParent?.();
      clone?.dispose?.();
    }

    try {
      const shared = await this.duplicateSplatMeshFromSourceData(sourceMesh);
      if (shared) {
        this.configureExtractedSplatMesh(shared, sourceMesh);
        if (this.isRenderableSplatMesh(shared)) {
          return shared;
        }
        shared.removeFromParent?.();
        shared.dispose?.();
      }
    } catch {
      // Fall back to source reload candidates.
    }

    const queue = this.buildExtractionSourceQueue(source);
    for (const candidate of queue) {
      try {
        const mesh = await this.reloadSplatFromSource(candidate);
        if (!mesh) continue;
        this.configureExtractedSplatMesh(mesh, sourceMesh);
        if (this.isRenderableSplatMesh(mesh)) {
          return mesh;
        }
        mesh.removeFromParent?.();
        mesh.dispose?.();
      } catch {
        // Try the next source candidate.
      }
    }

    throw new Error('Unable to clone source splat and no valid source asset could be reloaded.');
  }

  buildActorCacheRequest(environment, voxelData, selectedKeys, extractionKeys) {
    const source = this.buildExtractionSourceQueue(environment?.splatSource ?? null)[0] ?? null;
    if (!source) {
      throw new Error('No source splat asset is available for actor preprocessing.');
    }

    const request = {
      selectedKeys: Array.from(selectedKeys),
      extractionKeys: Array.from(extractionKeys),
      selectionCount: selectedKeys.size,
      voxelData: {
        resolution: voxelData.resolution,
        origin: voxelData.origin
      },
      sourceTransform: toTransformSnapshot(environment.splatMesh),
      overlap: {
        overlapScale: DEFAULT_ACTOR_CACHE_REQUEST.overlapScale,
        maxVoxelRadius: DEFAULT_ACTOR_CACHE_REQUEST.maxVoxelRadius
      },
      rigPreset: DEFAULT_ACTOR_CACHE_REQUEST.rigPreset,
      defaultClip: 'walk'
    };

    if (source.type === 'file') {
      request.sourceName = source.file?.name || 'actor-source.spz';
      return { request, sourceFile: source.file };
    }
    request.sourceUrl = source.url;
    request.sourceName = parseLoadedName(source.url)?.name ?? source.url.split('/').pop() ?? 'actor-source.spz';
    return { request, sourceFile: null };
  }

  async finalizeExtractedActor({
    environment,
    voxelData,
    extractionKeys,
    subsetData,
    extractedMesh,
    extractedSplatCount = 0,
    actorCacheData = null,
    actorMaskBoxes = null,
    statusMessage = ''
  }) {
    const actor = new VoxelSplatActor({
      name: `Extracted ${environment.splatMesh.name || 'Actor'}`,
      owner: `extract-${Date.now()}`,
      splatMesh: extractedMesh,
      voxelData: subsetData,
      actorCacheData,
      initialClipIndex: 1,
      initialPoseMode: this.actorPoseModeRequested
    });
    await actor.init(this.context);
    if (actorMaskBoxes) {
      this.applyManagedWorldMask(actor.splatMesh, actorMaskBoxes);
    } else {
      this.clearManagedWorldMask(actor.splatMesh);
    }
    this.entities.push(actor);
    actor.setProxyVisible(this.viewMode !== 'splats-only' && this.showProxyRequested);

    const environmentHiddenKeys = new Set([
      ...Array.from(this.voxelEditState.getDeletedKeys()),
      ...Array.from(extractionKeys)
    ]);
    const environmentMaskBoxes = mergeVoxelKeysToBoxes(
      environmentHiddenKeys,
      voxelData.resolution,
      voxelData.origin
    );
    this.applyManagedWorldMask(environment.splatMesh, environmentMaskBoxes);

    environment.removeProxy?.();
    this.syncVoxelEditData();

    this.eventBus.emit('hierarchyChanged');
    this.eventBus.emit('environment:voxelEditMode', false);
    this.eventBus.emit('editor:objectEditMode', true);
    this.eventBus.emit('controls:mode', 'object-edit');
    this.eventBus.emit('selectionChanged', {
      target: 'object',
      uuids: actor.root?.uuid ? [actor.root.uuid] : [],
      object: actor.root ?? null,
      frameObject: actor.focusFrameObject ?? actor.splatMesh ?? actor.root ?? null
    });
    this.eventBus.emit('selection:focusRequested');

    this.setStatus(
      statusMessage || `Extracted actor created (${subsetData.activeCount.toLocaleString()} voxels, ${Math.max(0, extractedSplatCount).toLocaleString()} splats) in ${this.actorPoseModeRequested === 't-pose' ? 'T-pose' : 'walk-cycle'} mode.`,
      'success'
    );
    return actor;
  }

  async preprocessSelectedVoxelActor() {
    this.syncVoxelEditData();
    const environment = this.findEnvironmentEntity();
    const voxelData = this.voxelEditState.getVoxelData();
    if (!environment?.splatMesh || !voxelData || environment?.proxyKind !== 'voxel') {
      this.setStatus('Generate a voxel proxy before preprocessing an actor.', 'warning');
      return;
    }

    const selectedKeys = this.getSelectedVoxelKeys(voxelData);
    if (selectedKeys.size < 1) {
      this.setStatus('Select voxels before preprocessing an actor.', 'warning');
      return;
    }

    const extractionKeys = this.expandSelectedVoxelKeys(voxelData, selectedKeys, {
      radius: DEFAULT_ACTOR_CACHE_REQUEST.selectionExpansionRadius,
      maxScale: DEFAULT_ACTOR_CACHE_REQUEST.selectionExpansionMaxScale
    });
    const subsetData = this.buildVoxelSubsetData(voxelData, extractionKeys);
    if (!subsetData || subsetData.activeCount < 1) {
      this.setStatus('Selected voxels could not be prepared for actor preprocessing.', 'error');
      return;
    }

    let extractedMesh = null;
    try {
      const { request, sourceFile } = this.buildActorCacheRequest(environment, voxelData, selectedKeys, extractionKeys);
      this.updateActorCacheState({
        jobId: null,
        status: 'queued',
        stage: 'submit',
        progress: 0.01,
        error: null,
        manifestUrl: null
      });
      this.setStatus('Submitting actor preprocess job to local cache server...', 'info');

      const submitted = await this.actorCacheClient.submitJob(request, sourceFile);
      this.updateActorCacheState(submitted ?? {});

      const finalState = submitted?.status === 'done'
        ? submitted
        : await this.actorCacheClient.waitForJob(submitted?.jobId, {
          onUpdate: (state) => this.updateActorCacheState(state ?? {})
        });

      if (!finalState || finalState.status === 'error') {
        throw new Error(finalState?.error || 'Actor preprocess job failed.');
      }
      if (!finalState.manifestUrl) {
        throw new Error('Actor preprocess completed without a manifest URL.');
      }

      this.updateActorCacheState({ stage: 'load-artifacts', progress: 0.94 });
      const manifest = await this.actorCacheClient.fetchManifest(finalState.manifestUrl);
      const bindingArrays = await this.actorCacheClient.fetchBindingArrays(manifest);
      extractedMesh = await loadSplatFromUrl({
        url: manifest.actorSpzUrl,
        scene: this.scene,
        sparkModule: this.sparkModule,
        previousMesh: null
      });
      this.configureExtractedSplatMesh(extractedMesh, environment.splatMesh, manifest.sourceTransform);
      if (!this.isRenderableSplatMesh(extractedMesh)) {
        throw new Error('Cached actor splat failed to load.');
      }

      await this.finalizeExtractedActor({
        environment,
        voxelData,
        extractionKeys,
        subsetData,
        extractedMesh,
        extractedSplatCount: manifest.actorSplatCount,
        actorCacheData: {
          manifest,
          bindingArrays
        },
        statusMessage: `Preprocessed actor loaded (${subsetData.activeCount.toLocaleString()} voxels, ${Math.max(0, manifest.actorSplatCount).toLocaleString()} splats) with cached rig + bindings.`
      });
      this.updateActorCacheState({
        status: 'done',
        stage: 'done',
        progress: 1,
        error: null,
        manifestUrl: finalState.manifestUrl
      });
    } catch (error) {
      extractedMesh?.removeFromParent?.();
      extractedMesh?.dispose?.();
      const message = error instanceof Error ? error.message : String(error);
      this.updateActorCacheState({
        status: 'error',
        stage: 'error',
        progress: 1,
        error: message
      });
      this.setStatus(`Actor preprocess unavailable: ${message}`, 'warning');
    }
  }

  async extractSelectedVoxelActor() {
    this.syncVoxelEditData();
    const environment = this.findEnvironmentEntity();
    const voxelData = this.voxelEditState.getVoxelData();
    if (!environment?.splatMesh || !voxelData || environment?.proxyKind !== 'voxel') {
      this.setStatus('Generate a voxel proxy before extracting an actor.', 'warning');
      return;
    }

    const selectedKeys = this.getSelectedVoxelKeys(voxelData);
    if (selectedKeys.size < 1) {
      this.setStatus('Select voxels to extract into an actor.', 'warning');
      return;
    }

    const extractionKeys = this.expandSelectedVoxelKeys(voxelData, selectedKeys, {
      radius: 1,
      maxScale: 2.5
    });

    const subsetData = this.buildVoxelSubsetData(voxelData, extractionKeys);
    if (!subsetData || subsetData.activeCount < 1) {
      this.setStatus('Selected voxels could not be converted into an actor.', 'error');
      return;
    }

    this.setStatus('Extracting voxel-selected actor...', 'info');

    let extractedMesh = null;
    let extractedSplatCount = 0;
    let actorMaskBoxes = null;
    try {
      let subsetFailure = null;
      try {
        const subsetResult = await buildSplatSubsetMeshFromVoxelKeys({
          sourceMesh: environment.splatMesh,
          sparkModule: this.sparkModule,
          selectedKeys: extractionKeys,
          voxelData
        });
        extractedSplatCount = subsetResult?.splatCount ?? 0;
        extractedMesh = subsetResult?.mesh ?? null;

        if (extractedMesh) {
          this.configureExtractedSplatMesh(extractedMesh, environment.splatMesh);
          if (!this.isRenderableSplatMesh(extractedMesh)) {
            extractedMesh.removeFromParent?.();
            extractedMesh.dispose?.();
            extractedMesh = null;
          }
        }
      } catch (error) {
        subsetFailure = error;
        extractedMesh?.removeFromParent?.();
        extractedMesh?.dispose?.();
        extractedMesh = null;
      }

      if (!extractedMesh) {
        if (subsetFailure) {
          this.setStatus(
            `Per-splat extraction unavailable; falling back to masked clone: ${subsetFailure instanceof Error ? subsetFailure.message : String(subsetFailure)}`,
            'info'
          );
        }
        const nonSelectedKeys = [];
        for (const key of voxelData.occupiedKeys) {
          if (!extractionKeys.has(key)) nonSelectedKeys.push(key);
        }
        extractedMesh = await this.cloneSplatForExtraction(environment.splatMesh, environment?.splatSource ?? null);
        actorMaskBoxes = mergeVoxelKeysToBoxes(nonSelectedKeys, voxelData.resolution, voxelData.origin);
      }

      await this.finalizeExtractedActor({
        environment,
        voxelData,
        extractionKeys,
        subsetData,
        extractedMesh,
        extractedSplatCount,
        actorMaskBoxes
      });
    } catch (error) {
      extractedMesh?.removeFromParent?.();
      extractedMesh?.dispose?.();
      this.setStatus(`Actor extraction failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  applySnapSettings(settings) {
    if (settings && typeof settings === 'object') {
      this.snapSettings = {
        enabled: settings.enabled !== false,
        space: settings.space === 'local' ? 'local' : 'world',
        translate: Math.max(0.01, Number(settings.translate) || this.snapSettings.translate),
        rotate: Math.max(0.1, Number(settings.rotate) || this.snapSettings.rotate),
        scale: Math.max(0.01, Number(settings.scale) || this.snapSettings.scale)
      };
    }

    const controls = this.editorTransformControls;
    if (!controls) return;
    controls.setSpace(this.snapSettings.space);
    if (!this.snapSettings.enabled) {
      controls.setTranslationSnap(null);
      controls.setRotationSnap(null);
      controls.setScaleSnap(null);
      return;
    }
    controls.setTranslationSnap(this.snapSettings.translate);
    controls.setRotationSnap(THREE.MathUtils.degToRad(this.snapSettings.rotate));
    controls.setScaleSnap(this.snapSettings.scale);
  }

  getPrimarySelectedObject() {
    if (!this.selectedObjectUuid) return null;
    return this.scene?.getObjectByProperty?.('uuid', this.selectedObjectUuid) ?? null;
  }

  updateEditorTransformBinding() {
    const controls = this.editorTransformControls;
    if (!controls) return;

    const selected = this.getPrimarySelectedObject();
    const canAttach = this.interactionMode === 'object-edit'
      && this.editorTransformMode !== 'select'
      && isEditableSelectionObject(selected, this.scene, this.camera, this.sparkRenderer);
    if (!canAttach) {
      controls.detach();
      controls.enabled = false;
      controls.visible = false;
      this.eventBus.emit('controls:orbitSuppress', false);
      return;
    }

    controls.enabled = true;
    controls.visible = true;
    controls.setMode(this.editorTransformMode === 'rotate' || this.editorTransformMode === 'scale' ? this.editorTransformMode : 'translate');
    if (controls.object !== selected) {
      controls.attach(selected);
    }
  }

  setEditorTransformMode(mode) {
    const controls = this.editorTransformControls;
    if (!controls) return;
    const normalized = mode === 'select' || mode === 'rotate' || mode === 'scale' ? mode : 'translate';
    this.editorTransformMode = normalized;
    this.eventBus.emit('editor:transformModeChanged', { mode: normalized });
    if (normalized === 'select') {
      controls.detach();
      controls.visible = false;
      controls.enabled = false;
      this.eventBus.emit('controls:orbitSuppress', false);
      return;
    }
    if (!controls.object) this.updateEditorTransformBinding();
    controls.setMode(normalized);
    controls.visible = true;
    this.setStatus(`Transform mode: ${normalized}.`, 'info');
  }

  handleTransformModeRequested(payload = {}) {
    const mode = payload?.mode;
    const normalized = mode === 'select' || mode === 'rotate' || mode === 'scale' || mode === 'translate'
      ? mode
      : 'translate';
    if (normalized !== 'select' && this.interactionMode !== 'object-edit') {
      this.eventBus.emit('editor:objectEditMode', true);
      this.eventBus.emit('gameplay:enable', false);
      this.eventBus.emit('environment:sheepGizmoEnabled', false);
      this.eventBus.emit('environment:voxelEditMode', false);
      this.eventBus.emit('controls:mode', 'object-edit');
    }
    this.setEditorTransformMode(normalized);
  }

  isPickingEnabledForMode() {
    return this.interactionMode !== 'gameplay';
  }

  handleViewportPointerDown(event) {
    if (!this.isPickingEnabledForMode()) return;
    if (event?.button !== 0) return;
    const canvas = this.renderer?.domElement;
    if (!canvas || event?.target !== canvas) return;
    this.pointerDownSelection = {
      x: Number(event?.clientX ?? 0),
      y: Number(event?.clientY ?? 0),
      time: performance.now(),
      target: event.target
    };
  }

  handleViewportPointerUp(event) {
    const pending = this.pointerDownSelection;
    this.pointerDownSelection = null;
    if (!pending || !this.isPickingEnabledForMode()) return;
    if (event?.button !== 0) return;
    const canvas = this.renderer?.domElement;
    if (!canvas || event?.target !== canvas || pending.target !== event.target) return;
    if (document.pointerLockElement === canvas || this.transformDragging) return;

    const x = Number(event?.clientX ?? 0);
    const y = Number(event?.clientY ?? 0);
    const dx = x - pending.x;
    const dy = y - pending.y;
    if ((dx * dx + dy * dy) > 16) return;
    if ((performance.now() - pending.time) > 900) return;

    this.pickViewportSelection(event);
  }

  isIgnoredPickObject(object) {
    if (!object) return true;
    if (object.userData?.editorIgnorePicking) return true;
    if (this.editorTransformControls && (object === this.editorTransformControls || this.editorTransformControls.children.includes(object))) {
      return true;
    }
    let cursor = object.parent;
    while (cursor) {
      if (cursor.userData?.editorIgnorePicking) return true;
      if (cursor === this.editorTransformControls) return true;
      cursor = cursor.parent;
    }
    return false;
  }

  pickViewportSelection(event) {
    const scene = this.scene;
    const camera = this.camera;
    const canvas = this.renderer?.domElement;
    if (!scene || !camera || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const x = ((Number(event?.clientX ?? 0) - rect.left) / width) * 2 - 1;
    const y = -(((Number(event?.clientY ?? 0) - rect.top) / height) * 2 - 1);
    this.selectionPointer.set(x, y);
    this.selectionRaycaster.setFromCamera(this.selectionPointer, camera);

    if (this.interactionMode === 'voxel-edit') {
      this.syncVoxelEditData();
      const voxelData = this.voxelEditState.getVoxelData();
      const voxelMesh = voxelData?.mesh;
      if (!voxelMesh) return;

      const intersections = this.selectionRaycaster.intersectObject(voxelMesh, true);
      const hit = intersections.find((entry) => Number.isInteger(entry?.instanceId)) ?? null;
      const additive = Boolean(event?.metaKey || event?.ctrlKey);
      const extend = Boolean(event?.shiftKey);

      if (!hit) {
        if (!additive && !extend) this.voxelEditState.clearSelection();
        return;
      }

      const instanceIndex = Number(hit.instanceId);
      if (additive) {
        this.voxelEditState.toggleSelect(instanceIndex);
      } else if (extend) {
        this.voxelEditState.addSelect(instanceIndex);
      } else {
        this.voxelEditState.selectOnly(instanceIndex);
      }
      return;
    }

    const intersections = this.selectionRaycaster.intersectObjects(scene.children, true);
    const selected = pickSelectionObject(intersections, scene, (object) => this.isIgnoredPickObject(object));

    const additive = Boolean(event?.metaKey || event?.ctrlKey);
    const extend = Boolean(event?.shiftKey);
    const nextSelection = applySelectionClick(this.selectedObjectUuids, selected?.uuid ?? null, { additive, extend });
    if (!selected && (additive || extend)) return;

    this.eventBus.emit('selectionChanged', {
      target: 'object',
      uuids: nextSelection,
      object: selected ?? null
    });
  }

  updateSelectionOutline() {
    const selected = this.getPrimarySelectedObject();
    const outline = this.selectionOutline;
    if (!outline) return;
    if (
      !selected
      || this.interactionMode === 'gameplay'
      || this.interactionMode === 'voxel-edit'
      || selected === this.scene
      || selected === this.sparkRenderer
      || selected.isCamera
    ) {
      outline.visible = false;
      return;
    }
    outline.setFromObject(selected);
    outline.visible = true;
  }

  undoEditorCommand() {
    if (!this.commandHistory.undo()) {
      this.setStatus('Nothing to undo.', 'warning');
      return;
    }
    this.eventBus.emit('hierarchyChanged');
    this.updateEditorTransformBinding();
    this.setStatus('Undo applied.', 'info');
  }

  redoEditorCommand() {
    if (!this.commandHistory.redo()) {
      this.setStatus('Nothing to redo.', 'warning');
      return;
    }
    this.eventBus.emit('hierarchyChanged');
    this.updateEditorTransformBinding();
    this.setStatus('Redo applied.', 'info');
  }

  handleEditorShortcuts(event) {
    if (!event) return;
    if (isTextEntryTarget(event.target)) return;

    const key = String(event.key || '').toLowerCase();
    const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);

    if (ctrlOrMeta && key === 'z') {
      event.preventDefault?.();
      if (event.shiftKey) this.redoEditorCommand();
      else this.undoEditorCommand();
      return;
    }
    if (ctrlOrMeta && key === 'y') {
      event.preventDefault?.();
      this.redoEditorCommand();
      return;
    }
    if (ctrlOrMeta && key === 'd') {
      event.preventDefault?.();
      this.duplicateSelectedObject();
      return;
    }

    if (key === 'f') {
      event.preventDefault?.();
      this.eventBus.emit('selection:focusRequested');
      return;
    }

    if (this.interactionMode === 'object-edit') {
      if (key === 'q') {
        event.preventDefault?.();
        this.setEditorTransformMode('select');
        this.setStatus('Transform gizmo hidden (Q).', 'info');
        return;
      }
      if (key === 'w') {
        event.preventDefault?.();
        this.setEditorTransformMode('translate');
        return;
      }
      if (key === 'e') {
        event.preventDefault?.();
        this.setEditorTransformMode('rotate');
        return;
      }
      if (key === 'r') {
        event.preventDefault?.();
        this.setEditorTransformMode('scale');
        return;
      }
    }

    if ((key === 'delete' || key === 'backspace') && this.interactionMode === 'object-edit') {
      event.preventDefault?.();
      this.deleteSelectedObject();
    }
  }

  handleVisibilityToggle(payload = {}) {
    const uuid = typeof payload.uuid === 'string' ? payload.uuid : null;
    const nextVisible = payload.visible !== false;
    if (!uuid) return;
    const object = this.scene?.getObjectByProperty?.('uuid', uuid) ?? null;
    if (!object) return;
    const prevVisible = object.visible !== false;
    if (prevVisible === nextVisible) return;
    this.commandHistory.execute({
      label: `${nextVisible ? 'Show' : 'Hide'} ${object.name || object.type || object.uuid}`,
      do: () => {
        object.visible = nextVisible;
        this.eventBus.emit('hierarchyChanged');
      },
      undo: () => {
        object.visible = prevVisible;
        this.eventBus.emit('hierarchyChanged');
      }
    });
  }

  handleLockToggle(payload = {}) {
    const uuid = typeof payload.uuid === 'string' ? payload.uuid : null;
    const nextLocked = Boolean(payload.locked);
    if (!uuid) return;
    const object = this.scene?.getObjectByProperty?.('uuid', uuid) ?? null;
    if (!object) return;
    const prevLocked = Boolean(object.userData?.editorLocked);
    if (prevLocked === nextLocked) return;
    this.commandHistory.execute({
      label: `${nextLocked ? 'Lock' : 'Unlock'} ${object.name || object.type || object.uuid}`,
      do: () => {
        object.userData = object.userData ?? {};
        object.userData.editorLocked = nextLocked;
        this.updateEditorTransformBinding();
        this.eventBus.emit('hierarchyChanged');
      },
      undo: () => {
        object.userData = object.userData ?? {};
        object.userData.editorLocked = prevLocked;
        this.updateEditorTransformBinding();
        this.eventBus.emit('hierarchyChanged');
      }
    });
  }

  handleReparentRequest(payload = {}) {
    const childId = typeof payload.childId === 'string' ? payload.childId : null;
    if (!childId) return;
    const child = this.scene?.getObjectByProperty?.('uuid', childId) ?? null;
    if (!child || child === this.scene || child === this.camera || child === this.sparkRenderer) return;

    const requestedParentId = typeof payload.parentId === 'string' ? payload.parentId : null;
    const nextParent = requestedParentId
      ? this.scene?.getObjectByProperty?.('uuid', requestedParentId) ?? null
      : this.scene;
    if (!nextParent || nextParent === child || nextParent === this.sparkRenderer) return;

    let cursor = nextParent;
    while (cursor) {
      if (cursor === child) return;
      cursor = cursor.parent;
    }

    const prevParent = child.parent;
    if (!prevParent || prevParent === nextParent) return;
    const prevIndex = prevParent.children.indexOf(child);

    this.commandHistory.execute({
      label: `Reparent ${child.name || child.type || child.uuid}`,
      do: () => {
        nextParent.add(child);
        this.eventBus.emit('hierarchyChanged');
      },
      undo: () => {
        prevParent.add(child);
        if (prevIndex >= 0) {
          const current = prevParent.children.indexOf(child);
          if (current >= 0) {
            prevParent.children.splice(current, 1);
            prevParent.children.splice(Math.min(prevIndex, prevParent.children.length), 0, child);
          }
        }
        this.eventBus.emit('hierarchyChanged');
      }
    });
  }

  handleCreateFolder(payload = {}) {
    const requestedParentId = typeof payload.parentId === 'string' ? payload.parentId : null;
    const parent = requestedParentId
      ? this.scene?.getObjectByProperty?.('uuid', requestedParentId) ?? null
      : this.scene;
    if (!parent) return;
    const folder = new THREE.Group();
    folder.name = payload.name ? String(payload.name) : 'Folder';
    folder.userData = {
      ...(folder.userData ?? {}),
      editorFolder: true
    };

    this.commandHistory.execute({
      label: `Create folder ${folder.name}`,
      do: () => {
        parent.add(folder);
        this.eventBus.emit('hierarchyChanged');
        this.eventBus.emit('selectionChanged', { uuids: [folder.uuid], object: folder });
      },
      undo: () => {
        folder.removeFromParent();
        this.eventBus.emit('hierarchyChanged');
      }
    });
  }

  duplicateSelectedObject() {
    const source = this.getPrimarySelectedObject();
    if (!isEditableSelectionObject(source, this.scene, this.camera, this.sparkRenderer)) {
      this.setStatus('Select an editable object to duplicate.', 'warning');
      return;
    }
    const parent = source.parent ?? this.scene;
    if (!parent) return;
    const clone = source.clone(true);
    clone.name = source.name ? `${source.name} Copy` : `${source.type || 'Object'} Copy`;
    clone.position.add(new THREE.Vector3(0.1, 0, 0.1));
    clone.updateMatrixWorld(true);

    this.commandHistory.execute({
      label: `Duplicate ${source.name || source.type || source.uuid}`,
      do: () => {
        parent.add(clone);
        this.eventBus.emit('hierarchyChanged');
        this.eventBus.emit('selectionChanged', { uuids: [clone.uuid], object: clone });
      },
      undo: () => {
        clone.removeFromParent();
        this.eventBus.emit('hierarchyChanged');
        this.eventBus.emit('selectionChanged', { uuids: [source.uuid], object: source });
      }
    });
    this.setStatus(`Duplicated ${source.name || source.type || source.uuid}.`, 'success');
  }

  deleteSelectedObject() {
    const source = this.getPrimarySelectedObject();
    if (!isEditableSelectionObject(source, this.scene, this.camera, this.sparkRenderer)) {
      this.setStatus('Select an editable object to delete.', 'warning');
      return;
    }
    const parent = source.parent;
    if (!parent) return;
    const index = parent.children.indexOf(source);

    this.commandHistory.execute({
      label: `Delete ${source.name || source.type || source.uuid}`,
      do: () => {
        source.removeFromParent();
        this.eventBus.emit('hierarchyChanged');
        this.eventBus.emit('selectionChanged', { uuids: [], object: null });
      },
      undo: () => {
        parent.add(source);
        if (index >= 0) {
          const current = parent.children.indexOf(source);
          if (current >= 0) {
            parent.children.splice(current, 1);
            parent.children.splice(Math.min(index, parent.children.length), 0, source);
          }
        }
        this.eventBus.emit('hierarchyChanged');
        this.eventBus.emit('selectionChanged', { uuids: [source.uuid], object: source });
      }
    });
    this.setStatus(`Deleted ${source.name || source.type || source.uuid}. Use Undo to restore.`, 'info');
  }

  installSceneEventHooks() {
    if (!this.scene || this.sceneEventsPatched) return;

    const scene = this.scene;
    const originalAdd = scene.add.bind(scene);
    const originalRemove = scene.remove.bind(scene);

    scene.add = (...objects) => {
      const result = originalAdd(...objects);
      for (const object of objects) {
        if (!object) continue;
        stampPrim(object);
        this.eventBus.emit('objectAdded', { object });
        this.eventBus.emit('hierarchyChanged');
      }
      return result;
    };

    scene.remove = (...objects) => {
      const result = originalRemove(...objects);
      for (const object of objects) {
        if (!object) continue;
        this.eventBus.emit('objectRemoved', { object });
        this.eventBus.emit('hierarchyChanged');
      }
      return result;
    };

    this.sceneEventsPatched = true;
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera ?? null;
  }

  getCanvas() {
    return this.renderer?.domElement ?? null;
  }

  claimCanvasForDockview() {
    const canvas = this.getCanvas();
    canvas?.parentElement?.removeChild(canvas);
    return canvas;
  }

  onResize(width, height) {
    const safeWidth = Math.max(Number(width) || 1, 1);
    const safeHeight = Math.max(Number(height) || 1, 1);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
  }

  getControl(id) {
    const uiScoped = this.uiRoot?.querySelector?.(`#${id}`);
    if (uiScoped) return uiScoped;
    return document.getElementById(id);
  }

  setInputValue(id, value) {
    const input = this.getControl(id);
    if (!input) return;
    if ('value' in input) input.value = value;
  }

  setChecked(id, checked) {
    const input = this.getControl(id);
    if (!input || !('checked' in input)) return;
    input.checked = Boolean(checked);
  }

  readChecked(id, fallback = false) {
    const input = this.getControl(id);
    if (!input || !('checked' in input)) return fallback;
    return Boolean(input.checked);
  }

  readNumber(id, fallback = 0) {
    const input = this.getControl(id);
    if (!input || !('value' in input)) return fallback;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  readText(id, fallback = '') {
    const input = this.getControl(id);
    if (!input || !('value' in input)) return fallback;
    const value = String(input.value ?? '').trim();
    return value || fallback;
  }

  findEnvironmentEntity() {
    return this.entities.find((entity) => entity?.constructor?.name === 'EnvironmentSplat') ?? null;
  }

  collectSceneLights() {
    const lightTypeCount = new Map();
    const lights = [];

    this.scene?.traverse?.((node) => {
      if (!node?.isLight) return;
      const type =
        node.isAmbientLight ? 'ambient' :
        node.isDirectionalLight ? 'directional' :
        node.isPointLight ? 'point' :
        node.isSpotLight ? 'spot' :
        null;
      if (!type) return;

      const index = lightTypeCount.get(type) ?? 0;
      lightTypeCount.set(type, index + 1);

      const base = {
        id: node.uuid || `${type}-${index}`,
        type,
        name: node.name || `${type}-${index + 1}`,
        enabled: node.visible !== false,
        color: `#${node.color?.getHexString?.() ?? 'ffffff'}`,
        intensity: Number(node.intensity ?? 1)
      };

      if (type === 'ambient') {
        lights.push(base);
        return;
      }

      if (type === 'directional') {
        lights.push({
          ...base,
          position: toTuple3(node.position),
          target: toTuple3(node.target?.position ?? new THREE.Vector3()),
          castShadow: Boolean(node.castShadow),
          shadowMapSize: Number(node.shadow?.mapSize?.x ?? 1024),
          shadowBias: Number(node.shadow?.bias ?? -0.0005),
          shadowNormalBias: Number(node.shadow?.normalBias ?? 0.02)
        });
        return;
      }

      if (type === 'point') {
        lights.push({
          ...base,
          position: toTuple3(node.position),
          distance: Number(node.distance ?? 0),
          decay: Number(node.decay ?? 2),
          castShadow: Boolean(node.castShadow),
          shadowMapSize: Number(node.shadow?.mapSize?.x ?? 1024),
          shadowBias: Number(node.shadow?.bias ?? -0.0005),
          shadowNormalBias: Number(node.shadow?.normalBias ?? 0.02)
        });
        return;
      }

      lights.push({
        ...base,
        position: toTuple3(node.position),
        target: toTuple3(node.target?.position ?? new THREE.Vector3()),
        distance: Number(node.distance ?? 0),
        decay: Number(node.decay ?? 2),
        angle: Number(node.angle ?? Math.PI / 3),
        penumbra: Number(node.penumbra ?? 0),
        castShadow: Boolean(node.castShadow),
        shadowMapSize: Number(node.shadow?.mapSize?.x ?? 1024),
        shadowBias: Number(node.shadow?.bias ?? -0.0005),
        shadowNormalBias: Number(node.shadow?.normalBias ?? 0.02)
      });
    });

    return lights;
  }

  applySceneLights(lights) {
    const runtimeByType = new Map([
      ['ambient', []],
      ['directional', []],
      ['point', []],
      ['spot', []]
    ]);

    this.scene?.traverse?.((node) => {
      if (!node?.isLight) return;
      if (node.isAmbientLight) runtimeByType.get('ambient').push(node);
      else if (node.isDirectionalLight) runtimeByType.get('directional').push(node);
      else if (node.isPointLight) runtimeByType.get('point').push(node);
      else if (node.isSpotLight) runtimeByType.get('spot').push(node);
    });

    const consumeLight = (type) => {
      const list = runtimeByType.get(type);
      if (!list?.length) return null;
      return list.shift();
    };

    for (const light of Array.isArray(lights) ? lights : []) {
      const target = consumeLight(light?.type);
      if (!target) continue;
      if (light.color) target.color?.set?.(light.color);
      if (Number.isFinite(light.intensity)) target.intensity = light.intensity;
      target.visible = light.enabled !== false;

      if (Array.isArray(light.position) && light.position.length === 3) {
        target.position.set(light.position[0], light.position[1], light.position[2]);
      }

      if (target.isDirectionalLight || target.isSpotLight) {
        if (Array.isArray(light.target) && light.target.length === 3) {
          target.target.position.set(light.target[0], light.target[1], light.target[2]);
        }
      }

      if (target.isPointLight || target.isSpotLight) {
        if (Number.isFinite(light.distance)) target.distance = light.distance;
        if (Number.isFinite(light.decay)) target.decay = light.decay;
      }

      if (target.isSpotLight) {
        if (Number.isFinite(light.angle)) target.angle = light.angle;
        if (Number.isFinite(light.penumbra)) target.penumbra = light.penumbra;
      }

      if ('castShadow' in light) target.castShadow = Boolean(light.castShadow);
      if (target.shadow) {
        if (Number.isFinite(light.shadowMapSize)) target.shadow.mapSize.set(light.shadowMapSize, light.shadowMapSize);
        if (Number.isFinite(light.shadowBias)) target.shadow.bias = light.shadowBias;
        if (Number.isFinite(light.shadowNormalBias)) target.shadow.normalBias = light.shadowNormalBias;
      }
    }
  }

  buildSceneSnapshot() {
    const sceneName = this.readText('scene-name', 'Untitled Scene');
    const toneMapping = this.getControl('tone-mapping')?.value ?? 'ACESFilmic';
    const toneMappingExposure = this.readNumber('tone-mapping-exposure', 1);
    const splatLabel = this.getControl('splat-loaded-name')?.textContent ?? '';
    const loadMode = this.getControl('load-mode')?.value ?? 'spz';
    const splatRef = parseLoadedName(splatLabel);
    if (splatRef) splatRef.loadMode = loadMode;
    const environment = this.findEnvironmentEntity();
    const proxyRoot = environment?.proxyRoot ?? null;

    return createSceneFile({
      sceneName,
      splatRef,
      camera: {
        position: toTuple3(this.camera.position),
        quaternion: toTuple4(this.camera.quaternion),
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far
      },
      settings: {
        lodSplatCount: Number(this.sparkRenderer?.lodSplatCount ?? this.readNumber('lod-count', 1500000)),
        lodSplatScale: Number(this.sparkRenderer?.lodSplatScale ?? this.readNumber('lod-scale', 1)),
        improvedQuality: this.readChecked('quality-improved', false),
        sourceQualityMode: this.readChecked('quality-max-detail', false),
        flipUpDown: this.readChecked('flip-updown', false),
        flipLeftRight: this.readChecked('flip-leftright', false),
        proxyFlipUpDown: this.readChecked('proxy-flip-updown', false),
        proxyMirrorX: this.readChecked('proxy-mirror-x', false),
        proxyMirrorZ: this.readChecked('proxy-mirror-z', false),
        proxyUserPosition: proxyRoot ? toTuple3(proxyRoot.position) : [0, 0, 0],
        proxyUserQuaternion: proxyRoot ? toTuple4(proxyRoot.quaternion) : [0, 0, 0, 1],
        proxyUserScale: proxyRoot ? toTuple3(proxyRoot.scale) : [1, 1, 1],
        outlinerParents: [],
        selectedOutlinerId: this.selectedObjectUuid,
        physicallyCorrectLights: this.readChecked('physically-correct-lights', true),
        toneMapping,
        toneMappingExposure,
        shadowsEnabled: this.readChecked('shadows-enabled', true),
        lightEditMode: this.readChecked('light-edit-mode', false),
        showLightHelpers: this.readChecked('show-light-helpers', true),
        showLightGizmos: this.readChecked('show-light-gizmos', true),
        showMovementControls: this.readChecked('show-movement-controls', true),
        showLightingProbes: this.readChecked('show-lighting-probes', true),
        collisionEnabled: this.readChecked('collision-enabled', false),
        showProxyMesh: this.readChecked('show-proxy-mesh', false),
        voxelEditMode: this.readChecked('voxel-edit-mode', false),
        objectEditMode: this.readChecked('object-edit-mode', false),
        editorSnapEnabled: this.readChecked('editor-snap-enabled', true),
        editorGizmoSpace: this.getControl('editor-gizmo-space')?.value === 'local' ? 'local' : 'world',
        editorTranslateSnap: this.readNumber('editor-translate-snap', 0.25),
        editorRotateSnap: this.readNumber('editor-rotate-snap', 15),
        editorScaleSnap: this.readNumber('editor-scale-snap', 0.1)
      },
      lights: this.collectSceneLights()
    });
  }

  applySceneSnapshot(sceneFile) {
    if (!sceneFile) {
      throw new Error('Scene snapshot payload is required.');
    }

    const { camera, settings, sceneName, lights } = sceneFile;
    if (sceneName) this.setInputValue('scene-name', sceneName);

    if (camera) {
      this.camera.position.set(camera.position[0], camera.position[1], camera.position[2]);
      this.camera.quaternion.set(camera.quaternion[0], camera.quaternion[1], camera.quaternion[2], camera.quaternion[3]);
      this.camera.fov = camera.fov;
      this.camera.near = camera.near;
      this.camera.far = camera.far;
      this.camera.updateProjectionMatrix();
    }

    if (settings) {
      this.setInputValue('lod-count', String(settings.lodSplatCount));
      this.setInputValue('lod-scale', String(settings.lodSplatScale));
      this.setChecked('quality-improved', settings.improvedQuality);
      this.setChecked('quality-max-detail', settings.sourceQualityMode);
      this.setChecked('flip-updown', settings.flipUpDown);
      this.setChecked('flip-leftright', settings.flipLeftRight);
      this.setChecked('proxy-flip-updown', settings.proxyFlipUpDown);
      this.setChecked('proxy-mirror-x', settings.proxyMirrorX);
      this.setChecked('proxy-mirror-z', settings.proxyMirrorZ);
      this.setChecked('show-proxy-mesh', settings.showProxyMesh);
      this.setChecked('collision-enabled', settings.collisionEnabled);
      this.setChecked('voxel-edit-mode', settings.voxelEditMode);
      this.setChecked('object-edit-mode', settings.objectEditMode);
      this.setChecked('light-edit-mode', settings.lightEditMode);
      this.setChecked('show-light-helpers', settings.showLightHelpers);
      this.setChecked('show-light-gizmos', settings.showLightGizmos);
      this.setChecked('show-movement-controls', settings.showMovementControls);
      this.setChecked('show-lighting-probes', settings.showLightingProbes);
      this.setChecked('physically-correct-lights', settings.physicallyCorrectLights);
      this.setChecked('shadows-enabled', settings.shadowsEnabled);
      this.setInputValue('tone-mapping', settings.toneMapping);
      this.setInputValue('tone-mapping-exposure', String(settings.toneMappingExposure));
      this.setChecked('editor-snap-enabled', settings.editorSnapEnabled);
      this.setInputValue('editor-gizmo-space', settings.editorGizmoSpace);
      this.setInputValue('editor-translate-snap', String(settings.editorTranslateSnap));
      this.setInputValue('editor-rotate-snap', String(settings.editorRotateSnap));
      this.setInputValue('editor-scale-snap', String(settings.editorScaleSnap));
    }

    this.applySceneLights(lights);

    if (settings) {
      this.eventBus.emit('environment:flipUpDown', Boolean(settings.flipUpDown));
      this.eventBus.emit('environment:flipLeftRight', Boolean(settings.flipLeftRight));
      this.eventBus.emit('environment:proxyFlipUpDown', Boolean(settings.proxyFlipUpDown));
      this.eventBus.emit('environment:proxyMirrorX', Boolean(settings.proxyMirrorX));
      this.eventBus.emit('environment:proxyMirrorZ', Boolean(settings.proxyMirrorZ));
      this.eventBus.emit('environment:showProxy', Boolean(settings.showProxyMesh));
      this.eventBus.emit('controls:collision', Boolean(settings.collisionEnabled));
      this.eventBus.emit('quality:improved', Boolean(settings.improvedQuality));
      this.eventBus.emit('quality:maxDetail', Boolean(settings.sourceQualityMode));
      this.eventBus.emit('lights:showHelpers', settings.showLightHelpers !== false);
      this.eventBus.emit('lights:showGizmos', settings.showLightGizmos !== false);
      this.eventBus.emit('lights:showMovementControls', settings.showMovementControls !== false);
      this.eventBus.emit('lights:showProbes', settings.showLightingProbes !== false);
      this.eventBus.emit('lights:rendererSettings', {
        physicallyCorrectLights: settings.physicallyCorrectLights !== false,
        shadowsEnabled: settings.shadowsEnabled !== false,
        toneMapping: settings.toneMapping ?? 'ACESFilmic',
        toneMappingExposure: Number(settings.toneMappingExposure ?? 1)
      });
      this.eventBus.emit('lights:editMode', Boolean(settings.lightEditMode));
      this.eventBus.emit('environment:voxelEditMode', Boolean(settings.voxelEditMode));
      this.eventBus.emit('editor:snapSettingsChanged', {
        enabled: settings.editorSnapEnabled,
        space: settings.editorGizmoSpace,
        translate: settings.editorTranslateSnap,
        rotate: settings.editorRotateSnap,
        scale: settings.editorScaleSnap
      });
      if (settings.voxelEditMode) {
        this.eventBus.emit('controls:mode', 'voxel-edit');
      } else if (settings.objectEditMode) {
        this.eventBus.emit('controls:mode', 'object-edit');
      } else {
        this.eventBus.emit('controls:mode', 'view');
      }
    }

    if (settings?.selectedOutlinerId) {
      const selectedObject = this.scene?.getObjectByProperty?.('uuid', settings.selectedOutlinerId) ?? null;
      if (selectedObject) {
        this.eventBus.emit('selectionChanged', {
          uuids: [selectedObject.uuid],
          object: selectedObject
        });
      }
    }
  }

  listSlotNames() {
    return listSceneSlotNames();
  }

  replaceColliders(owner, colliders) {
    const filtered = colliders.filter(Boolean);
    this.colliderMap.set(owner, filtered);
    flattenMapValues(this.colliderMap, this.colliders);
    for (const mesh of filtered) {
      const geometry = mesh.geometry;
      if (geometry?.computeBoundingBox && !geometry.boundingBox) geometry.computeBoundingBox();
    }
  }

  setDynamicColliders(owner, colliders) {
    this.dynamicColliderMap.set(owner, Array.isArray(colliders) ? colliders : []);
    flattenMapValues(this.dynamicColliderMap, this.dynamicColliders);
  }

  clearDynamicColliders(owner) {
    this.dynamicColliderMap.delete(owner);
    flattenMapValues(this.dynamicColliderMap, this.dynamicColliders);
  }

  resolveCameraMovement(from, to, options) {
    if (!options.collisionEnabled) return to;
    const out = options.out ?? this.tempResolved;
    return resolveMovement({
      from,
      to,
      out,
      colliders: this.colliders,
      dynamicColliders: this.dynamicColliders,
      voxelData: this.voxelCollisionData,
      radius: options.radius,
      height: options.height
    });
  }

  update(delta) {
    for (const entity of this.entities) entity.update(delta);
    this.refreshManagedWorldMasks();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.onResize(width, height);
  }

  dispose() {
    for (const [mesh] of this.worldMaskByMesh.entries()) {
      this.clearManagedWorldMask(mesh);
    }
    this.worldMaskByMesh.clear();
    this.voxelEditStateDispose?.();
    this.voxelEditStateDispose = null;
    this.voxelEditState.setVoxelData(null);
    for (const entity of [...this.entities].reverse()) entity.dispose();
    this.selectionDispose?.();
    for (const dispose of this.editorDisposers.splice(0)) dispose();
    this.selectionOutline?.removeFromParent?.();
    this.selectionOutline?.geometry?.dispose?.();
    if (Array.isArray(this.selectionOutline?.material)) {
      for (const material of this.selectionOutline.material) material?.dispose?.();
    } else {
      this.selectionOutline?.material?.dispose?.();
    }
    this.selectionOutline = null;
    this.editorTransformControls?.removeFromParent?.();
    this.editorTransformControls?.dispose?.();
    this.editorTransformControls = null;
    this.uiReadyDispose();
    this.uiDispose();
    this.renderer?.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost);
    this.sparkRenderer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove?.();
    this.context = null;
    this.eventBus.clear?.();
  }
}
