import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { VoxelAutoRigRuntime } from '../src/js/internal/voxelAutoRigRuntime';

function createVoxelData() {
  const resolution = 0.5;
  const keys = [
    '0,0,0',
    '0,1,0',
    '0,2,0',
    '0,3,0',
    '0,4,0',
    '0,5,0',
    '0,6,0',
    '0,7,0'
  ];
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(resolution, resolution, resolution),
    new THREE.MeshBasicMaterial(),
    keys.length
  );

  const helper = new THREE.Object3D();
  for (let i = 0; i < keys.length; i += 1) {
    const [, yRaw] = keys[i].split(',');
    const y = Number(yRaw) || 0;
    helper.position.set(0.25, (y + 0.5) * resolution, 0.25);
    helper.scale.set(1, 1, 1);
    helper.updateMatrix();
    mesh.setMatrixAt(i, helper.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    keyToIndex: new Map(keys.map((key, i) => [key, i])),
    baseIndexToKey: [...keys],
    baseIndexToColor: keys.map(() => new THREE.Color(0xffffff)),
    indexToKey: [...keys],
    origin: new THREE.Vector3(0, 0, 0),
    resolution,
    occupiedKeys: new Set(keys),
    occupiedCounts: new Map(keys.map((key) => [key, 1])),
    activeCount: keys.length
  };
}

describe('voxel auto rig runtime', () => {
  test('auto-rigs voxels, updates matrices procedurally, and switches collision modes', () => {
    const setVoxelCollisionData = vi.fn();
    const setDynamicColliders = vi.fn();
    const clearDynamicColliders = vi.fn();
    const context = {
      sparkModule: {},
      setStatus: vi.fn(),
      setVoxelCollisionData,
      setDynamicColliders,
      clearDynamicColliders
    };

    const runtime = new VoxelAutoRigRuntime({ context, owner: 'test-owner' });
    const voxelData = createVoxelData();
    runtime.bind({
      voxelData,
      splatMesh: null,
      deformEnabled: false,
      collisionMode: 'static'
    });

    expect(runtime.clipNames.length).toBeGreaterThanOrEqual(3);
    expect(runtime.playClip(1)).toBe(true);
    expect(runtime.playClip(99)).toBe(false);
    expect(runtime.boneCount).toBeGreaterThanOrEqual(4);
    expect(setVoxelCollisionData).toHaveBeenCalledWith(voxelData);

    runtime.setWalkSettings({
      cycleDuration: 1.4,
      strideDegrees: 30,
      swayDegrees: 12,
      yawDegrees: 8,
      torsoTwistDegrees: 10,
      headNodDegrees: 6,
      bounceAmount: 0.2,
      gaitSharpness: 0.65,
      phaseOffset: 0.1,
      mirror: true
    });
    const stateWithCustomWalk = runtime.getAnimationState();
    expect(stateWithCustomWalk.walkSettings.cycleDuration).toBeCloseTo(1.4, 4);
    expect(stateWithCustomWalk.walkSettings.strideDegrees).toBeCloseTo(30, 4);
    expect(stateWithCustomWalk.walkSettings.mirror).toBe(true);

    runtime.setPlaybackPhase(0.25);
    runtime.setPlaying(false);
    runtime.update(0);
    expect(runtime.getPlaybackPhase()).toBeGreaterThan(0);

    const beforeMatrix = new THREE.Matrix4();
    voxelData.mesh.getMatrixAt(6, beforeMatrix);
    const beforePosition = new THREE.Vector3().setFromMatrixPosition(beforeMatrix);

    runtime.setSpeed(1);
    runtime.setPlaying(true);
    runtime.update(1 / 30);

    const afterMatrix = new THREE.Matrix4();
    voxelData.mesh.getMatrixAt(6, afterMatrix);
    const afterPosition = new THREE.Vector3().setFromMatrixPosition(afterMatrix);
    expect(afterPosition.distanceTo(beforePosition)).toBeGreaterThan(1e-4);

    runtime.setCollisionMode('bone');
    runtime.update(1 / 30);
    expect(setVoxelCollisionData).toHaveBeenCalledWith(null);
    expect(setDynamicColliders).toHaveBeenCalled();

    runtime.setCollisionMode('off');
    expect(clearDynamicColliders).toHaveBeenCalledWith('test-owner');

    runtime.setVisible(false);
    runtime.setBonesVisible(true);
    expect(runtime.mesh?.visible).toBe(false);
    expect(runtime.root?.visible).toBe(true);

    expect(runtime.regenerateRig(null)).toBe(true);
    expect(runtime.boneCount).toBeGreaterThanOrEqual(4);
    expect(runtime.resetWalkSettings().cycleDuration).toBeGreaterThan(0.2);

    runtime.dispose();
    expect(clearDynamicColliders).toHaveBeenCalledWith('test-owner');
  });
});
