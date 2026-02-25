import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { ProxySplatDeformer } from '../src/js/internal/proxySplatDeformer';

class MockSkinning {
  skinTexture = { needsUpdate: false };
  constructor() {
    this.boneUpdates = 0;
    this.splatBones = 0;
    this.updated = 0;
    this.rest = 0;
  }
  setSplatBones() { this.splatBones += 1; }
  setRestMatrix() { this.rest += 1; }
  setBoneMatrix() { this.boneUpdates += 1; }
  updateBones() { this.updated += 1; }
  dispose() {}
}

function createSplatMesh() {
  const mesh = new THREE.Object3D();
  mesh.matrixWorld.identity();
  mesh.numSplats = 3;
  mesh.forEachSplat = (callback) => {
    callback(0, new THREE.Vector3(0, 0, 0));
    callback(1, new THREE.Vector3(1, 0, 0));
    callback(2, new THREE.Vector3(2, 0, 0));
  };
  mesh.updateMatrixWorld = () => {};
  mesh.updateGenerator = () => {};
  mesh.needsUpdate = false;
  return mesh;
}

describe('proxy splat deformer', () => {
  test('binds and updates spark skinning', () => {
    const deformer = new ProxySplatDeformer();
    const sparkModule = { NewSplatAccumulator: { prototype: { __sparkCovOnlyPatchApplied: true } }, SplatSkinning: MockSkinning, SplatSkinningMode: { LINEAR_BLEND: 'linear_blend' } };
    const splatMesh = createSplatMesh();
    const bone = new THREE.Bone();
    bone.updateMatrixWorld(true);
    const bound = deformer.bind({ sparkModule, splatMesh, bones: [bone] });
    expect(bound.mode).toBe('skinned');
    deformer.update();
    expect(deformer.skinning.updated).toBe(1);
    deformer.dispose();
  });

  test('binds transform-only deformation with 1-bone skinning', () => {
    const deformer = new ProxySplatDeformer();
    const sparkModule = { NewSplatAccumulator: { prototype: { __sparkCovOnlyPatchApplied: true } }, SplatSkinning: MockSkinning, SplatSkinningMode: { LINEAR_BLEND: 'linear_blend' } };
    const splatMesh = createSplatMesh();
    const animatedRoot = new THREE.Object3D();
    animatedRoot.scale.set(1, 1, 2);
    animatedRoot.updateMatrixWorld(true);
    const bound = deformer.bind({ sparkModule, splatMesh, bones: [], animatedRoot });
    expect(bound.mode).toBe('transform');
    deformer.update();
    expect(deformer.skinning.updated).toBe(1);
  });
});
