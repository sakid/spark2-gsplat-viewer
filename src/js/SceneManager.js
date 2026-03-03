import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { loadSparkModule } from '../spark/previewAdapter';
import { resolveCameraMovement as resolveMovement } from './internal/collisionResolver';
import { selectLodSplatCount } from './internal/lodPolicy';
import { bindUi } from './internal/uiBindings';
import { EditorCommandHistory } from './internal/editorCommandHistory';
import { applySparkCovOnlyPatch } from './internal/patchSparkCovOnly';
import { applySelectionClick, pickSelectionObject } from './internal/selectionPicking';
import { GeneralLights } from './sceneSubjects/GeneralLights';
import { CameraControls } from './sceneSubjects/CameraControls';
import { RenderQuality } from './sceneSubjects/RenderQuality';
import { EnvironmentSplat } from './sceneSubjects/EnvironmentSplat';
import { ButterflySplat } from './sceneSubjects/ButterflySplat';
import { DynoEffectSplat } from './sceneSubjects/DynoEffectSplat';
import { Gameplay } from './sceneSubjects/Gameplay';
import { stampPrim } from '../ui/prim-utils.js';
import { createSceneFile, listSceneSlotNames } from './internal/sceneStateBridge.js';

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
    this.selectionRaycaster = new THREE.Raycaster();
    this.selectionPointer = new THREE.Vector2();
    this.pointerDownSelection = null;
    this.selectionOutline = null;
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
    });
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
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.onResize(width, height);
  }

  dispose() {
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
    this.eventBus.clear?.();
  }
}
