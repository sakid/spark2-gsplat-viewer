import { loadProxyFromFile } from './proxyLoader';
import { ProxyAnimationController } from './proxyAnimationController';
import { createBoneColliderSet } from './boneColliders';
import { ProxySplatDeformer } from './proxySplatDeformer';
import * as THREE from 'three';

const BONE_MODE = 'bone';
const STATIC_MODE = 'static';
const OFF_MODE = 'off';

// NEW PROXY ANIMATION
export class ExternalProxyRuntime {
  constructor({ context, owner }) {
    this.context = context;
    this.owner = owner;
    this.animator = new ProxyAnimationController();
    this.deformer = new ProxySplatDeformer();
    this.deformTarget = null;
    this.collisionMode = BONE_MODE;
    this.deformEnabled = true;
    this.clipNames = [];
  }

  async load(file, splatMesh) {
    this.dispose();
    this.asset = await loadProxyFromFile(file);
    this.container = new THREE.Group();
    this.container.name = `${file.name || 'proxy'}::ProxyContainer`;
    this.container.add(this.asset.gltfRoot ?? this.asset.root);
    this.animatedRoot = this.asset.animatedRoot ?? this.asset.gltfRoot ?? this.asset.root;
    this.staticColliders = this.asset.colliders ?? [];
    this.context.scene.add(this.container);
    this.clipNames = this.animator.bind(this.animatedRoot, this.asset.animations);
    this.animationDriver = this.asset.animatedScaleNodes?.[0] ?? this.asset.animatedNodes?.[0] ?? this.animatedRoot;
    this.boneColliderSet = createBoneColliderSet(this.asset.skinnedMeshes?.[0] ?? null);
    this.context.eventBus.emit('environment:proxyClipList', this.clipNames);
    this.rebindDeformer(splatMesh);
    this.applyCollisionMode(this.collisionMode);
    return this.container;
  }

  setVisible(enabled) {
    if (!this.container) return;
    if (this.asset?.root) this.asset.root.visible = true;
    this.container.visible = Boolean(enabled);
    this.asset?.setDebugVisual?.(Boolean(enabled));
  }

  setCollisionMode(mode) {
    const next = mode === OFF_MODE || mode === STATIC_MODE || mode === BONE_MODE ? mode : BONE_MODE;
    this.collisionMode = next;
    this.applyCollisionMode(next);
  }

  setDeformEnabled(enabled, splatMesh) {
    this.deformEnabled = Boolean(enabled);
    this.deformer.setEnabled(this.deformEnabled);
    if (!this.deformEnabled) this.deformer.dispose();
    else this.rebindDeformer(splatMesh);
  }

  rebindDeformer(splatMesh) {
    this.deformTarget = splatMesh ?? null;
    this.deformer.setEnabled(this.deformEnabled);
    this.container?.updateMatrixWorld?.(true);
    const bones = this.asset?.skinnedMeshes?.[0]?.skeleton?.bones ?? null;
    const result = this.deformer.bind({ sparkModule: this.context.sparkModule, splatMesh, bones, animatedRoot: this.animationDriver ?? this.animatedRoot });
    if (!result || result.mode === 'off') {
      if (this.deformEnabled) this.context.setStatus(`Proxy deformation disabled: ${result?.reason || 'unknown reason'}`, 'warning');
      return false;
    }
    if (this.deformEnabled) this.context.setStatus(`Proxy deformation active (${result.mode}).`, 'success');
    return true;
  }

  applyCollisionMode(mode) {
    if (!this.asset) return;
    if (mode === OFF_MODE) {
      this.context.replaceColliders(this.owner, []);
      this.context.clearDynamicColliders(this.owner);
      return;
    }
    if (mode === STATIC_MODE) {
      this.context.replaceColliders(this.owner, this.staticColliders);
      this.context.clearDynamicColliders(this.owner);
      return;
    }
    this.context.replaceColliders(this.owner, []);
    if (!this.boneColliderSet) {
      this.context.setStatus('Proxy has no skeleton; collision mode fell back to off.', 'warning');
      this.collisionMode = OFF_MODE;
      this.context.clearDynamicColliders(this.owner);
      this.context.replaceColliders(this.owner, []);
      return;
    }
  }

  update(delta) {
    this.animator.update(delta);
    this.container?.updateMatrixWorld?.(true);
    this.deformer.update();
    if (this.deformEnabled && this.deformer.mode === 'off' && this.deformTarget && this.animationDriver) {
      // Fallback: rigidly follow proxy animation if LBS is unavailable.
      this.animationDriver.updateMatrixWorld(true);
      this.animationDriver.matrixWorld.decompose(this.deformTarget.position, this.deformTarget.quaternion, this.deformTarget.scale);
      this.deformTarget.updateMatrixWorld(true);
    }
    if (this.collisionMode === BONE_MODE && this.boneColliderSet) this.context.setDynamicColliders(this.owner, this.boneColliderSet.update());
    else this.context.clearDynamicColliders(this.owner);
  }

  dispose() {
    this.context.clearDynamicColliders(this.owner);
    this.context.replaceColliders(this.owner, []);
    this.container?.removeFromParent();
    this.deformer.dispose();
    this.animator.dispose();
    this.asset?.dispose?.();
    this.asset?.release?.();
    this.container = null;
    this.animatedRoot = null;
    this.animationDriver = null;
    this.deformTarget = null;
    this.staticColliders = [];
    this.boneColliderSet = null;
    this.asset = null;
    this.clipNames = [];
    this.context.eventBus.emit('environment:proxyClipList', []);
  }
}
