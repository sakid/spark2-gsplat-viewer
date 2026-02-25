import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { createBoneColliderSet } from '../src/js/internal/boneColliders';

function createSkinnedMesh() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) weights[i * 4] = 1;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));

  const bone = new THREE.Bone();
  bone.name = 'RootBone';
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('bone colliders', () => {
  test('builds and updates collider centers from skeleton', () => {
    const skinned = createSkinnedMesh();
    const set = createBoneColliderSet(skinned);
    expect(set).toBeTruthy();
    const colliders = set?.update() ?? [];
    expect(colliders.length).toBe(1);
    expect(colliders[0].radius).toBeGreaterThan(0);
    expect(colliders[0].center.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-6);
  });
});
