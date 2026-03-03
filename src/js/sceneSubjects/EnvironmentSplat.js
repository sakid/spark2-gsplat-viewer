import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { disposeObject3D } from '../internal/disposeThree';
import { EnvironmentTransforms } from '../internal/environmentTransforms';
import { computeProxyAlignment } from '../internal/proxyAlign';
import { loadSplatFromFile, loadSplatFromUrl } from '../internal/splatLoaders';
import { generateStableVoxelData } from '../internal/voxelGeneration';
import { exportVoxelProxyGlb } from '../internal/voxelExport';
import { ExternalProxyRuntime } from '../internal/externalProxyRuntime';
import { VoxelAutoRigRuntime } from '../internal/voxelAutoRigRuntime';
import { frameCameraToSplat } from '../internal/cameraFrame';
import { SplatCropTool } from '../internal/splatCropTool';
import { DEFAULT_BOOT_PROXY_URL, DEFAULT_BOOT_SPLAT_URL, FALLBACK_SPLAT_URL, fetchAssetAsFile } from '../internal/startupAssets';

const DEFAULT_ENVIRONMENT_SPLAT = DEFAULT_BOOT_SPLAT_URL;
const tempBounds = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempEuler = new THREE.Euler();
const tempInv = new THREE.Matrix4();
const zeroOffset = new THREE.Vector3();
const DEFAULT_PROXY_WALK_SETTINGS = Object.freeze({
  cycleDuration: 1.1,
  strideDegrees: 24,
  swayDegrees: 16,
  yawDegrees: 9,
  torsoTwistDegrees: 12,
  headNodDegrees: 8,
  bounceAmount: 0.22,
  gaitSharpness: 0.55,
  phaseOffset: 0,
  mirror: false
});

const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const removeObject = (scene, object) => {
  if (!object) return;
  scene.remove(object);
  object.removeFromParent();
};

const setLoadedName = (id, name) => {
  const node = document.getElementById(id);
  if (node) node.textContent = name || '';
};

// NEW PROXY ANIMATION
export class EnvironmentSplat {
  constructor() {
    this.unsubscribers = [];
    this.colliderOwner = 'environment';
    this.proxyKind = 'none';
    this.transforms = new EnvironmentTransforms();
    this.proxyCollisionMode = 'bone';
    this.proxyDeformSplat = true;
    this.proxyAlignProfile = 'auto';
    this.proxyAnimPlaying = true;
    this.proxyAnimSpeed = 4;
    this.proxyAnimClipIndex = 0;
    this.proxyWalkSettings = { ...DEFAULT_PROXY_WALK_SETTINGS };
    this.proxyAnimStateElapsed = 0;
    this.externalAutoAlign = true;
    this.showProxyRequested = true;
    this.showProxyBonesRequested = false;
    this.viewMode = 'full';
    this.sheepAlign = {
      x: 0,
      y: 0,
      z: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      scale: 1
    };
    this.sheepCropEnabled = false;
    this.sheepCropShowBox = true;
    this.sheepCropBox = null;
    this.sheepGizmoEnabled = false;
    this.sheepGizmoTarget = 'align';
    this.sheepGizmoMode = 'translate';
    this.sheepAlignHandle = new THREE.Object3D();
    this.sheepAlignHandle.name = 'SheepAlignHandle';
    this.syncingSheepGizmo = false;
  }

  async init(context) {
    this.context = context;
    this.external = new ExternalProxyRuntime({ context, owner: this.colliderOwner });
    this.voxelRuntime = new VoxelAutoRigRuntime({ context, owner: this.colliderOwner });
    this.cropTool = new SplatCropTool({ sparkModule: context.sparkModule });
    this.sheepTransformControls = new TransformControls(context.camera, context.renderer.domElement);
    this.sheepTransformControls.name = 'SheepTransformControls';
    this.sheepTransformControls.setMode(this.sheepGizmoMode);
    this.sheepTransformControls.setSpace('local');
    this.sheepTransformControls.enabled = false;
    this.sheepTransformControls.visible = false;
    this.sheepDragStartState = null;
    this.sheepTransformControls.addEventListener('dragging-changed', (event) => {
      const dragging = Boolean(event?.value);
      this.context?.eventBus?.emit('controls:orbitSuppress', dragging);
      if (dragging) {
        this.sheepDragStartState = this.captureSheepGizmoState();
        return;
      }
      const before = this.sheepDragStartState;
      const after = this.captureSheepGizmoState();
      this.sheepDragStartState = null;
      this.recordSheepGizmoDragCommand(before, after);
    });
    this.sheepTransformControls.addEventListener('objectChange', () => this.onSheepGizmoObjectChange());
    context.scene.add(this.sheepTransformControls);
    const on = (event, handler) => this.unsubscribers.push(context.eventBus.on(event, handler));

    on('environment:loadDefault', () => this.loadDefault());
    on('environment:loadFile', (file) => this.loadFile(file));
    on('environment:proxyFile', (file) => this.loadProxy(file));
    on('environment:showProxy', (enabled) => this.setProxyVisible(enabled));
    on('environment:proxyEditMode', (enabled) => enabled && this.setProxyVisible(true));
    on('environment:generateVoxel', () => this.generateVoxel());
    on('environment:regenerateVoxelRig', () => this.regenerateVoxelRig());
    on('environment:runVoxelWorkflow', (payload) => this.runVoxelWorkflow(payload));
    on('environment:exportVoxelGlb', () => exportVoxelProxyGlb({
      voxelData: this.voxelData,
      baseName: this.splatMesh?.name || 'environment',
      setStatus: this.context.setStatus
    }));
    on('environment:clear', () => this.clear());
    on('environment:realignProxy', () => this.realignProxy());
    on('environment:flipUpDown', (enabled) => this.setTransformFlag('flipUpDown', enabled));
    on('environment:flipLeftRight', (enabled) => this.setTransformFlag('flipLeftRight', enabled));
    on('environment:proxyFlipUpDown', (enabled) => this.setTransformFlag('proxyFlipUpDown', enabled));
    on('environment:proxyMirrorX', (enabled) => this.setTransformFlag('proxyMirrorX', enabled));
    on('environment:proxyMirrorZ', (enabled) => this.setTransformFlag('proxyMirrorZ', enabled));
    on('environment:proxyAlignProfile', (profile) => this.setProxyAlignProfile(profile));
    on('environment:proxyAnimPlay', (enabled) => this.setProxyAnimationPlaying(enabled));
    on('environment:proxyAnimClip', (clip) => this.setProxyAnimationClip(clip));
    on('environment:proxyAnimSpeed', (speed) => this.setProxyAnimationSpeed(speed));
    on('environment:proxyAnimRestart', () => this.restartProxyAnimation());
    on('environment:proxyAnimPhase', (phase) => this.setProxyAnimationPhase(phase));
    on('environment:proxyWalkSettings', (settings) => this.setProxyWalkSettings(settings));
    on('environment:proxyWalkReset', () => this.resetProxyWalkSettings());
    on('environment:proxyCollisionMode', (mode) => this.setProxyCollisionMode(mode));
    on('environment:proxyDeformSplat', (enabled) => this.setProxyDeformEnabled(enabled));
    on('environment:viewMode', (mode) => this.setViewMode(mode));
    on('environment:showProxyBones', (enabled) => this.setProxyBonesVisible(enabled));
    on('environment:sheepAlign', (payload) => this.applyManualSplatAlignmentWithHistory(payload));
    on('environment:sheepAlignReset', () => this.resetManualSplatAlignmentWithHistory());
    on('environment:sheepAlignAutoCenter', () => this.autoCenterSheepWithHistory());
    on('environment:sheepCropEnabled', (enabled) => this.setSheepCropEnabledWithHistory(enabled));
    on('environment:sheepCropShowBox', (visible) => this.setSheepCropHelperVisibleWithHistory(visible));
    on('environment:sheepCropBox', (payload) => this.setSheepCropBoxWithHistory(payload));
    on('environment:sheepCropAutoFit', () => this.autoFitSheepCropWithHistory());
    on('environment:sheepCropReset', () => this.resetSheepCropWithHistory());
    on('environment:sheepGizmoEnabled', (enabled) => this.setSheepGizmoEnabled(enabled));
    on('environment:sheepGizmoTarget', (target) => this.setSheepGizmoTarget(target));
    on('environment:sheepGizmoMode', (mode) => this.setSheepGizmoMode(mode));
    on('dom:keydown', (event) => this.handleSheepGizmoShortcut(event));
    on('environment:requestSheepAlignState', () => this.emitSheepAlignState());
    on('environment:requestSheepCropState', () => this.emitSheepCropState());
    on('environment:requestProxyClipList', () => this.emitProxyClipList());
    on('environment:requestProxyKind', () => this.emitProxyKind());
    on('environment:requestProxyAnimState', () => this.emitProxyAnimationState());

    await this.loadDefault();

    try {
      await this.loadProxy(await fetchAssetAsFile(DEFAULT_BOOT_PROXY_URL, 'sean_proxy_animated.glb'), { forceAutoAlign: true });
      setLoadedName('proxy-loaded-name', 'Loaded: sean_proxy_animated.glb');
    } catch {
      // Boot proxy is optional.
    }

    this.emitProxyKind();
    this.emitProxyAnimationState();
    this.emitSheepAlignState();
    this.emitSheepCropState();
  }

  setTransformFlag(flag, enabled) {
    this.transforms.setFlag(flag, enabled);
    if (this.splatMesh) this.applySplatTransform();
    this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
    if (this.splatMesh) this.applySplatTransform();
    this.external?.rebindDeformer(this.splatMesh);
    if (this.proxyKind === 'voxel' && (flag === 'flipUpDown' || flag === 'flipLeftRight')) this.generateVoxel();
  }

  normalizeManualAlignment(payload = {}) {
    return {
      x: finiteNumber(payload.x, this.sheepAlign.x),
      y: finiteNumber(payload.y, this.sheepAlign.y),
      z: finiteNumber(payload.z, this.sheepAlign.z),
      pitch: finiteNumber(payload.pitch, this.sheepAlign.pitch),
      yaw: finiteNumber(payload.yaw, this.sheepAlign.yaw),
      roll: finiteNumber(payload.roll, this.sheepAlign.roll),
      scale: Math.max(finiteNumber(payload.scale, this.sheepAlign.scale), 1e-4)
    };
  }

  alignmentEquals(a, b) {
    if (!a || !b) return false;
    const eps = 1e-6;
    return (
      Math.abs(a.x - b.x) < eps
      && Math.abs(a.y - b.y) < eps
      && Math.abs(a.z - b.z) < eps
      && Math.abs(a.pitch - b.pitch) < eps
      && Math.abs(a.yaw - b.yaw) < eps
      && Math.abs(a.roll - b.roll) < eps
      && Math.abs(a.scale - b.scale) < eps
    );
  }

  captureSheepCropState() {
    return {
      enabled: Boolean(this.sheepCropEnabled),
      helperVisible: Boolean(this.sheepCropShowBox),
      center: { ...(this.sheepCropBox?.center ?? { x: 0, y: 0, z: 0 }) },
      size: { ...(this.sheepCropBox?.size ?? { x: 1, y: 1, z: 1 }) },
      quaternion: { ...(this.sheepCropBox?.quaternion ?? { x: 0, y: 0, z: 0, w: 1 }) }
    };
  }

  cropStateEquals(a, b) {
    if (!a || !b) return false;
    const eps = 1e-6;
    const valuesA = [
      Number(a.enabled),
      Number(a.helperVisible),
      a.center?.x,
      a.center?.y,
      a.center?.z,
      a.size?.x,
      a.size?.y,
      a.size?.z,
      a.quaternion?.x,
      a.quaternion?.y,
      a.quaternion?.z,
      a.quaternion?.w
    ];
    const valuesB = [
      Number(b.enabled),
      Number(b.helperVisible),
      b.center?.x,
      b.center?.y,
      b.center?.z,
      b.size?.x,
      b.size?.y,
      b.size?.z,
      b.quaternion?.x,
      b.quaternion?.y,
      b.quaternion?.z,
      b.quaternion?.w
    ];
    if (valuesA.length !== valuesB.length) return false;
    for (let i = 0; i < valuesA.length; i += 1) {
      if (Math.abs(Number(valuesA[i] ?? 0) - Number(valuesB[i] ?? 0)) > eps) {
        return false;
      }
    }
    return true;
  }

  restoreSheepCropState(state, options = {}) {
    this.setSheepCropBox(state, { emit: false, silent: true });
    this.setSheepCropHelperVisible(state?.helperVisible, { emit: false });
    this.setSheepCropEnabled(state?.enabled, { emit: false });
    if (options.emit !== false) this.emitSheepCropState();
    this.updateSheepGizmoAttachment();
  }

  runHistoryCommand(label, doAction, undoAction) {
    const history = this.context?.commandHistory;
    if (!history || typeof history.execute !== 'function') {
      doAction();
      return false;
    }
    history.execute({
      label,
      do: doAction,
      undo: undoAction
    });
    return true;
  }

  captureSheepGizmoState() {
    if (this.sheepGizmoTarget === 'crop') {
      return {
        target: 'crop',
        crop: this.captureSheepCropState()
      };
    }
    return {
      target: 'align',
      align: { ...this.sheepAlign }
    };
  }

  recordSheepGizmoDragCommand(before, after) {
    if (!before || !after || before.target !== after.target) return;

    if (before.target === 'crop') {
      if (this.cropStateEquals(before.crop, after.crop)) return;
      this.runHistoryCommand(
        'Sheep crop gizmo transform',
        () => this.restoreSheepCropState(after.crop),
        () => this.restoreSheepCropState(before.crop)
      );
      return;
    }

    if (this.alignmentEquals(before.align, after.align)) return;
    this.runHistoryCommand(
      'Sheep align gizmo transform',
      () => this.applyManualSplatAlignment(after.align, { emit: true, silent: true }),
      () => this.applyManualSplatAlignment(before.align, { emit: true, silent: true })
    );
  }

  applyManualSplatAlignmentWithHistory(payload = {}) {
    const before = { ...this.sheepAlign };
    const next = this.normalizeManualAlignment(payload);
    if (this.alignmentEquals(before, next)) return;
    this.runHistoryCommand(
      'Sheep realign',
      () => this.applyManualSplatAlignment(next, { emit: true, silent: true }),
      () => this.applyManualSplatAlignment(before, { emit: true, silent: true })
    );
    this.context.setStatus(
      `Sheep realign set (offset ${next.x.toFixed(2)}, ${next.y.toFixed(2)}, ${next.z.toFixed(2)} | yaw ${next.yaw.toFixed(1)}° | scale ${next.scale.toFixed(3)}).`,
      'info'
    );
  }

  resetManualSplatAlignmentWithHistory() {
    const before = { ...this.sheepAlign };
    const reset = {
      x: 0,
      y: 0,
      z: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      scale: 1
    };
    if (this.alignmentEquals(before, reset)) {
      this.context.setStatus('Sheep realign reset.', 'info');
      return;
    }
    this.runHistoryCommand(
      'Reset sheep realign',
      () => this.applyManualSplatAlignment(reset, { emit: true, silent: true }),
      () => this.applyManualSplatAlignment(before, { emit: true, silent: true })
    );
    this.context.setStatus('Sheep realign reset.', 'info');
  }

  autoCenterSheepWithHistory() {
    if (!this.getSplatLocalBounds(tempBounds)) {
      this.context.setStatus('Unable to auto-center sheep: splat bounds unavailable.', 'warning');
      return;
    }
    const before = { ...this.sheepAlign };
    tempBounds.getCenter(tempCenter);
    const next = this.normalizeManualAlignment({
      ...this.sheepAlign,
      x: -tempCenter.x,
      y: -tempBounds.min.y,
      z: -tempCenter.z
    });
    if (this.alignmentEquals(before, next)) {
      this.context.setStatus('Sheep auto-centered (XZ origin + feet on Y=0).', 'success');
      return;
    }
    this.runHistoryCommand(
      'Auto-center sheep',
      () => this.applyManualSplatAlignment(next, { emit: true, silent: true }),
      () => this.applyManualSplatAlignment(before, { emit: true, silent: true })
    );
    this.context.setStatus('Sheep auto-centered (XZ origin + feet on Y=0).', 'success');
  }

  setSheepCropEnabledWithHistory(enabled) {
    const before = this.captureSheepCropState();
    const next = { ...before, enabled: Boolean(enabled) };
    if (this.cropStateEquals(before, next)) return;
    this.runHistoryCommand(
      `Sheep crop ${next.enabled ? 'enable' : 'disable'}`,
      () => this.restoreSheepCropState(next),
      () => this.restoreSheepCropState(before)
    );
  }

  setSheepCropHelperVisibleWithHistory(visible) {
    const before = this.captureSheepCropState();
    const next = { ...before, helperVisible: Boolean(visible) };
    if (this.cropStateEquals(before, next)) return;
    this.runHistoryCommand(
      `Sheep crop helper ${next.helperVisible ? 'show' : 'hide'}`,
      () => this.restoreSheepCropState(next),
      () => this.restoreSheepCropState(before)
    );
  }

  setSheepCropBoxWithHistory(payload = {}) {
    const before = this.captureSheepCropState();
    const next = {
      ...before,
      center: {
        x: finiteNumber(payload.center?.x, before.center.x),
        y: finiteNumber(payload.center?.y, before.center.y),
        z: finiteNumber(payload.center?.z, before.center.z)
      },
      size: {
        x: Math.max(finiteNumber(payload.size?.x, before.size.x), 0.01),
        y: Math.max(finiteNumber(payload.size?.y, before.size.y), 0.01),
        z: Math.max(finiteNumber(payload.size?.z, before.size.z), 0.01)
      },
      quaternion: payload.quaternion ?? before.quaternion
    };
    if (this.cropStateEquals(before, next)) return;
    this.runHistoryCommand(
      'Update sheep crop box',
      () => this.restoreSheepCropState(next),
      () => this.restoreSheepCropState(before)
    );
    this.context.setStatus('Sheep crop box updated.', 'info');
  }

  autoFitSheepCropWithHistory() {
    if (!this.cropTool || !this.splatMesh) {
      this.context.setStatus('Load a splat before auto-fitting crop.', 'warning');
      return;
    }
    const before = this.captureSheepCropState();
    this.cropTool.autoFit({ denseCore: true });
    this.syncSheepCropState(true);
    const next = this.captureSheepCropState();
    if (this.cropStateEquals(before, next)) {
      this.context.setStatus('Sheep crop auto-fit from dense splat core.', 'success');
      return;
    }
    this.runHistoryCommand(
      'Auto-fit sheep crop box',
      () => this.restoreSheepCropState(next),
      () => this.restoreSheepCropState(before)
    );
    this.context.setStatus('Sheep crop auto-fit from dense splat core.', 'success');
  }

  resetSheepCropWithHistory() {
    const before = this.captureSheepCropState();
    const reset = {
      enabled: false,
      helperVisible: true,
      center: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };
    if (this.cropStateEquals(before, reset)) {
      this.context.setStatus('Sheep crop reset.', 'info');
      return;
    }
    this.runHistoryCommand(
      'Reset sheep crop',
      () => this.restoreSheepCropState(reset),
      () => this.restoreSheepCropState(before)
    );
    this.context.setStatus('Sheep crop reset.', 'info');
  }

  updateManualAlignmentTransform() {
    const { x, y, z, pitch, yaw, roll, scale } = this.sheepAlign;
    tempEuler.set(
      THREE.MathUtils.degToRad(pitch),
      THREE.MathUtils.degToRad(yaw),
      THREE.MathUtils.degToRad(roll),
      'XYZ'
    );
    tempQuat.setFromEuler(tempEuler);
    tempCenter.set(x, y, z);
    this.transforms.setSplatManualAlignment({
      offset: tempCenter,
      scale,
      quaternion: tempQuat
    });
  }

  applyManualSplatAlignment(payload = {}, options = {}) {
    this.sheepAlign = this.normalizeManualAlignment(payload);
    this.updateManualAlignmentTransform();
    this.syncSheepAlignHandleFromState();

    if (this.splatMesh) {
      this.applySplatTransform();
      if (this.proxyKind === 'external') this.external?.rebindDeformer(this.splatMesh);
      if (this.proxyKind === 'voxel') this.voxelRuntime?.rebindDeformer(this.splatMesh);
    }

    if (options.emit !== false) this.emitSheepAlignState();
    this.updateSheepGizmoAttachment();
    if (options.silent) return;

    this.context.setStatus(
      `Sheep realign set (offset ${this.sheepAlign.x.toFixed(2)}, ${this.sheepAlign.y.toFixed(2)}, ${this.sheepAlign.z.toFixed(2)} | yaw ${this.sheepAlign.yaw.toFixed(1)}° | scale ${this.sheepAlign.scale.toFixed(3)}).`,
      'info'
    );
  }

  resetManualSplatAlignment(options = {}) {
    this.applyManualSplatAlignment({
      x: 0,
      y: 0,
      z: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      scale: 1
    }, { emit: true, silent: true });
    if (!options.silent) {
      this.context.setStatus('Sheep realign reset.', 'info');
    }
  }

  withManualAlignmentDisabled(callback) {
    const saved = { ...this.sheepAlign };
    this.transforms.setSplatManualAlignment({
      offset: zeroOffset,
      scale: 1,
      quaternion: null
    });
    try {
      callback?.();
    } finally {
      this.sheepAlign = saved;
      this.updateManualAlignmentTransform();
    }
  }

  getSplatLocalBounds(out) {
    if (!this.splatMesh) return false;

    if (typeof this.splatMesh.getBoundingBox === 'function') {
      try {
        const bounds = this.splatMesh.getBoundingBox(false);
        if (bounds && !bounds.isEmpty()) {
          out.copy(bounds);
          return true;
        }
      } catch {
        // Fall through to world-bounds fallback.
      }
    }

    out.setFromObject(this.splatMesh);
    if (out.isEmpty()) return false;
    this.splatMesh.updateMatrixWorld(true);
    tempInv.copy(this.splatMesh.matrixWorld).invert();
    out.applyMatrix4(tempInv);
    return !out.isEmpty();
  }

  autoCenterSheep() {
    if (!this.getSplatLocalBounds(tempBounds)) {
      this.context.setStatus('Unable to auto-center sheep: splat bounds unavailable.', 'warning');
      return;
    }
    tempBounds.getCenter(tempCenter);
    this.applyManualSplatAlignment({
      ...this.sheepAlign,
      x: -tempCenter.x,
      y: -tempBounds.min.y,
      z: -tempCenter.z
    }, { silent: true });
    this.context.setStatus('Sheep auto-centered (XZ origin + feet on Y=0).', 'success');
  }

  setSheepCropEnabled(enabled, options = {}) {
    if (!this.cropTool) return;
    this.sheepCropEnabled = Boolean(enabled);
    this.cropTool.setEnabled(this.sheepCropEnabled);
    this.syncSheepCropState(options.emit !== false);
  }

  setSheepCropHelperVisible(visible, options = {}) {
    if (!this.cropTool) return;
    this.sheepCropShowBox = Boolean(visible);
    if (this.sheepGizmoEnabled && this.sheepGizmoTarget === 'crop') {
      this.sheepCropShowBox = true;
    }
    this.cropTool.setHelperVisible(this.sheepCropShowBox);
    this.syncSheepCropState(options.emit !== false);
    this.updateSheepGizmoAttachment();
  }

  setSheepCropBox(payload = {}, options = {}) {
    if (!this.cropTool || !this.splatMesh) return;
    const center = payload.center ?? {};
    const size = payload.size ?? {};
    this.cropTool.setCropBox({
      center: {
        x: finiteNumber(center.x, this.sheepCropBox?.center?.x ?? 0),
        y: finiteNumber(center.y, this.sheepCropBox?.center?.y ?? 0),
        z: finiteNumber(center.z, this.sheepCropBox?.center?.z ?? 0)
      },
      size: {
        x: finiteNumber(size.x, this.sheepCropBox?.size?.x ?? 1),
        y: finiteNumber(size.y, this.sheepCropBox?.size?.y ?? 1),
        z: finiteNumber(size.z, this.sheepCropBox?.size?.z ?? 1)
      },
      quaternion: payload.quaternion ?? null
    });
    this.syncSheepCropState(options.emit !== false);
    this.updateSheepGizmoAttachment();
    if (options.silent) return;
    this.context.setStatus('Sheep crop box updated.', 'info');
  }

  autoFitSheepCrop() {
    if (!this.cropTool || !this.splatMesh) {
      this.context.setStatus('Load a splat before auto-fitting crop.', 'warning');
      return;
    }
    this.cropTool.autoFit({ denseCore: true });
    this.syncSheepCropState(true);
    this.updateSheepGizmoAttachment();
    this.context.setStatus('Sheep crop auto-fit from dense splat core.', 'success');
  }

  resetSheepCrop() {
    if (!this.cropTool) return;
    this.cropTool.reset();
    this.sheepCropEnabled = false;
    this.sheepCropShowBox = true;
    this.cropTool.setHelperVisible(this.sheepCropShowBox);
    this.syncSheepCropState(true);
    this.updateSheepGizmoAttachment();
    this.context.setStatus('Sheep crop reset.', 'info');
  }

  syncSheepCropState(emit = true) {
    if (!this.cropTool) return;
    const state = this.cropTool.getState();
    this.sheepCropEnabled = state.enabled;
    this.sheepCropShowBox = state.helperVisible;
    this.sheepCropBox = {
      center: { ...state.center },
      size: { ...state.size },
      quaternion: { ...(state.quaternion ?? { x: 0, y: 0, z: 0, w: 1 }) }
    };
    if (emit) this.emitSheepCropState();
  }

  attachSheepCropToMesh() {
    if (!this.cropTool) return;
    this.cropTool.bind(this.splatMesh);
    if (!this.sheepCropBox) {
      this.cropTool.autoFit({ denseCore: true });
    } else {
      this.cropTool.setCropBox(this.sheepCropBox);
    }
    this.cropTool.setHelperVisible(this.sheepCropShowBox);
    this.cropTool.setEnabled(this.sheepCropEnabled);
    this.syncSheepCropState(true);
    this.updateSheepGizmoAttachment();
  }

  emitSheepAlignState() {
    this.context?.eventBus?.emit('environment:sheepAlignState', { ...this.sheepAlign });
  }

  emitSheepCropState() {
    this.context?.eventBus?.emit('environment:sheepCropState', {
      enabled: this.sheepCropEnabled,
      helperVisible: this.sheepCropShowBox,
      center: { ...(this.sheepCropBox?.center ?? { x: 0, y: 0, z: 0 }) },
      size: { ...(this.sheepCropBox?.size ?? { x: 1, y: 1, z: 1 }) },
      quaternion: { ...(this.sheepCropBox?.quaternion ?? { x: 0, y: 0, z: 0, w: 1 }) }
    });
  }

  normalizeSheepGizmoMode(mode) {
    return mode === 'rotate' || mode === 'scale' ? mode : 'translate';
  }

  normalizeSheepGizmoTarget(target) {
    return target === 'crop' ? 'crop' : 'align';
  }

  setSheepGizmoEnabled(enabled) {
    this.sheepGizmoEnabled = Boolean(enabled);
    const checkbox = document.getElementById('sheep-gizmo-enabled');
    if (checkbox && 'checked' in checkbox) checkbox.checked = this.sheepGizmoEnabled;
    if (!this.sheepGizmoEnabled) {
      this.context?.eventBus?.emit('controls:orbitSuppress', false);
    }
    this.updateSheepGizmoAttachment();
  }

  setSheepGizmoMode(mode) {
    const next = this.normalizeSheepGizmoMode(mode);
    this.sheepGizmoMode = next;
    const modeInput = document.getElementById('sheep-gizmo-mode');
    if (modeInput && 'value' in modeInput) modeInput.value = next;
    this.sheepTransformControls?.setMode(next);
    this.updateSheepGizmoAttachment();
  }

  setSheepGizmoTarget(target) {
    const next = this.normalizeSheepGizmoTarget(target);
    this.sheepGizmoTarget = next;
    const targetInput = document.getElementById('sheep-gizmo-target');
    if (targetInput && 'value' in targetInput) targetInput.value = next;
    if (next === 'crop') {
      this.setSheepCropHelperVisible(true, { emit: true });
    }
    this.updateSheepGizmoAttachment();
  }

  handleSheepGizmoShortcut(event) {
    if (!this.sheepGizmoEnabled) return;
    const target = event?.target;
    const hasDomTypes =
      typeof HTMLInputElement !== 'undefined'
      && typeof HTMLTextAreaElement !== 'undefined'
      && typeof HTMLSelectElement !== 'undefined';
    if (
      (hasDomTypes && (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
      ))
      || target?.isContentEditable
    ) {
      return;
    }
    if (event.code === 'KeyW') this.setSheepGizmoMode('translate');
    else if (event.code === 'KeyE') this.setSheepGizmoMode('rotate');
    else if (event.code === 'KeyR') this.setSheepGizmoMode('scale');
    else return;
    event.preventDefault?.();
  }

  ensureSheepAlignHandleParent() {
    const parent = this.getSplatTransformParent() ?? this.context?.scene ?? null;
    if (!parent) return;
    if (this.sheepAlignHandle.parent !== parent) {
      parent.add(this.sheepAlignHandle);
    }
  }

  syncSheepAlignHandleFromState() {
    this.ensureSheepAlignHandleParent();
    this.syncingSheepGizmo = true;
    this.sheepAlignHandle.position.set(this.sheepAlign.x, this.sheepAlign.y, this.sheepAlign.z);
    tempEuler.set(
      THREE.MathUtils.degToRad(this.sheepAlign.pitch),
      THREE.MathUtils.degToRad(this.sheepAlign.yaw),
      THREE.MathUtils.degToRad(this.sheepAlign.roll),
      'XYZ'
    );
    this.sheepAlignHandle.quaternion.setFromEuler(tempEuler);
    this.sheepAlignHandle.scale.setScalar(this.sheepAlign.scale);
    this.sheepAlignHandle.updateMatrixWorld(true);
    this.syncingSheepGizmo = false;
  }

  updateSheepGizmoAttachment() {
    if (!this.sheepTransformControls) return;

    const controls = this.sheepTransformControls;
    const hasSplat = Boolean(this.splatMesh);
    if (!this.sheepGizmoEnabled || !hasSplat) {
      controls.detach();
      controls.enabled = false;
      controls.visible = false;
      return;
    }

    let object = null;
    if (this.sheepGizmoTarget === 'crop' && this.cropTool?.helper) {
      object = this.cropTool.helper;
    } else {
      this.syncSheepAlignHandleFromState();
      object = this.sheepAlignHandle;
    }

    controls.enabled = true;
    controls.visible = true;
    controls.setMode(this.sheepGizmoMode);
    if (controls.object !== object) {
      controls.attach(object);
    } else {
      object?.updateMatrixWorld?.(true);
    }
  }

  onSheepGizmoObjectChange() {
    if (!this.sheepGizmoEnabled || this.syncingSheepGizmo) return;
    if (!this.sheepTransformControls?.object) return;

    if (this.sheepGizmoTarget === 'crop' && this.cropTool?.helper) {
      const helper = this.cropTool.helper;
      this.setSheepCropBox({
        center: { x: helper.position.x, y: helper.position.y, z: helper.position.z },
        size: { x: Math.abs(helper.scale.x), y: Math.abs(helper.scale.y), z: Math.abs(helper.scale.z) },
        quaternion: helper.quaternion
      }, { emit: true, silent: true });
      return;
    }

    const handle = this.sheepAlignHandle;
    tempEuler.setFromQuaternion(handle.quaternion, 'XYZ');
    const uniformScale = Math.max(
      1e-4,
      (Math.abs(handle.scale.x) + Math.abs(handle.scale.y) + Math.abs(handle.scale.z)) / 3
    );
    this.applyManualSplatAlignment({
      x: handle.position.x,
      y: handle.position.y,
      z: handle.position.z,
      pitch: THREE.MathUtils.radToDeg(tempEuler.x),
      yaw: THREE.MathUtils.radToDeg(tempEuler.y),
      roll: THREE.MathUtils.radToDeg(tempEuler.z),
      scale: uniformScale
    }, { emit: true, silent: true });
  }

  findAlignmentAnchorNode() {
    const bones = this.external?.asset?.skinnedMeshes?.[0]?.skeleton?.bones ?? [];
    if (!bones.length) return null;
    const preferred = [/hips/i, /pelvis/i, /root/i, /spine/i];
    for (const pattern of preferred) {
      const match = bones.find((bone) => pattern.test(bone?.name || ''));
      if (match) return match;
    }
    return bones[0] ?? null;
  }
  normalizeProxyAlignProfile(value) {
    if (value === 'character' || value === 'generic') return value;
    return 'auto';
  }

  setProxyAlignProfile(profile) {
    const next = this.normalizeProxyAlignProfile(profile);
    if (next === this.proxyAlignProfile) return;
    this.proxyAlignProfile = next;
    if (this.proxyKind !== 'external' || !this.proxyRoot || !this.splatMesh) return;
    this.syncExternalProxy({ autoAlign: true });
    this.external?.rebindDeformer(this.splatMesh);
    this.context.setStatus(`Proxy alignment profile: ${next}.`, 'info');
  }

  normalizeViewMode(mode) {
    return mode === 'splats-only' ? 'splats-only' : 'full';
  }

  setViewMode(mode) {
    const next = this.normalizeViewMode(mode);
    if (this.viewMode === next) return;
    this.viewMode = next;
    this.applyViewSettings();
    this.context.setStatus(
      next === 'splats-only' ? 'Viewing mode: Gaussian splats only.' : 'Viewing mode: Full scene.',
      'info'
    );
  }
  getProxyAlignmentOptions() {
    const asset = this.external?.asset;
    const hasSkeleton = Boolean(asset?.skinnedMeshes?.length);
    const hasAnimations = Boolean(asset?.animations?.length);
    const resolvedProfile = this.proxyAlignProfile === 'auto'
      ? (hasSkeleton ? 'character' : 'generic')
      : this.proxyAlignProfile;
    return {
      profile: resolvedProfile,
      preferUpright: hasSkeleton || hasAnimations,
      anchorNode: hasSkeleton ? this.findAlignmentAnchorNode() : null,
      anchorBlend: hasSkeleton ? 0.85 : 0
    };
  }

  syncExternalProxy({ autoAlign = true } = {}) {
    if (!this.splatMesh || !this.proxyRoot || this.proxyKind !== 'external') return;
    if (autoAlign) {
      this.transforms.setProxyAutoAlignment({ offset: { x: 0, y: 0, z: 0 }, scale: 1, quaternion: null });
      this.transforms.applyProxy(this.proxyRoot);
      const alignment = computeProxyAlignment(this.splatMesh, this.proxyRoot, this.getProxyAlignmentOptions());
      this.transforms.setProxyAutoAlignment(alignment);
    }
    this.transforms.applyProxy(this.proxyRoot);
  }

  isSplatsOnlyView() {
    return this.viewMode === 'splats-only';
  }

  applyProxyVisibility() {
    const visible = this.showProxyRequested && !this.isSplatsOnlyView();
    if (this.proxyKind === 'external') {
      if (typeof this.external?.setMeshVisible === 'function') this.external.setMeshVisible(visible);
      else this.external?.setVisible(visible);
      return;
    }
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setVisible(visible);
      return;
    }
    if (this.proxyRoot) {
      this.proxyRoot.visible = visible;
    }
  }

  applyBoneVisibility() {
    const visible = this.showProxyBonesRequested && !this.isSplatsOnlyView();
    if (this.proxyKind === 'external') {
      this.external?.setBonesVisible(visible);
    } else if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setBonesVisible(visible);
    } else {
      this.external?.setBonesVisible(false);
      this.voxelRuntime?.setBonesVisible(false);
    }
  }

  applyViewSettings() {
    this.applyProxyVisibility();
    this.applyBoneVisibility();
  }

  getSplatTransformParent() {
    if (!this.proxyRoot) return null;
    if (this.proxyKind === 'external' || this.proxyKind === 'voxel') return this.proxyRoot;
    return null;
  }

  applySplatTransform() {
    if (!this.splatMesh) return;
    this.transforms.applySplat(this.splatMesh, this.getSplatTransformParent());
  }

  parentSplatUnderProxy() {
    if (!this.splatMesh || !this.proxyRoot) return;
    this.proxyRoot.updateMatrixWorld(true);
    this.withManualAlignmentDisabled(() => {
      this.transforms.captureSplat(this.splatMesh, this.proxyRoot);
    });
    this.applySplatTransform();
    this.syncSheepAlignHandleFromState();
    this.updateSheepGizmoAttachment();
  }

  detachSplatFromProxy() {
    if (!this.splatMesh) return;
    this.splatMesh.updateMatrixWorld(true);
    this.withManualAlignmentDisabled(() => {
      this.transforms.captureSplat(this.splatMesh);
    });
    this.transforms.applySplat(this.splatMesh);
    this.syncSheepAlignHandleFromState();
    this.updateSheepGizmoAttachment();
  }

  async loadSplat(loader, loadingStatus, successStatus) {
    try {
      if (this.proxyKind === 'voxel') this.removeProxy();
      this.context.setStatus(loadingStatus, 'info');
      this.splatMesh = await loader();
      this.transforms.captureSplat(this.splatMesh);
      this.updateManualAlignmentTransform();
      this.applySplatTransform();
      this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
      this.parentSplatUnderProxy();
      this.applySplatTransform();
      this.attachSheepCropToMesh();
      this.syncSheepAlignHandleFromState();
      this.updateSheepGizmoAttachment();
      this.external?.rebindDeformer(this.splatMesh);
      frameCameraToSplat(this.context.camera, this.splatMesh);
      this.context.eventBus.emit('environment:splatLoaded', this.splatMesh);
      this.emitSheepAlignState();
      this.context.setStatus(successStatus, 'success');
      return true;
    } catch (error) {
      this.context.setStatus(`${successStatus.replace('loaded.', 'load failed:')} ${error.message}`, 'error');
      console.error(error);
      return false;
    }
  }

  async loadDefault() {
    const loadedCanonical = await this.loadSplat(
      () => loadSplatFromUrl({
        url: DEFAULT_ENVIRONMENT_SPLAT,
        scene: this.context.scene,
        sparkModule: this.context.sparkModule,
        previousMesh: this.splatMesh
      }),
      'Loading canonical environment splat...',
      'Environment splat loaded.'
    );
    if (loadedCanonical) {
      setLoadedName('splat-loaded-name', 'Loaded: Sean_Sheep.spz');
      return true;
    }

    const loadedFallback = await this.loadSplat(
      () => loadSplatFromUrl({
        url: FALLBACK_SPLAT_URL,
        scene: this.context.scene,
        sparkModule: this.context.sparkModule,
        previousMesh: this.splatMesh
      }),
      'Loading fallback environment splat...',
      'Environment splat loaded.'
    );
    if (loadedFallback) {
      setLoadedName('splat-loaded-name', 'Loaded: environment-lod.spz');
    }
    return loadedFallback;
  }

  async loadFile(file) {
    if (!file) return false;
    setLoadedName('splat-loaded-name', `Loaded: ${file.name}`);
    return this.loadSplat(
      () => loadSplatFromFile({
        file,
        scene: this.context.scene,
        sparkRenderer: this.context.sparkRenderer,
        sparkModule: this.context.sparkModule,
        previousMesh: this.splatMesh,
        setStatus: (message) => this.context.setStatus(message, 'info')
      }),
      `Loading ${file.name}...`,
      `Loaded ${file.name}.`
    );
  }

  async runVoxelWorkflow(payload = {}) {
    const file = payload?.file && typeof payload.file?.name === 'string' ? payload.file : null;
    if (file) {
      this.context.setStatus(`Step 1/4: importing splat ${file.name}...`, 'info');
      const loaded = await this.loadFile(file);
      if (!loaded) return;
    } else if (!this.splatMesh) {
      this.context.setStatus('Step 1/4 is missing. Import a splat first.', 'warning');
      return;
    } else {
      this.context.setStatus('Step 1/4 complete: using currently loaded splat.', 'info');
    }
    await this.generateVoxel({ workflow: true });
  }

  async loadProxy(file, options = {}) {
    if (!file) return;
    this.context.setStatus(`Loading proxy mesh ${file.name}...`, 'info');
    try {
      this.removeProxy();
      this.proxyKind = 'external';
      this.proxyRoot = await this.external.load(file, this.splatMesh);
      this.externalAutoAlign = options.forceAutoAlign !== false;
      this.transforms.captureProxy(this.proxyRoot);
      this.transforms.setProxyAutoAlignment({ offset: { x: 0, y: 0, z: 0 }, scale: 1, quaternion: null });
      this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
      this.parentSplatUnderProxy();
      this.external.rebindDeformer(this.splatMesh);
      const showProxyInput = document.getElementById('show-proxy-mesh');
      if (showProxyInput && 'checked' in showProxyInput) showProxyInput.checked = true;
      this.showProxyRequested = true;
      setLoadedName('proxy-loaded-name', `Loaded: ${file.name}`);
      this.external.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
      this.external.setCollisionMode(this.proxyCollisionMode);
      this.external.animator.setSpeed(this.proxyAnimSpeed);
      this.external.animator.playClip(this.proxyAnimClipIndex);
      this.external.animator.setPlaying(this.proxyAnimPlaying);
      this.applyViewSettings();
      this.emitProxyClipList();
      this.emitProxyKind();
      this.emitProxyAnimationState();
      this.context.setStatus(`Proxy mesh ${file.name} loaded.`, 'success');
    } catch (error) {
      this.proxyKind = 'none';
      this.proxyRoot = null;
      this.emitProxyClipList();
      this.emitProxyKind();
      this.emitProxyAnimationState();
      this.context.setStatus(`Proxy mesh load failed: ${error.message}`, 'error');
      console.error(error);
    }
  }

  sanitizeProxyWalkSettings(settings = {}, base = this.proxyWalkSettings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    return {
      cycleDuration: Math.max(0.2, finiteNumber(source.cycleDuration, base.cycleDuration)),
      strideDegrees: Math.max(0, finiteNumber(source.strideDegrees, base.strideDegrees)),
      swayDegrees: Math.max(0, finiteNumber(source.swayDegrees, base.swayDegrees)),
      yawDegrees: Math.max(0, finiteNumber(source.yawDegrees, base.yawDegrees)),
      torsoTwistDegrees: Math.max(0, finiteNumber(source.torsoTwistDegrees, base.torsoTwistDegrees)),
      headNodDegrees: Math.max(0, finiteNumber(source.headNodDegrees, base.headNodDegrees)),
      bounceAmount: Math.min(1, Math.max(0, finiteNumber(source.bounceAmount, base.bounceAmount))),
      gaitSharpness: Math.min(1, Math.max(0, finiteNumber(source.gaitSharpness, base.gaitSharpness))),
      phaseOffset: ((finiteNumber(source.phaseOffset, base.phaseOffset) % 1) + 1) % 1,
      mirror: source.mirror == null ? Boolean(base.mirror) : Boolean(source.mirror)
    };
  }

  setProxyAnimationPlaying(enabled) {
    this.proxyAnimPlaying = Boolean(enabled);
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setPlaying(this.proxyAnimPlaying);
    } else {
      this.external?.animator.setPlaying(this.proxyAnimPlaying);
    }
    this.emitProxyAnimationState();
  }

  setProxyAnimationClip(clip) {
    const nextClip = Math.max(0, Math.floor(finiteNumber(clip, this.proxyAnimClipIndex)));
    this.proxyAnimClipIndex = nextClip;
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.playClip(nextClip);
    } else {
      this.external?.animator.playClip(nextClip);
    }
    this.emitProxyAnimationState();
  }

  setProxyAnimationSpeed(speed) {
    this.proxyAnimSpeed = Math.max(0, finiteNumber(speed, this.proxyAnimSpeed));
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setSpeed(this.proxyAnimSpeed);
    } else {
      this.external?.animator.setSpeed(this.proxyAnimSpeed);
    }
    this.emitProxyAnimationState();
  }

  restartProxyAnimation() {
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.restart();
    } else {
      this.external?.animator.restart();
    }
    this.emitProxyAnimationState();
  }

  setProxyAnimationPhase(phase) {
    const normalized = ((finiteNumber(phase, 0) % 1) + 1) % 1;
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setPlaybackPhase(normalized);
      this.emitProxyAnimationState();
    }
  }

  setProxyWalkSettings(settings = {}) {
    this.proxyWalkSettings = this.sanitizeProxyWalkSettings(settings, this.proxyWalkSettings);
    if (this.proxyKind === 'voxel') {
      this.proxyWalkSettings = this.voxelRuntime?.setWalkSettings(this.proxyWalkSettings) ?? this.proxyWalkSettings;
    }
    this.emitProxyAnimationState();
  }

  resetProxyWalkSettings() {
    this.proxyWalkSettings = { ...DEFAULT_PROXY_WALK_SETTINGS };
    if (this.proxyKind === 'voxel') {
      this.proxyWalkSettings = this.voxelRuntime?.resetWalkSettings() ?? this.proxyWalkSettings;
    }
    this.emitProxyAnimationState();
  }

  emitProxyAnimationState() {
    const state = {
      proxyKind: this.proxyKind,
      clipIndex: this.proxyAnimClipIndex,
      playing: this.proxyAnimPlaying,
      speed: this.proxyAnimSpeed,
      phase: 0,
      walkSettings: { ...this.proxyWalkSettings }
    };
    if (this.proxyKind === 'voxel' && this.voxelRuntime) {
      const runtimeState = this.voxelRuntime.getAnimationState();
      state.clipIndex = runtimeState.clipIndex;
      state.playing = runtimeState.playing;
      state.speed = runtimeState.speed;
      state.phase = runtimeState.phase;
      state.walkSettings = runtimeState.walkSettings;
      this.proxyAnimClipIndex = runtimeState.clipIndex;
      this.proxyAnimPlaying = runtimeState.playing;
      this.proxyAnimSpeed = runtimeState.speed;
      this.proxyWalkSettings = { ...runtimeState.walkSettings };
    }
    this.context?.eventBus?.emit('environment:proxyAnimState', state);
  }

  setProxyCollisionMode(mode) {
    this.proxyCollisionMode = mode;
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setCollisionMode(mode);
      return;
    }
    this.external?.setCollisionMode(mode);
  }

  setProxyDeformEnabled(enabled) {
    this.proxyDeformSplat = Boolean(enabled);
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
      return;
    }
    this.external?.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
  }

  setProxyBonesVisible(enabled) {
    this.showProxyBonesRequested = Boolean(enabled);
    this.applyBoneVisibility();
  }

  setProxyVisible(enabled) {
    this.showProxyRequested = Boolean(enabled);
    this.applyProxyVisibility();
  }

  realignProxy() {
    if (this.proxyKind !== 'external') return;
    this.syncExternalProxy({ autoAlign: true });
    this.external?.rebindDeformer(this.splatMesh);
    const { proxyAlignScale, proxyAlignOffset } = this.transforms;
    const profile = this.getProxyAlignmentOptions()?.profile ?? this.proxyAlignProfile;
    this.context.setStatus(
      `Proxy re-aligned (${profile}, scale ${proxyAlignScale.toFixed(3)}, offset ${proxyAlignOffset.x.toFixed(2)}, ${proxyAlignOffset.y.toFixed(2)}, ${proxyAlignOffset.z.toFixed(2)}).`,
      'info'
    );
  }

  async generateVoxel(options = {}) {
    const workflow = Boolean(options?.workflow);
    if (!this.splatMesh) return this.context.setStatus('Load an environment splat before generating voxels.', 'warning');

    try {
      this.context.setStatus(
        workflow ? 'Step 2/4: voxelizing splat...' : 'Generating voxel proxy and auto-rigging bones...',
        'info'
      );
      const voxelData = await generateStableVoxelData({
        splatMesh: this.splatMesh,
        sparkRenderer: this.context.sparkRenderer,
        setStatus: this.context.setStatus
      });
      if (!voxelData) return this.context.setStatus('No solid voxels found for current settings.', 'warning');

      if (workflow) this.context.setStatus('Step 3/4: building procedural rig...', 'info');
      this.removeProxy();
      const root = this.voxelRuntime.bind({
        voxelData,
        splatMesh: this.splatMesh,
        collisionMode: this.proxyCollisionMode,
        deformEnabled: this.proxyDeformSplat
      });
      this.proxyKind = 'voxel';
      this.proxyRoot = root;
      this.proxyDispose = () => {
        this.voxelRuntime.dispose();
        disposeObject3D(root);
      };
      root.frustumCulled = false;
      root.position.set(0, 0, 0);
      root.quaternion.identity();
      root.scale.set(1, 1, 1);
      root.updateMatrixWorld(true);
      this.context.scene.add(root);
      this.parentSplatUnderProxy();

      const showProxyInput = document.getElementById('show-proxy-mesh');
      if (showProxyInput && 'checked' in showProxyInput) showProxyInput.checked = true;
      this.showProxyRequested = true;
      if (workflow) this.context.setStatus('Step 4/4: applying procedural animation...', 'info');
      this.proxyWalkSettings = this.voxelRuntime.setWalkSettings(this.proxyWalkSettings);
      this.voxelRuntime.setSpeed(this.proxyAnimSpeed);
      this.voxelRuntime.playClip(this.proxyAnimClipIndex);
      this.voxelRuntime.setPlaying(this.proxyAnimPlaying);
      this.applyViewSettings();

      this.voxelData = voxelData;
      this.context.replaceColliders(this.colliderOwner, []);
      setLoadedName('proxy-loaded-name', `Loaded: AutoRig Voxel (${voxelData.activeCount.toLocaleString()} voxels)`);
      this.emitProxyClipList();
      this.emitProxyKind();
      this.emitProxyAnimationState();
      this.context.setStatus(
        workflow
          ? `Workflow complete: voxel proxy generated (${voxelData.activeCount.toLocaleString()} voxels), rigged (${this.voxelRuntime.boneCount} bones), and procedural animation is playing.`
          : `Voxel proxy generated (${voxelData.activeCount.toLocaleString()} voxels), auto-rigged (${this.voxelRuntime.boneCount} bones), and procedural animation is playing.`,
        'success'
      );
    } catch (error) {
      this.context.setStatus(
        `${workflow ? 'Voxel workflow failed' : 'Voxel generation failed'}: ${error.message}`,
        'error'
      );
      console.error(error);
    }
  }

  regenerateVoxelRig() {
    if (this.proxyKind !== 'voxel') {
      this.context.setStatus('Generate a voxel proxy before regenerating procedural bones.', 'warning');
      return;
    }
    this.context.setStatus('Regenerating procedural bones from current voxel proxy...', 'info');
    const regenerated = this.voxelRuntime?.regenerateRig(this.splatMesh);
    if (!regenerated) {
      this.context.setStatus('Procedural rig regeneration failed.', 'warning');
      return;
    }
    this.proxyWalkSettings = this.voxelRuntime?.setWalkSettings(this.proxyWalkSettings) ?? this.proxyWalkSettings;
    this.voxelRuntime?.setSpeed(this.proxyAnimSpeed);
    this.voxelRuntime?.playClip(this.proxyAnimClipIndex);
    this.voxelRuntime?.setPlaying(this.proxyAnimPlaying);
    this.applyViewSettings();
    this.emitProxyClipList();
    this.emitProxyAnimationState();
    this.context.setStatus(
      `Procedural rig regenerated (${this.voxelRuntime.boneCount} bones). Select an animation preset to preview.`,
      'success'
    );
  }

  removeProxy() {
    if (this.proxyKind === 'external') {
      this.detachSplatFromProxy();
      this.external?.dispose();
      this.proxyKind = 'none';
      this.proxyRoot = null;
      this.transforms.clearProxy();
      this.context.replaceColliders(this.colliderOwner, []);
      this.context.setVoxelCollisionData(null);
      this.context.clearDynamicColliders(this.colliderOwner);
      this.voxelData = null;
      this.proxyAnimStateElapsed = 0;
      this.emitProxyClipList();
      this.emitProxyKind();
      this.emitProxyAnimationState();
      this.updateSheepGizmoAttachment();
      return;
    }

    this.detachSplatFromProxy();
    removeObject(this.context.scene, this.proxyRoot);
    this.proxyDispose?.();
    this.proxyRelease?.();
    this.proxyKind = 'none';
    this.proxyRoot = null;
    this.proxyDispose = null;
    this.proxyRelease = null;
    this.transforms.clearProxy();
    this.context.replaceColliders(this.colliderOwner, []);
    this.context.setVoxelCollisionData(null);
    this.context.clearDynamicColliders(this.colliderOwner);
    this.voxelData = null;
    this.proxyAnimStateElapsed = 0;
    this.emitProxyClipList();
    this.emitProxyKind();
    this.emitProxyAnimationState();
    this.updateSheepGizmoAttachment();
  }

  emitProxyClipList() {
    const clips = this.proxyKind === 'voxel'
      ? (this.voxelRuntime?.clipNames ?? [])
      : (this.external?.clipNames ?? []);
    this.context?.eventBus?.emit('environment:proxyClipList', clips);
  }

  emitProxyKind() {
    this.context?.eventBus?.emit('environment:proxyKind', this.proxyKind);
  }

  clear() {
    this.setSheepGizmoEnabled(false);
    this.context?.eventBus?.emit('controls:mode', 'view');
    this.sheepTransformControls?.detach?.();
    this.sheepTransformControls && (this.sheepTransformControls.visible = false);
    this.sheepTransformControls && (this.sheepTransformControls.enabled = false);
    this.context?.eventBus?.emit('controls:orbitSuppress', false);
    this.sheepAlignHandle.removeFromParent();
    this.cropTool?.bind(null);
    removeObject(this.context.scene, this.splatMesh);
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
    this.transforms.clearSplat();
    this.sheepAlign = {
      x: 0,
      y: 0,
      z: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      scale: 1
    };
    this.sheepCropEnabled = false;
    this.sheepCropShowBox = true;
    this.sheepCropBox = null;
    this.sheepGizmoEnabled = false;
    this.emitSheepAlignState();
    this.emitSheepCropState();
    this.context.eventBus.emit('environment:splatLoaded', null);
    this.removeProxy();
  }

  update(delta) {
    this.applySplatTransform();
    this.external?.update(delta);
    this.voxelRuntime?.update(delta);
    if (this.proxyKind === 'voxel' && this.voxelRuntime) {
      this.proxyAnimStateElapsed += Math.max(0, finiteNumber(delta, 0));
      if (this.proxyAnimStateElapsed >= 1 / 15) {
        this.proxyAnimStateElapsed = 0;
        this.emitProxyAnimationState();
      }
    }
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    this.external?.dispose();
    this.external = null;
    this.voxelRuntime?.dispose();
    this.voxelRuntime = null;
    this.clear();
    this.cropTool?.dispose();
    this.cropTool = null;
    this.sheepTransformControls?.removeFromParent?.();
    this.sheepTransformControls?.dispose?.();
    this.sheepTransformControls = null;
    this.sheepAlignHandle.removeFromParent();
  }
}
