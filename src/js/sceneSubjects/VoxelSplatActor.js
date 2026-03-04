import { VoxelAutoRigRuntime } from '../internal/voxelAutoRigRuntime';
import { ExternalProxyRuntime } from '../internal/externalProxyRuntime';
import { computeProxyAlignment } from '../internal/proxyAlign';
import { fitHumanoidRigToVoxelData } from '../internal/voxelPoseFitter';

const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const STANDARD_HUMANOID_RIG_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb';
const FALLBACK_HUMANOID_RIG_URL = '/assets/proxies/sean_proxy_animated.glb';
const STANDARD_RIG_FETCH_TIMEOUT_MS = 15000;
let standardHumanoidRigFilePromise = null;

function selectWalkClipIndex(clipNames, fallback = 0) {
  const names = Array.isArray(clipNames) ? clipNames : [];
  const walkIndex = names.findIndex((name) => /walk/i.test(String(name)));
  if (walkIndex >= 0) return walkIndex;
  return Math.max(0, Math.min(names.length - 1, Math.floor(finiteNumber(fallback, 0))));
}

async function getStandardHumanoidRigFile() {
  if (!standardHumanoidRigFilePromise) {
    standardHumanoidRigFilePromise = (async () => {
      try {
        return await fetchAssetAsFileWithTimeout(STANDARD_HUMANOID_RIG_URL, 'Xbot.glb');
      } catch {
        return fetchAssetAsFileWithTimeout(FALLBACK_HUMANOID_RIG_URL, 'sean_proxy_animated.glb', 8000);
      }
    })();
  }

  try {
    return await standardHumanoidRigFilePromise;
  } catch (error) {
    standardHumanoidRigFilePromise = null;
    throw error;
  }
}

async function fetchAssetAsFileWithTimeout(url, fallbackName, timeoutMs = STANDARD_RIG_FETCH_TIMEOUT_MS) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) {
      throw new Error(`Asset fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    const rawName = String(url || '').split('/').pop() || fallbackName || 'asset.bin';
    return new File([blob], rawName, { type: blob.type || 'application/octet-stream' });
  } finally {
    clearTimeout(timer);
  }
}

export class VoxelSplatActor {
  constructor({
    name = 'Extracted Actor',
    owner,
    splatMesh,
    voxelData,
    initialClipIndex = 1
  } = {}) {
    this.name = name;
    this.owner = owner || `extracted-${Date.now()}`;
    this.splatMesh = splatMesh ?? null;
    this.voxelData = voxelData ?? null;
    this.initialClipIndex = Math.max(0, Math.floor(finiteNumber(initialClipIndex, 1)));
    this.context = null;
    this.voxelRuntime = null;
    this.externalRuntime = null;
    this.activeClipIndex = this.initialClipIndex;
    this.standardRigBoneCount = 0;
    this.standardRigError = null;
    this.poseFitMetrics = null;
    this.root = null;
  }

  async init(context) {
    this.context = context;
    if (!this.splatMesh || !this.voxelData) {
      throw new Error('VoxelSplatActor requires splatMesh and voxelData.');
    }

    try {
      await this.initStandardHumanoidRuntime(context);
      this.standardRigError = null;
      context.setStatus(
        `Extracted actor using standard humanoid rig (${this.standardRigBoneCount} bones) and walk cycle.`,
        'success'
      );
      return;
    } catch (error) {
      this.standardRigError = error instanceof Error ? error.message : String(error);
      context.setStatus(
        `Standard humanoid rig unavailable; falling back to procedural voxel rig: ${this.standardRigError}`,
        'warning'
      );
    }

    this.initProceduralVoxelRuntime(context);
  }

  update(delta) {
    this.voxelRuntime?.update(delta);
  }

  setProxyVisible(visible) {
    const show = Boolean(visible);
    this.voxelRuntime?.setVisible(show);
    if (!show) {
      this.voxelRuntime?.setBonesVisible(false);
    }
  }

  dispose() {
    this.voxelRuntime?.dispose();
    this.voxelRuntime = null;
    this.externalRuntime = null;
    this.standardRigBoneCount = 0;
    this.poseFitMetrics = null;
    this.root?.removeFromParent?.();
    this.root = null;
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
    this.voxelData = null;
  }

  initProceduralVoxelRuntime(context) {
    this.voxelRuntime = new VoxelAutoRigRuntime({
      context,
      owner: this.owner
    });
    const root = this.voxelRuntime.bind({
      voxelData: this.voxelData,
      splatMesh: this.splatMesh,
      collisionMode: 'bone',
      deformEnabled: true
    });
    root.name = this.name;

    this.splatMesh.removeFromParent?.();
    root.add(this.splatMesh);
    context.scene.add(root);

    this.voxelRuntime.setSpeed(1.1);
    this.voxelRuntime.playClip(this.initialClipIndex);
    this.voxelRuntime.setPlaying(true);
    this.root = root;
  }

  findAlignmentAnchorNode(bones) {
    const list = Array.isArray(bones) ? bones : [];
    if (!list.length) return null;
    const preferred = [/hips/i, /pelvis/i, /root/i, /spine/i];
    for (const pattern of preferred) {
      const match = list.find((bone) => pattern.test(bone?.name || ''));
      if (match) return match;
    }
    return list[0] ?? null;
  }

  buildExternalRuntimeAdapter(external) {
    const actor = this;
    const names = Array.isArray(external?.clipNames) ? external.clipNames : [];
    return {
      clipNames: names,
      setVisible: (enabled) => external.setVisible(enabled),
      setBonesVisible: (enabled) => external.setBonesVisible(enabled),
      playClip: (selection) => {
        const ok = external.animator.playClip(selection);
        if (ok) {
          actor.activeClipIndex = typeof selection === 'number'
            ? Math.max(0, Math.min(names.length - 1, Math.floor(selection)))
            : Math.max(0, names.findIndex((name) => name === selection));
        }
        return ok;
      },
      setPlaying: (enabled) => external.animator.setPlaying(enabled),
      setSpeed: (value) => external.animator.setSpeed(value),
      update: (delta) => external.update(delta),
      dispose: () => external.dispose(),
      get meshVisible() {
        return Boolean(external.meshVisible);
      },
      get boneCount() {
        return actor.standardRigBoneCount;
      },
      getAnimationState: () => {
        const activeAction = external.animator.activeAction;
        const clip = activeAction?.getClip?.();
        const duration = Math.max(0, Number(clip?.duration) || 0);
        const time = Math.max(0, Number(activeAction?.time) || 0);
        const phase = duration > 1e-6 ? ((time % duration) / duration) : 0;
        return {
          clipIndex: actor.activeClipIndex,
          clipName: names[actor.activeClipIndex] ?? '',
          playing: Boolean(external.animator.playing),
          speed: Number(external.animator.speed) || 0,
          phase,
          walkSettings: {}
        };
      }
    };
  }

  async initStandardHumanoidRuntime(context) {
    const rigFile = await getStandardHumanoidRigFile();
    const external = new ExternalProxyRuntime({ context, owner: this.owner });
    const root = await external.load(rigFile, this.splatMesh);
    root.name = this.name;
    root.userData = {
      ...(root.userData ?? {}),
      editorSelectableRoot: true
    };

    const bones = external.asset?.skinnedMeshes?.[0]?.skeleton?.bones ?? [];
    const alignment = computeProxyAlignment(this.splatMesh, root, {
      profile: 'character',
      preferUpright: true,
      anchorNode: this.findAlignmentAnchorNode(bones),
      anchorBlend: 0.85
    });
    root.quaternion.multiply(alignment.quaternion);
    root.scale.multiplyScalar(alignment.scale);
    root.position.add(alignment.offset);
    root.updateMatrixWorld(true);

    if (typeof root.attach === 'function') {
      root.attach(this.splatMesh);
    } else {
      this.splatMesh.removeFromParent?.();
      root.add(this.splatMesh);
    }
    this.splatMesh.updateMatrixWorld(true);

    this.poseFitMetrics = fitHumanoidRigToVoxelData({
      voxelData: this.voxelData,
      bones,
      stiffness: 0.92
    });
    if (this.poseFitMetrics?.applied) {
      root.updateMatrixWorld(true);
      context.setStatus(
        `Pose fit applied from voxel landmarks (${this.poseFitMetrics.appliedCount} joints, ${(this.poseFitMetrics.coverage * 100).toFixed(0)}% coverage).`,
        'success'
      );
    }

    external.setCollisionMode('off');
    external.setDeformEnabled(true, this.splatMesh);
    external.rebindDeformer(this.splatMesh);

    const clipNames = Array.isArray(external.clipNames) ? external.clipNames : [];
    this.activeClipIndex = selectWalkClipIndex(clipNames, this.initialClipIndex);
    external.animator.setSpeed(1.0);
    external.animator.playClip(this.activeClipIndex);
    external.animator.setPlaying(true);

    this.standardRigBoneCount = bones.length;
    this.externalRuntime = external;
    this.voxelRuntime = this.buildExternalRuntimeAdapter(external);
    this.root = root;
    this.setProxyVisible(false);
  }
}
