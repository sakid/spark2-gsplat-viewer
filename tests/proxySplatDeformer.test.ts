import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { ProxySplatDeformer } from '../src/js/internal/proxySplatDeformer';

class MockSkinning {
  skinTexture = { needsUpdate: false };
  constructor(options = {}) {
    this.boneUpdates = 0;
    this.splatBones = 0;
    this.updated = 0;
    this.rest = 0;
    this.numSplats = Number(options?.mesh?.numSplats ?? -1);
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
  mesh.splatCount = 3;
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

  test('normalizes splat counts from packed splats before binding skinning', () => {
    const deformer = new ProxySplatDeformer();
    const sparkModule = { NewSplatAccumulator: { prototype: { __sparkCovOnlyPatchApplied: true } }, SplatSkinning: MockSkinning, SplatSkinningMode: { LINEAR_BLEND: 'linear_blend' } };
    const splatMesh = createSplatMesh();
    splatMesh.numSplats = 0;
    splatMesh.splatCount = 0;
    splatMesh.packedSplats = { numSplats: 3 };
    const bone = new THREE.Bone();
    bone.updateMatrixWorld(true);

    const bound = deformer.bind({ sparkModule, splatMesh, bones: [bone] });

    expect(bound.mode).toBe('skinned');
    expect(splatMesh.numSplats).toBe(3);
    expect(splatMesh.splatCount).toBe(3);
    expect(deformer.skinning.numSplats).toBe(3);
    expect(deformer.skinning.splatBones).toBe(3);
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

  test('binds cached skinning arrays without walking mesh splats', () => {
    const deformer = new ProxySplatDeformer();
    const sparkModule = { NewSplatAccumulator: { prototype: { __sparkCovOnlyPatchApplied: true } }, SplatSkinning: MockSkinning, SplatSkinningMode: { LINEAR_BLEND: 'linear_blend' } };
    const splatMesh = createSplatMesh();
    splatMesh.forEachSplat = vi.fn(() => {
      throw new Error('forEachSplat should not run for cached bindings');
    });
    const bone = new THREE.Bone();
    bone.updateMatrixWorld(true);

    const bound = deformer.bind({
      sparkModule,
      splatMesh,
      bones: [bone],
      precomputedBindings: {
        indices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
      }
    });

    expect(bound.mode).toBe('skinned');
    expect(splatMesh.forEachSplat).not.toHaveBeenCalled();
    expect(deformer.skinning.splatBones).toBe(3);
  });
});
