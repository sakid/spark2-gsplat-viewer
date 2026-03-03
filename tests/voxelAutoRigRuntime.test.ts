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

    expect(runtime.clipNames).toEqual(['AutoRig Procedural']);
    expect(runtime.boneCount).toBeGreaterThanOrEqual(4);
    expect(setVoxelCollisionData).toHaveBeenCalledWith(voxelData);

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

    runtime.dispose();
    expect(clearDynamicColliders).toHaveBeenCalledWith('test-owner');
  });
});
