import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { colliderIntersectsSphere, disposeMeshBoundsTree, ensureMeshBoundsTree } from '../src/js/internal/bvh';

describe('bvh helpers', () => {
  test('builds and disposes bounds trees for mesh colliders', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    expect(ensureMeshBoundsTree(mesh)).toBe(true);
    expect(Boolean(mesh.geometry.boundsTree)).toBe(true);
    disposeMeshBoundsTree(mesh);
    expect(mesh.geometry.boundsTree).toBeNull();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  test('detects sphere collisions with mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    ensureMeshBoundsTree(mesh);
    mesh.updateMatrixWorld(true);

    const hit = colliderIntersectsSphere(mesh, new THREE.Vector3(0, 0, 0), 0.6);
    const miss = colliderIntersectsSphere(mesh, new THREE.Vector3(5, 0, 0), 0.2);

    expect(hit).toBe(true);
    expect(miss).toBe(false);

    disposeMeshBoundsTree(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  test('handles non-uniform mesh scale when testing sphere collisions', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.scale.set(2, 0.5, 1);
    ensureMeshBoundsTree(mesh);
    mesh.updateMatrixWorld(true);

    const hit = colliderIntersectsSphere(mesh, new THREE.Vector3(0, 0.5, 0), 0.3);
    expect(hit).toBe(true);

    disposeMeshBoundsTree(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
