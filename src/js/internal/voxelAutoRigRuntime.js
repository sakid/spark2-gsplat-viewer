import * as THREE from 'three';
import { ProxySplatDeformer } from './proxySplatDeformer';

const BONE_MODE = 'bone';
const STATIC_MODE = 'static';
const OFF_MODE = 'off';
const DEFAULT_CLIP_NAME = 'AutoRig Procedural';

const tempCenter = new THREE.Vector3();
const tempLocalA = new THREE.Vector3();
const tempLocalB = new THREE.Vector3();
const tempWorldA = new THREE.Vector3();
const tempWorldB = new THREE.Vector3();
const tempDummy = new THREE.Object3D();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeMode(mode) {
  if (mode === OFF_MODE || mode === STATIC_MODE || mode === BONE_MODE) {
    return mode;
  }
  return BONE_MODE;
}

function centerFromKey(key, resolution, origin, out) {
  const [ixRaw, iyRaw, izRaw] = String(key).split(',');
  const ix = Number(ixRaw) || 0;
  const iy = Number(iyRaw) || 0;
  const iz = Number(izRaw) || 0;
  return out.set(
    origin.x + (ix + 0.5) * resolution,
    origin.y + (iy + 0.5) * resolution,
    origin.z + (iz + 0.5) * resolution
  );
}

// NEW PROXY ANIMATION
export class VoxelAutoRigRuntime {
  constructor({ context, owner }) {
    this.context = context;
    this.owner = owner;
    this.root = null;
    this.mesh = null;
    this.voxelData = null;
    this.bones = [];
    this.bindInverse = [];
    this.localA = null;
    this.localB = null;
    this.boneA = null;
    this.boneB = null;
    this.weightB = null;
    this.dynamicColliders = [];
    this.playing = true;
    this.speed = 4;
    this.elapsed = 0;
    this.collisionMode = BONE_MODE;
    this.deformer = new ProxySplatDeformer();
    this.deformEnabled = true;
    this.deformTarget = null;
    this.clipNames = [DEFAULT_CLIP_NAME];
  }

  get boneCount() {
    return this.bones.length;
  }

  setVisible(enabled) {
    if (this.root) {
      this.root.visible = Boolean(enabled);
    }
  }

  setPlaying(enabled) {
    this.playing = Boolean(enabled);
  }

  setSpeed(value) {
    this.speed = Math.max(0, Number(value) || 0);
  }

  playClip(selection = 0) {
    if (!this.clipNames.length) {
      return false;
    }
    if (typeof selection === 'number' && selection !== 0) {
      return false;
    }
    this.restart();
    return true;
  }

  restart() {
    this.elapsed = 0;
  }

  setCollisionMode(mode) {
    this.collisionMode = normalizeMode(mode);
    this.applyCollisionMode();
  }

  setDeformEnabled(enabled, splatMesh) {
    this.deformEnabled = Boolean(enabled);
    this.deformer.setEnabled(this.deformEnabled);
    if (!this.deformEnabled) {
      this.deformer.dispose();
      return;
    }
    this.rebindDeformer(splatMesh);
  }

  bind({ voxelData, splatMesh, collisionMode = BONE_MODE, deformEnabled = true }) {
    if (!voxelData?.mesh) {
      throw new Error('Voxel auto-rig requires voxelData.mesh.');
    }

    this.dispose();

    this.voxelData = voxelData;
    this.mesh = voxelData.mesh;
    this.mesh.name = 'AutoRigVoxelProxy';
    this.mesh.frustumCulled = false;

    const root = new THREE.Group();
    root.name = 'AutoRigVoxelProxyRoot';
    root.add(this.mesh);
    this.root = root;

    this.buildBones();
    this.precomputeSkinningData();
    this.buildDynamicColliderTemplate();
    this.applyCollisionMode(normalizeMode(collisionMode));
    this.setDeformEnabled(deformEnabled, splatMesh);
    this.playing = true;
    this.restart();
    this.update(0);
    return this.root;
  }

  buildBones() {
    if (!this.voxelData) return;
    const keys = this.voxelData.indexToKey;
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('Voxel auto-rig cannot build bones without voxel keys.');
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;

    for (const key of keys) {
      centerFromKey(key, this.voxelData.resolution, this.voxelData.origin, tempCenter);
      minX = Math.min(minX, tempCenter.x);
      maxX = Math.max(maxX, tempCenter.x);
      minY = Math.min(minY, tempCenter.y);
      maxY = Math.max(maxY, tempCenter.y);
      minZ = Math.min(minZ, tempCenter.z);
      maxZ = Math.max(maxZ, tempCenter.z);
      sumX += tempCenter.x;
      sumZ += tempCenter.z;
      count += 1;
    }

    const centerX = count > 0 ? sumX / count : 0;
    const centerZ = count > 0 ? sumZ / count : 0;
    const width = Math.max(maxX - minX, maxZ - minZ, this.voxelData.resolution);
    const height = Math.max(maxY - minY, this.voxelData.resolution);
    const estimatedSegments = Math.round(height / Math.max(this.voxelData.resolution * 1.5, 0.12));
    const boneCount = clamp(estimatedSegments + 1, 4, 12);
    const segmentHeight = height / Math.max(1, boneCount - 1);
    const rootBone = new THREE.Bone();

    rootBone.name = 'VoxelRigBone_0';
    rootBone.position.set(centerX, minY, centerZ);
    this.root?.add(rootBone);
    this.bones = [rootBone];

    let cursor = rootBone;
    for (let i = 1; i < boneCount; i += 1) {
      const bone = new THREE.Bone();
      bone.name = `VoxelRigBone_${i}`;
      bone.position.set(0, segmentHeight, 0);
      cursor.add(bone);
      this.bones.push(bone);
      cursor = bone;
    }

    this.minY = minY;
    this.maxY = maxY;
    this.bodyWidth = width;
  }

  precomputeSkinningData() {
    if (!this.voxelData || this.bones.length === 0) return;
    const count = this.voxelData.indexToKey.length;
    const boneCount = this.bones.length;
    const height = Math.max(this.maxY - this.minY, this.voxelData.resolution * 0.5);
    this.root?.updateMatrixWorld(true);
    this.bindInverse = this.bones.map((bone) => bone.matrixWorld.clone().invert());
    this.localA = new Float32Array(count * 3);
    this.localB = new Float32Array(count * 3);
    this.boneA = new Uint16Array(count);
    this.boneB = new Uint16Array(count);
    this.weightB = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const key = this.voxelData.indexToKey[i];
      centerFromKey(key, this.voxelData.resolution, this.voxelData.origin, tempCenter);

      const normalizedY = clamp((tempCenter.y - this.minY) / height, 0, 1);
      const scaled = normalizedY * (boneCount - 1);
      const indexA = Math.floor(scaled);
      const indexB = Math.min(boneCount - 1, indexA + 1);
      const weightB = scaled - indexA;

      this.boneA[i] = indexA;
      this.boneB[i] = indexB;
      this.weightB[i] = weightB;

      tempLocalA.copy(tempCenter).applyMatrix4(this.bindInverse[indexA]);
      this.localA[i * 3 + 0] = tempLocalA.x;
      this.localA[i * 3 + 1] = tempLocalA.y;
      this.localA[i * 3 + 2] = tempLocalA.z;

      tempLocalB.copy(tempCenter).applyMatrix4(this.bindInverse[indexB]);
      this.localB[i * 3 + 0] = tempLocalB.x;
      this.localB[i * 3 + 1] = tempLocalB.y;
      this.localB[i * 3 + 2] = tempLocalB.z;
    }
  }

  buildDynamicColliderTemplate() {
    if (!this.voxelData || this.bones.length === 0) {
      this.dynamicColliders = [];
      return;
    }

    const baseRadius = Math.max(this.voxelData.resolution * 0.75, this.bodyWidth * 0.15);
    this.dynamicColliders = this.bones.map((bone, index) => {
      const taper = 1 - index / Math.max(this.bones.length * 1.1, 1);
      return {
        bone,
        center: new THREE.Vector3(),
        radius: Math.max(this.voxelData.resolution * 0.5, baseRadius * clamp(taper, 0.35, 1))
      };
    });
  }

  updateDynamicColliders() {
    for (const item of this.dynamicColliders) {
      item.bone.getWorldPosition(item.center);
    }
    return this.dynamicColliders;
  }

  applyCollisionMode(mode = this.collisionMode) {
    this.collisionMode = normalizeMode(mode);
    if (!this.voxelData) return;

    if (this.collisionMode === OFF_MODE) {
      this.context.clearDynamicColliders(this.owner);
      this.context.setVoxelCollisionData(null);
      return;
    }

    if (this.collisionMode === STATIC_MODE) {
      this.context.clearDynamicColliders(this.owner);
      this.context.setVoxelCollisionData(this.voxelData);
      return;
    }

    if (this.dynamicColliders.length === 0) {
      this.context.clearDynamicColliders(this.owner);
      this.context.setVoxelCollisionData(this.voxelData);
      return;
    }

    this.context.setVoxelCollisionData(null);
    this.context.setDynamicColliders(this.owner, this.updateDynamicColliders());
  }

  rebindDeformer(splatMesh) {
    this.deformTarget = splatMesh ?? null;
    this.deformer.setEnabled(this.deformEnabled);
    if (!this.deformEnabled) {
      this.deformer.dispose();
      return false;
    }
    this.root?.updateMatrixWorld?.(true);
    const result = this.deformer.bind({
      sparkModule: this.context.sparkModule,
      splatMesh,
      bones: this.bones,
      animatedRoot: this.root
    });
    if (!result || result.mode === 'off') {
      this.context.setStatus(`Voxel deformer disabled: ${result?.reason || 'unknown reason'}`, 'warning');
      return false;
    }
    this.context.setStatus(`Voxel deformer active (${result.mode}).`, 'success');
    return true;
  }

  animateBones(delta) {
    if (this.bones.length === 0) return;
    if (this.playing && this.speed > 0) {
      this.elapsed += Math.max(0, Number(delta) || 0) * this.speed;
    }

    const t = this.elapsed;
    for (let i = 0; i < this.bones.length; i += 1) {
      const bone = this.bones[i];
      const normalized = i / Math.max(1, this.bones.length - 1);
      if (i === 0) {
        bone.rotation.x = Math.sin(t * 0.5) * 0.06;
        bone.rotation.y = Math.sin(t * 0.65) * 0.24;
        bone.rotation.z = Math.cos(t * 0.9) * 0.04;
        continue;
      }
      const swayAmplitude = (1 - normalized) * 0.3 + 0.03;
      const twistAmplitude = (1 - normalized) * 0.12;
      bone.rotation.z = Math.sin(t * 2.0 + normalized * 1.4) * swayAmplitude;
      bone.rotation.x = Math.cos(t * 1.7 + normalized * 0.8) * twistAmplitude;
      bone.rotation.y = Math.sin(t * 1.1 + normalized * 0.5) * 0.08;
    }
  }

  applyVoxelSkinning() {
    if (!this.mesh || !this.localA || !this.localB || !this.boneA || !this.boneB || !this.weightB) {
      return;
    }

    const count = this.boneA.length;
    for (let i = 0; i < count; i += 1) {
      const key = this.voxelData.indexToKey[i];
      if (!this.voxelData.occupiedKeys.has(key)) {
        tempDummy.position.set(0, 0, 0);
        tempDummy.quaternion.identity();
        tempDummy.scale.set(0, 0, 0);
        tempDummy.updateMatrix();
        this.mesh.setMatrixAt(i, tempDummy.matrix);
        continue;
      }

      const iA = this.boneA[i];
      const iB = this.boneB[i];
      const wB = this.weightB[i];
      const wA = 1 - wB;

      tempWorldA.set(this.localA[i * 3 + 0], this.localA[i * 3 + 1], this.localA[i * 3 + 2]);
      tempWorldA.applyMatrix4(this.bones[iA].matrixWorld).multiplyScalar(wA);

      tempWorldB.set(this.localB[i * 3 + 0], this.localB[i * 3 + 1], this.localB[i * 3 + 2]);
      tempWorldB.applyMatrix4(this.bones[iB].matrixWorld).multiplyScalar(wB);

      tempDummy.position.copy(tempWorldA).add(tempWorldB);
      tempDummy.quaternion.identity();
      tempDummy.scale.set(1, 1, 1);
      tempDummy.updateMatrix();
      this.mesh.setMatrixAt(i, tempDummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(delta) {
    if (!this.root || !this.mesh) return;
    this.animateBones(delta);
    this.root.updateMatrixWorld(true);
    this.applyVoxelSkinning();
    this.deformer.update();

    if (this.collisionMode === BONE_MODE && this.dynamicColliders.length > 0) {
      this.context.setDynamicColliders(this.owner, this.updateDynamicColliders());
    }
  }

  dispose() {
    this.context.clearDynamicColliders(this.owner);
    this.deformer.dispose();
    this.root?.removeFromParent();
    this.root = null;
    this.mesh = null;
    this.voxelData = null;
    this.bones = [];
    this.bindInverse = [];
    this.localA = null;
    this.localB = null;
    this.boneA = null;
    this.boneB = null;
    this.weightB = null;
    this.dynamicColliders = [];
    this.deformTarget = null;
    this.minY = 0;
    this.maxY = 0;
    this.bodyWidth = 0;
  }
}
