import { bindSplatToBones } from '../proxy/skinBinding';
import * as THREE from 'three';
import { normalizeSplatMeshCounts } from './splatMeshCounts';

const tempMatrix = new THREE.Matrix4();
const tempInv = new THREE.Matrix4();
const INDEX0 = new THREE.Vector4(0, 0, 0, 0);
const WEIGHT0 = new THREE.Vector4(1, 0, 0, 0);

// NEW PROXY ANIMATION
export class ProxySplatDeformer {
  constructor() {
    this.enabled = true;
    this.skinning = null;
    this.splatMesh = null;
    this.bones = null;
    this.animatedRoot = null;
    this.linearBlend = false;
    this.mode = 'off';
    this.reason = '';
    this.pendingWeights = null;
    this.batchSize = 50_000;
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }
  ensureCovSplats() {
    if (!this.splatMesh || this.splatMesh.covSplats === true) return;
    this.splatMesh.covSplats = true;
    this.splatMesh.updateGenerator?.();
  }
  bind({ sparkModule, splatMesh, bones, animatedRoot }) {
    this.dispose();
    this.splatMesh = splatMesh ?? null;
    this.bones = Array.isArray(bones) ? bones : null;
    this.animatedRoot = animatedRoot ?? null;
    this.mode = 'off';
    this.reason = '';
    if (!this.enabled) return { mode: 'off', reason: 'deformer disabled' };
    if (!this.splatMesh) return { mode: 'off', reason: 'missing splat' };
    if (!sparkModule?.SplatSkinning) return { mode: 'off', reason: 'missing Spark SplatSkinning' };
    if (!sparkModule?.NewSplatAccumulator?.prototype?.__sparkCovOnlyPatchApplied) {
      this.reason = 'Spark cov-only patch not applied; LBS disabled.';
      return { mode: 'off', reason: this.reason };
    }

    try {
      const totalSplats = normalizeSplatMeshCounts(this.splatMesh);
      const linearBlend = sparkModule.SplatSkinningMode?.LINEAR_BLEND ?? 'linear_blend';
      if (this.bones?.length) {
        this.ensureCovSplats();
        this.skinning = new sparkModule.SplatSkinning({ mesh: this.splatMesh, numBones: this.bones.length, mode: linearBlend });
        bindSplatToBones({ splatMesh: this.splatMesh, skinning: this.skinning, bones: this.bones });
        if (this.skinning.skinTexture) this.skinning.skinTexture.needsUpdate = true;
        for (let i = 0; i < this.bones.length; i += 1) {
          this.bones[i].updateMatrixWorld(true);
          this.splatMesh.updateMatrixWorld(true);
          tempInv.copy(this.splatMesh.matrixWorld).invert();
          tempMatrix.multiplyMatrices(tempInv, this.bones[i].matrixWorld);
          this.skinning.setRestMatrix?.(i, tempMatrix);
        }
        this.linearBlend = true;
        this.mode = 'skinned';
      } else if (this.animatedRoot) {
        this.ensureCovSplats();
        this.skinning = new sparkModule.SplatSkinning({ mesh: this.splatMesh, numBones: 1, mode: linearBlend });
        this.splatMesh.updateMatrixWorld(true);
        this.animatedRoot.updateMatrixWorld(true);
        tempInv.copy(this.splatMesh.matrixWorld).invert();
        tempMatrix.multiplyMatrices(tempInv, this.animatedRoot.matrixWorld);
        this.skinning.setRestMatrix?.(0, tempMatrix);
        const total = Math.max(0, totalSplats);
        this.pendingWeights = total > 1_000_000 ? { next: 0, total } : null;
        if (!this.pendingWeights) {
          for (let i = 0; i < total; i += 1) this.skinning.setSplatBones(i, INDEX0, WEIGHT0);
          if (this.skinning.skinTexture) this.skinning.skinTexture.needsUpdate = true;
        }
        this.linearBlend = true;
        this.mode = 'transform';
      }
      if (this.skinning) {
        this.splatMesh.skinning = this.skinning;
        this.splatMesh.updateGenerator?.();
        this.splatMesh.needsUpdate = true;
      }
      if (!this.skinning) return { mode: 'off', reason: 'no bones or animated root' };
      return { mode: this.mode, reason: '' };
    } catch (error) {
      console.warn('Proxy splat deformer bind failed.', error);
      this.skinning?.dispose?.();
      this.skinning = null;
      if (this.splatMesh) this.splatMesh.skinning = null;
      this.mode = 'off';
      this.reason = error instanceof Error ? error.message : String(error);
      return { mode: 'off', reason: this.reason };
    }
  }
  update() {
    if (!this.enabled) return;
    if (this.pendingWeights && this.skinning) {
      const { next, total } = this.pendingWeights;
      const end = Math.min(total, next + this.batchSize);
      for (let i = next; i < end; i += 1) this.skinning.setSplatBones(i, INDEX0, WEIGHT0);
      if (this.skinning.skinTexture) this.skinning.skinTexture.needsUpdate = true;
      this.pendingWeights.next = end;
      if (end >= total) this.pendingWeights = null;
      return;
    }
    if (this.mode === 'transform' && this.skinning && this.animatedRoot && this.splatMesh) {
      this.splatMesh.updateMatrixWorld(true);
      this.animatedRoot.updateMatrixWorld(true);
      tempInv.copy(this.splatMesh.matrixWorld).invert();
      tempMatrix.multiplyMatrices(tempInv, this.animatedRoot.matrixWorld);
      this.skinning.setBoneMatrix(0, tempMatrix);
      this.skinning.updateBones();
      return;
    }
    if (!this.skinning || !this.bones?.length || !this.linearBlend) return;
    if (!this.splatMesh) return;
    this.splatMesh.updateMatrixWorld(true);
    tempInv.copy(this.splatMesh.matrixWorld).invert();
    for (let i = 0; i < this.bones.length; i += 1) {
      this.bones[i].updateMatrixWorld(true);
      tempMatrix.multiplyMatrices(tempInv, this.bones[i].matrixWorld);
      this.skinning.setBoneMatrix(i, tempMatrix);
    }
    this.skinning.updateBones();
  }
  dispose() {
    if (this.splatMesh && this.skinning) {
      this.splatMesh.skinning = null;
      this.splatMesh.updateGenerator?.();
      this.splatMesh.needsUpdate = true;
    }
    this.skinning?.dispose?.();
    this.skinning = null;
    this.splatMesh = null;
    this.bones = null;
    this.animatedRoot = null;
    this.linearBlend = false;
    this.mode = 'off';
    this.reason = '';
    this.pendingWeights = null;
  }
}
