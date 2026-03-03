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
    this.skeletonHelpers = [];
    this.boneMarkers = [];
    this.meshVisible = true;
    this.bonesVisible = false;
  }

  async load(file, splatMesh) {
    this.dispose();
    this.asset = await loadProxyFromFile(file);
    this.container = new THREE.Group();
    this.container.name = `${file.name || 'proxy'}::ProxyContainer`;
    this.container.userData = {
      ...(this.container.userData ?? {}),
      editorSelectableRoot: true
    };
    this.container.add(this.asset.gltfRoot ?? this.asset.root);
    this.animatedRoot = this.asset.animatedRoot ?? this.asset.gltfRoot ?? this.asset.root;
    this.staticColliders = this.asset.colliders ?? [];
    this.context.scene.add(this.container);
    this.skeletonHelpers = this.createSkeletonHelpers(this.asset.skinnedMeshes ?? []);
    this.boneMarkers = this.createBoneMarkers(this.asset.skinnedMeshes ?? []);
    this.meshVisible = true;
    this.bonesVisible = false;
    this.setBonesVisible(false);
    this.setMeshVisible(true);
    this.clipNames = this.animator.bind(this.animatedRoot, this.asset.animations);
    this.animationDriver = this.asset.animatedScaleNodes?.[0] ?? this.asset.animatedNodes?.[0] ?? this.animatedRoot;
    this.boneColliderSet = createBoneColliderSet(this.asset.skinnedMeshes?.[0] ?? null);
    this.context.eventBus.emit('environment:proxyClipList', this.clipNames);
    this.rebindDeformer(splatMesh);
    this.applyCollisionMode(this.collisionMode);
    return this.container;
  }

  createSkeletonHelpers(skinnedMeshes) {
    const helpers = [];
    for (const skinned of Array.isArray(skinnedMeshes) ? skinnedMeshes : []) {
      const helper = new THREE.SkeletonHelper(skinned);
      helper.name = `${skinned.name || 'proxy'}::SkeletonHelper`;
      helper.visible = false;
      helper.frustumCulled = false;
      helper.userData = {
        ...(helper.userData ?? {}),
        editorIgnorePicking: true
      };
      if (helper.material?.color?.setHex) {
        helper.material.color.setHex(0x60a5fa);
      }
      if (helper.material) {
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.material.opacity = 1;
      }
      helper.renderOrder = 900;
      this.container?.add(helper);
      helpers.push(helper);
    }
    return helpers;
  }

  createBoneMarkers(skinnedMeshes) {
    const markers = [];
    const seen = new Set();
    const markerRadius = Math.max(0.015, this.estimateBoneMarkerRadius(skinnedMeshes));
    for (const skinned of Array.isArray(skinnedMeshes) ? skinnedMeshes : []) {
      const bones = skinned?.skeleton?.bones ?? [];
      for (const bone of bones) {
        if (!bone || seen.has(bone.uuid)) continue;
        seen.add(bone.uuid);
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(markerRadius, 12, 12),
          new THREE.MeshBasicMaterial({
            color: 0x22d3ee,
            depthTest: false,
            transparent: true,
            opacity: 0.95
          })
        );
        marker.name = `${bone.name || 'bone'}::Marker`;
        marker.visible = false;
        marker.renderOrder = 901;
        marker.userData = {
          ...(marker.userData ?? {}),
          editorIgnorePicking: true
        };
        bone.add(marker);
        markers.push(marker);
      }
    }
    return markers;
  }

  estimateBoneMarkerRadius(skinnedMeshes) {
    const probe = new THREE.Box3();
    const size = new THREE.Vector3();
    const root = skinnedMeshes?.[0]?.parent ?? this.asset?.gltfRoot ?? this.asset?.root ?? this.container;
    if (!root) return 0.02;
    probe.setFromObject(root);
    if (probe.isEmpty()) return 0.02;
    probe.getSize(size);
    const diagonal = size.length();
    return Math.min(0.08, Math.max(0.02, diagonal * 0.008));
  }

  updateVisibility() {
    if (!this.container) return;
    if (this.asset?.root) this.asset.root.visible = this.meshVisible;
    this.asset?.setDebugVisual?.(this.meshVisible);
    this.container.visible = this.meshVisible || this.bonesVisible;
  }

  setVisible(enabled) {
    this.setMeshVisible(enabled);
  }

  setMeshVisible(enabled) {
    this.meshVisible = Boolean(enabled);
    this.updateVisibility();
  }

  setBonesVisible(enabled) {
    this.bonesVisible = Boolean(enabled);
    for (const helper of this.skeletonHelpers) {
      helper.visible = this.bonesVisible;
    }
    for (const marker of this.boneMarkers) {
      marker.visible = this.bonesVisible;
    }
    this.updateVisibility();
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
    for (const helper of this.skeletonHelpers) {
      helper.removeFromParent();
      helper.geometry?.dispose?.();
      if (Array.isArray(helper.material)) {
        for (const material of helper.material) material?.dispose?.();
      } else {
        helper.material?.dispose?.();
      }
    }
    for (const marker of this.boneMarkers) {
      marker.removeFromParent();
      marker.geometry?.dispose?.();
      if (Array.isArray(marker.material)) {
        for (const material of marker.material) material?.dispose?.();
      } else {
        marker.material?.dispose?.();
      }
    }
    this.container = null;
    this.animatedRoot = null;
    this.animationDriver = null;
    this.deformTarget = null;
    this.staticColliders = [];
    this.boneColliderSet = null;
    this.asset = null;
    this.clipNames = [];
    this.skeletonHelpers = [];
    this.boneMarkers = [];
    this.meshVisible = true;
    this.bonesVisible = false;
    this.context.eventBus.emit('environment:proxyClipList', []);
  }
}
