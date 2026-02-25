import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { resolveCameraMovement } from '../src/js/internal/collisionResolver';

describe('collision resolver', () => {
  test('writes into out vector when provided', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const from = new THREE.Vector3(0, 1.2, 2);
    const to = new THREE.Vector3(0, 1.2, 0);
    const out = new THREE.Vector3(123, 456, 789);

    const resolved = resolveCameraMovement({
      from,
      to,
      out,
      colliders: [mesh],
      voxelData: null,
      radius: 0.22,
      height: 1.3
    });

    expect(resolved).toBe(out);
    expect(resolved.x).toBe(from.x);
    expect(resolved.z).toBe(from.z);

    mesh.material.dispose();
    mesh.geometry.dispose();
  });

  test('does not modify movement when no collision', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const from = new THREE.Vector3(0, 1.2, 2);
    const to = new THREE.Vector3(10, 1.2, 0);

    const resolved = resolveCameraMovement({
      from,
      to,
      colliders: [mesh],
      voxelData: null,
      radius: 0.22,
      height: 1.3
    });

    expect(resolved.x).toBe(to.x);
    expect(resolved.z).toBe(to.z);

    mesh.material.dispose();
    mesh.geometry.dispose();
  });

  test('blocks movement against dynamic colliders', () => {
    const from = new THREE.Vector3(0, 1.2, 2);
    const to = new THREE.Vector3(0, 1.2, 0);
    const dynamicColliders = [{ center: new THREE.Vector3(0, 0.55, 0), radius: 0.4 }];
    const resolved = resolveCameraMovement({
      from,
      to,
      colliders: [],
      dynamicColliders,
      voxelData: null,
      radius: 0.22,
      height: 1.3
    });
    expect(resolved.x).toBe(from.x);
    expect(resolved.z).toBe(from.z);
  });
});
