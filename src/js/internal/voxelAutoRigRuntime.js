import * as THREE from 'three';
import { ProxySplatDeformer } from './proxySplatDeformer';

const BONE_MODE = 'bone';
const STATIC_MODE = 'static';
const OFF_MODE = 'off';
const TAU = Math.PI * 2;
const PROCEDURAL_CLIPS = ['Idle Sway', 'Walk Cycle', 'Creature Twist'];
const DEFAULT_WALK_SETTINGS = Object.freeze({
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

const tempCenter = new THREE.Vector3();
const tempLocalA = new THREE.Vector3();
const tempLocalB = new THREE.Vector3();
const tempWorldA = new THREE.Vector3();
const tempWorldB = new THREE.Vector3();
const tempDummy = new THREE.Object3D();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePhase(value) {
  const normalized = asFiniteNumber(value, 0) % 1;
  return normalized < 0 ? normalized + 1 : normalized;
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
    this.restPose = [];
    this.bindInverse = [];
    this.localA = null;
    this.localB = null;
    this.boneA = null;
    this.boneB = null;
    this.weightB = null;
    this.dynamicColliders = [];
    this.skeletonHelper = null;
    this.boneMarkers = [];
    this.meshVisible = true;
    this.bonesVisible = false;
    this.playing = true;
    this.speed = 4;
    this.elapsed = 0;
    this.activeClip = 0;
    this.manualPhase = null;
    this.walkSettings = { ...DEFAULT_WALK_SETTINGS };
    this.collisionMode = BONE_MODE;
    this.deformer = new ProxySplatDeformer();
    this.deformEnabled = true;
    this.deformTarget = null;
    this.clipNames = [...PROCEDURAL_CLIPS];
  }

  get boneCount() {
    return this.bones.length;
  }

  updateRootVisibility() {
    if (!this.root) return;
    this.root.visible = this.meshVisible || this.bonesVisible;
  }

  setVisible(enabled) {
    this.meshVisible = Boolean(enabled);
    if (this.mesh) this.mesh.visible = this.meshVisible;
    this.updateRootVisibility();
  }

  setBonesVisible(enabled) {
    this.bonesVisible = Boolean(enabled);
    if (this.skeletonHelper) this.skeletonHelper.visible = this.bonesVisible;
    for (const marker of this.boneMarkers) marker.visible = this.bonesVisible;
    this.updateRootVisibility();
  }

  setPlaying(enabled) {
    this.playing = Boolean(enabled);
    if (this.playing) {
      this.manualPhase = null;
    }
  }

  setSpeed(value) {
    this.speed = clamp(asFiniteNumber(value, this.speed), 0, 20);
  }

  playClip(selection = 0) {
    if (!this.clipNames.length) {
      return false;
    }
    const index = typeof selection === 'number'
      ? Math.floor(selection)
      : this.clipNames.findIndex((name) => name === selection);
    if (!Number.isFinite(index) || index < 0 || index >= this.clipNames.length) return false;
    this.activeClip = index;
    this.restart();
    return true;
  }

  restart() {
    this.elapsed = 0;
    this.manualPhase = null;
  }

  getPlaybackPhase() {
    const duration = Math.max(0.2, asFiniteNumber(this.walkSettings.cycleDuration, DEFAULT_WALK_SETTINGS.cycleDuration));
    const basePhase = this.manualPhase == null
      ? this.elapsed / duration
      : this.manualPhase;
    return normalizePhase(basePhase + this.walkSettings.phaseOffset);
  }

  setPlaybackPhase(value) {
    const duration = Math.max(0.2, asFiniteNumber(this.walkSettings.cycleDuration, DEFAULT_WALK_SETTINGS.cycleDuration));
    const normalized = normalizePhase(value);
    this.elapsed = normalized * duration;
    this.manualPhase = normalized;
    return normalized;
  }

  setWalkSettings(settings = {}) {
    if (!settings || typeof settings !== 'object') {
      return { ...this.walkSettings };
    }
    this.walkSettings = {
      cycleDuration: clamp(asFiniteNumber(settings.cycleDuration, this.walkSettings.cycleDuration), 0.2, 10),
      strideDegrees: clamp(asFiniteNumber(settings.strideDegrees, this.walkSettings.strideDegrees), 0, 80),
      swayDegrees: clamp(asFiniteNumber(settings.swayDegrees, this.walkSettings.swayDegrees), 0, 70),
      yawDegrees: clamp(asFiniteNumber(settings.yawDegrees, this.walkSettings.yawDegrees), 0, 45),
      torsoTwistDegrees: clamp(asFiniteNumber(settings.torsoTwistDegrees, this.walkSettings.torsoTwistDegrees), 0, 60),
      headNodDegrees: clamp(asFiniteNumber(settings.headNodDegrees, this.walkSettings.headNodDegrees), 0, 45),
      bounceAmount: clamp(asFiniteNumber(settings.bounceAmount, this.walkSettings.bounceAmount), 0, 1),
      gaitSharpness: clamp(asFiniteNumber(settings.gaitSharpness, this.walkSettings.gaitSharpness), 0, 1),
      phaseOffset: normalizePhase(asFiniteNumber(settings.phaseOffset, this.walkSettings.phaseOffset)),
      mirror: settings.mirror == null ? this.walkSettings.mirror : Boolean(settings.mirror)
    };
    return { ...this.walkSettings };
  }

  resetWalkSettings() {
    this.walkSettings = { ...DEFAULT_WALK_SETTINGS };
    return { ...this.walkSettings };
  }

  getAnimationState() {
    return {
      clipIndex: this.activeClip,
      clipName: this.clipNames[this.activeClip] ?? '',
      playing: this.playing,
      speed: this.speed,
      phase: this.getPlaybackPhase(),
      walkSettings: { ...this.walkSettings }
    };
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
    this.meshVisible = true;
    this.bonesVisible = false;
    this.activeClip = 0;

    this.buildBones();
    this.precomputeSkinningData();
    this.buildDynamicColliderTemplate();
    this.applyCollisionMode(normalizeMode(collisionMode));
    this.setDeformEnabled(deformEnabled, splatMesh);
    this.playing = true;
    this.setVisible(true);
    this.setBonesVisible(false);
    this.playClip(0);
    this.restart();
    this.update(0);
    return this.root;
  }

  buildBones() {
    if (!this.voxelData) return;
    this.bones[0]?.removeFromParent?.();
    const keys = Array.from(this.voxelData.occupiedKeys ?? []);
    if (!keys.length) {
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

    this.skeletonHelper?.removeFromParent?.();
    this.skeletonHelper?.geometry?.dispose?.();
    this.skeletonHelper?.material?.dispose?.();
    this.skeletonHelper = new THREE.SkeletonHelper(rootBone);
    this.skeletonHelper.name = 'VoxelAutoRig::SkeletonHelper';
    this.skeletonHelper.visible = this.bonesVisible;
    this.skeletonHelper.frustumCulled = false;
    if (this.skeletonHelper.material?.color?.setHex) {
      this.skeletonHelper.material.color.setHex(0x60a5fa);
    }
    if (this.skeletonHelper.material) {
      this.skeletonHelper.material.depthTest = false;
      this.skeletonHelper.material.transparent = true;
      this.skeletonHelper.material.opacity = 1;
    }
    this.skeletonHelper.renderOrder = 900;
    this.root?.add(this.skeletonHelper);
    this.createBoneMarkers();
    this.updateRootVisibility();

    this.restPose = this.bones.map((bone) => bone.position.clone());
    this.minY = minY;
    this.maxY = maxY;
    this.bodyWidth = width;
  }

  createBoneMarkers() {
    this.disposeBoneMarkers();
    const markerRadius = Math.max(this.voxelData?.resolution * 0.35 || 0.02, 0.02);
    this.boneMarkers = this.bones.map((bone) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(markerRadius, 12, 12),
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        })
      );
      marker.name = `${bone.name || 'VoxelRigBone'}::Marker`;
      marker.visible = this.bonesVisible;
      marker.renderOrder = 901;
      bone.add(marker);
      return marker;
    });
  }

  disposeBoneMarkers() {
    for (const marker of this.boneMarkers) {
      marker.removeFromParent();
      marker.geometry?.dispose?.();
      if (Array.isArray(marker.material)) {
        for (const material of marker.material) material?.dispose?.();
      } else {
        marker.material?.dispose?.();
      }
    }
    this.boneMarkers = [];
  }

  regenerateRig(splatMesh = this.deformTarget) {
    if (!this.root || !this.voxelData) {
      return false;
    }
    const keepClip = this.activeClip;
    const keepMeshVisible = this.meshVisible;
    const keepBonesVisible = this.bonesVisible;

    this.deformer.dispose();
    this.disposeBoneMarkers();
    this.bones[0]?.removeFromParent?.();
    this.bones = [];
    this.restPose = [];
    this.bindInverse = [];
    this.localA = null;
    this.localB = null;
    this.boneA = null;
    this.boneB = null;
    this.weightB = null;
    this.dynamicColliders = [];

    this.buildBones();
    this.precomputeSkinningData();
    this.buildDynamicColliderTemplate();
    this.applyCollisionMode(this.collisionMode);
    this.setDeformEnabled(this.deformEnabled, splatMesh);
    this.playClip(keepClip);
    this.setVisible(keepMeshVisible);
    this.setBonesVisible(keepBonesVisible);
    this.update(0);
    return true;
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
    const hasAdvance = this.playing && this.speed > 0;
    if (hasAdvance) {
      this.elapsed += Math.max(0, asFiniteNumber(delta, 0)) * this.speed;
      this.manualPhase = null;
    }

    const duration = Math.max(0.2, asFiniteNumber(this.walkSettings.cycleDuration, DEFAULT_WALK_SETTINGS.cycleDuration));
    const basePhase = this.manualPhase == null
      ? this.elapsed / duration
      : this.manualPhase;
    const phase = normalizePhase(basePhase + this.walkSettings.phaseOffset);
    const walkSettings = this.walkSettings;
    const clip = this.activeClip;
    const stride = THREE.MathUtils.degToRad(walkSettings.strideDegrees);
    const sway = THREE.MathUtils.degToRad(walkSettings.swayDegrees);
    const yaw = THREE.MathUtils.degToRad(walkSettings.yawDegrees);
    const torsoTwist = THREE.MathUtils.degToRad(walkSettings.torsoTwistDegrees);
    const headNod = THREE.MathUtils.degToRad(walkSettings.headNodDegrees);
    const bounce = clamp(walkSettings.bounceAmount, 0, 1);
    const gaitSharpness = clamp(walkSettings.gaitSharpness, 0, 1);
    const mirrorSign = walkSettings.mirror ? -1 : 1;
    const omega = phase * TAU;

    for (let i = 0; i < this.bones.length; i += 1) {
      const bone = this.bones[i];
      const rest = this.restPose[i];
      if (rest) bone.position.copy(rest);
      const normalized = i / Math.max(1, this.bones.length - 1);

      if (clip === 1) {
        const lowerBias = clamp(1 - normalized * 1.7, 0, 1);
        const upperBias = clamp((normalized - 0.45) * 2.0, 0, 1);
        const chainLag = normalized * (Math.PI * (0.35 + gaitSharpness * 0.95));
        const stepWave = Math.sin(omega + chainLag);
        const counterStepWave = Math.sin(omega + Math.PI + chainLag * 0.85);
        const strideWave = Math.sin(omega * 2 + chainLag * 1.35);
        const sharpStep = Math.sin(omega * 2 + chainLag * 0.5);
        const lateralWave = Math.sin(omega + normalized * 2.4 + (walkSettings.mirror ? Math.PI : 0));
        const bounceWave = Math.sin(omega * 2);

        if (i === 0) {
          const rootShift = this.bodyWidth * (0.03 + bounce * 0.03);
          bone.position.x = rest.x + Math.sin(omega + Math.PI * 0.5) * rootShift * mirrorSign;
          bone.position.y = rest.y + Math.max(0, bounceWave) * this.bodyWidth * (0.015 + bounce * 0.035);
          bone.rotation.x = 0.08 + stepWave * (stride * 0.2) + bounceWave * (bounce * 0.07);
          bone.rotation.y = Math.sin(omega + Math.PI * 0.5) * yaw * mirrorSign;
          bone.rotation.z = Math.sin(omega * 2 + Math.PI * 0.25) * sway * 0.13 * mirrorSign;
          continue;
        }

        const strideAmplitude = stride * (0.18 + lowerBias * 0.78);
        const swayAmplitude = sway * (0.08 + (1 - normalized) * 0.45);
        const twistAmplitude = torsoTwist * (0.14 + (1 - normalized) * 0.36);
        const nodAmplitude = headNod * (0.28 + upperBias * 0.72);
        const bounceLift = bounce * (0.03 + lowerBias * 0.1) * sharpStep;

        bone.rotation.x = stepWave * strideAmplitude + strideWave * (strideAmplitude * 0.24) + bounceLift - nodAmplitude * Math.cos(omega + normalized * 1.1);
        bone.rotation.y = counterStepWave * twistAmplitude * mirrorSign + Math.sin(omega + normalized * 0.8) * yaw * 0.22;
        bone.rotation.z = lateralWave * swayAmplitude * mirrorSign + bounceWave * (bounce * 0.04 + lowerBias * 0.02) * mirrorSign;
        continue;
      }

      if (clip === 2) {
        const wave = Math.sin(omega * 1.4 + normalized * 2.8);
        if (i === 0) {
          bone.rotation.x = Math.sin(omega * 0.75) * 0.04;
          bone.rotation.y = Math.sin(omega * 1.1) * 0.18;
          bone.rotation.z = Math.cos(omega * 0.65) * 0.03;
          continue;
        }
        const falloff = (1 - normalized) * 0.25 + 0.04;
        bone.rotation.z = wave * falloff;
        bone.rotation.x = Math.cos(omega + normalized * 2.0) * (falloff * 0.55);
        bone.rotation.y = Math.sin(omega * 1.8 + normalized * 2.4) * 0.09;
        continue;
      }

      if (i === 0) {
        bone.rotation.x = Math.sin(omega * 0.25) * 0.06;
        bone.rotation.y = Math.sin(omega * 0.32) * 0.24;
        bone.rotation.z = Math.cos(omega * 0.45) * 0.04;
        continue;
      }
      const swayAmplitude = (1 - normalized) * 0.3 + 0.03;
      const twistAmplitude = (1 - normalized) * 0.12;
      bone.rotation.z = Math.sin(omega + normalized * 1.4) * swayAmplitude;
      bone.rotation.x = Math.cos(omega * 0.85 + normalized * 0.8) * twistAmplitude;
      bone.rotation.y = Math.sin(omega * 0.55 + normalized * 0.5) * 0.08;
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
    this.disposeBoneMarkers();
    this.skeletonHelper?.removeFromParent?.();
    this.skeletonHelper?.geometry?.dispose?.();
    this.skeletonHelper?.material?.dispose?.();
    this.skeletonHelper = null;
    this.boneMarkers = [];
    this.meshVisible = true;
    this.bonesVisible = false;
    this.root = null;
    this.mesh = null;
    this.voxelData = null;
    this.bones = [];
    this.restPose = [];
    this.bindInverse = [];
    this.localA = null;
    this.localB = null;
    this.boneA = null;
    this.boneB = null;
    this.weightB = null;
    this.dynamicColliders = [];
    this.deformTarget = null;
    this.activeClip = 0;
    this.playing = true;
    this.speed = 4;
    this.elapsed = 0;
    this.manualPhase = null;
    this.walkSettings = { ...DEFAULT_WALK_SETTINGS };
    this.clipNames = [...PROCEDURAL_CLIPS];
    this.minY = 0;
    this.maxY = 0;
    this.bodyWidth = 0;
  }
}
