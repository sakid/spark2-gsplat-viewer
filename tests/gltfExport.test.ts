import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { createExportableVoxelMesh } from '../src/export/gltfExport';
import type { VoxelData } from '../src/viewer/voxelizer';

function createVoxelData(count = 4): VoxelData {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
  const dummy = new THREE.Object3D();
  const keyToIndex = new Map<string, number>();
  const baseIndexToKey: string[] = [];
  const baseIndexToColor: THREE.Color[] = [];
  const indexToKey: string[] = [];
  const occupiedKeys = new Set<string>();
  const occupiedCounts = new Map<string, number>();
  for (let i = 0; i < count; i += 1) {
    dummy.position.set(i * 1.1, 0, 0);
    if (i === count - 1) dummy.scale.set(0, 0, 0);
    else dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const color = new THREE.Color().setRGB(i / count, 0.5, 1 - i / count);
    mesh.setColorAt(i, color);
    const key = `${i},0,0`;
    keyToIndex.set(key, i);
    baseIndexToKey.push(key);
    baseIndexToColor.push(color.clone());
    indexToKey.push(key);
    occupiedKeys.add(key);
    occupiedCounts.set(key, 1);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { mesh, keyToIndex, baseIndexToKey, baseIndexToColor, indexToKey, origin: new THREE.Vector3(), resolution: 1, occupiedKeys, occupiedCounts, activeCount: count - 1 };
}

describe('gltf export', () => {
  test('merges active voxel instances into a single mesh group', () => {
    const voxelData = createVoxelData(5);
    const exportGroup = createExportableVoxelMesh(voxelData);
    expect(exportGroup.children.length).toBe(1);
    expect(exportGroup.userData.activeVoxelCount).toBe(4);
    const mesh = exportGroup.children[0];
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const geometry = mesh instanceof THREE.Mesh ? mesh.geometry : null;
    expect(geometry?.getAttribute('position').count).toBeGreaterThan(0);
    expect(geometry?.getAttribute('color').count).toBeGreaterThan(0);
    const colorAttr = geometry?.getAttribute('color');
    expect(colorAttr?.getX(0)).toBeCloseTo(0, 5);
    expect(colorAttr?.getY(0)).toBeCloseTo(0.5, 5);
    expect(colorAttr?.getZ(0)).toBeCloseTo(1, 5);
  });
});
