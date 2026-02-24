import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { bindSplatToBones } from '../src/js/proxy/skinBinding';

describe('skin binding', () => {
  test('binds each splat to nearest bones', () => {
    const root = new THREE.Bone();
    const left = new THREE.Bone();
    const right = new THREE.Bone();
    left.position.set(1, 0, 0);
    right.position.set(-1, 0, 0);
    root.add(left, right);
    root.updateMatrixWorld(true);

    const calls: Array<{ index: number; indices: THREE.Vector4; weights: THREE.Vector4 }> = [];
    const skinning = {
      setSplatBones: (index: number, indices: THREE.Vector4, weights: THREE.Vector4) => {
        calls.push({ index, indices, weights });
      }
    };

    const centers = [new THREE.Vector3(1.1, 0, 0), new THREE.Vector3(-1.2, 0, 0)];
    const splatMesh = new THREE.Object3D() as any;
    splatMesh.forEachSplat = (cb: any) => {
      centers.forEach((center, index) => cb(index, center));
    };

    const count = bindSplatToBones({ splatMesh, skinning, bones: [root, left, right] });
    expect(count).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].weights.x + calls[0].weights.y + calls[0].weights.z + calls[0].weights.w).toBeCloseTo(1, 5);
    expect(calls[1].weights.x + calls[1].weights.y + calls[1].weights.z + calls[1].weights.w).toBeCloseTo(1, 5);
  });

  test('returns zero when mesh cannot iterate splats', () => {
    const count = bindSplatToBones({ splatMesh: {} as any, skinning: { setSplatBones: vi.fn() } as any, bones: [] });
    expect(count).toBe(0);
  });

  test('writes up to four bone influences per splat', () => {
    const bones = [-2, -1, 1, 2, 4].map((x) => {
      const bone = new THREE.Bone();
      bone.position.set(x, 0, 0);
      bone.updateMatrixWorld(true);
      return bone;
    });

    const calls: Array<{ indices: THREE.Vector4; weights: THREE.Vector4 }> = [];
    const skinning = { setSplatBones: (_: number, indices: THREE.Vector4, weights: THREE.Vector4) => calls.push({ indices, weights }) };
    const splatMesh = new THREE.Object3D() as any;
    splatMesh.forEachSplat = (cb: any) => cb(0, new THREE.Vector3(0, 0, 0));

    bindSplatToBones({ splatMesh, skinning, bones });
    const w = calls[0].weights;
    expect(w.x + w.y + w.z + w.w).toBeCloseTo(1, 5);
    expect(w.z > 0 || w.w > 0).toBe(true);
  });
});
