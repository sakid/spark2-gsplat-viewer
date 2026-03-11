import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import {
  buildSplatSubsetMeshFromVoxelKeys,
  collectSplatIndicesForVoxelKeys
} from '../src/js/internal/splatSubset';
import { selectPrimaryActorSplatCellKeys } from '../src/js/internal/splatActorSelection';

function createSourceMesh({
  splats,
  matrixWorld = new THREE.Matrix4(),
  packedSplats = null,
  extSplats = null
}: {
  splats: Array<{ center: THREE.Vector3; opacity?: number; color?: THREE.Color }>;
  matrixWorld?: THREE.Matrix4;
  packedSplats?: Record<string, unknown> | null;
  extSplats?: Record<string, unknown> | null;
}) {
  return {
    editable: true,
    raycastable: true,
    covSplats: false,
    maxSh: 3,
    extSplats,
    packedSplats,
    matrixWorld,
    updateMatrixWorld() {},
    forEachSplat(callback: (index: number, center: THREE.Vector3, scales: THREE.Vector3, quaternion: THREE.Quaternion, opacity: number, color: THREE.Color) => void) {
      for (let index = 0; index < splats.length; index += 1) {
        const splat = splats[index];
        callback(
          index,
          splat.center,
          new THREE.Vector3(1, 1, 1),
          new THREE.Quaternion(),
          splat.opacity ?? 1,
          splat.color ?? new THREE.Color(1, 1, 1)
        );
      }
    }
  };
}

describe('splatSubset', () => {
  test('builds a push-based subset mesh using voxel-key membership in world space', async () => {
    class PushSplatMesh {
      options: Record<string, unknown>;
      pushed: Array<{ center: THREE.Vector3; opacity: number }>;
      initialized: Promise<this>;
      numSplats = 0;
      splatCount = 0;

      constructor(options: Record<string, unknown>) {
        this.options = options;
        this.pushed = [];
        this.initialized = Promise.resolve(this);
      }

      pushSplat(
        center: THREE.Vector3,
        _scales: THREE.Vector3,
        _quaternion: THREE.Quaternion,
        opacity: number
      ) {
        this.pushed.push({ center: center.clone(), opacity });
      }
    }

    const sourceMesh = createSourceMesh({
      matrixWorld: new THREE.Matrix4().makeTranslation(1, 2, 3),
      splats: [
        { center: new THREE.Vector3(0.25, 0.25, 0.25) },
        { center: new THREE.Vector3(0.75, 0.25, 0.25) },
        { center: new THREE.Vector3(1.25, 0.75, 0.25) }
      ]
    });

    const result = await buildSplatSubsetMeshFromVoxelKeys({
      sourceMesh,
      sparkModule: {
        SplatMesh: PushSplatMesh
      },
      selectedKeys: new Set(['0,0,0', '2,1,0']),
      voxelData: {
        resolution: 0.5,
        origin: { x: 1, y: 2, z: 3 }
      },
      overlapScale: 0
    });

    expect(result.method).toBe('push');
    expect(result.splatCount).toBe(2);
    expect(result.mesh).toBeInstanceOf(PushSplatMesh);
    expect((result.mesh as unknown as PushSplatMesh).numSplats).toBe(2);
    expect((result.mesh as unknown as PushSplatMesh).splatCount).toBe(2);
    expect((result.mesh as unknown as PushSplatMesh).options.lod).toBe(false);
    expect((result.mesh as unknown as PushSplatMesh).options.nonLod).toBe(true);
    expect((result.mesh as unknown as PushSplatMesh).pushed.map((entry) => entry.center.toArray())).toEqual([
      [0.25, 0.25, 0.25],
      [1.25, 0.75, 0.25]
    ]);
  });

  test('preserves packed splat buffers and SH extras when subsetting', async () => {
    class PackedSplats {
      packedArray: Uint32Array;
      numSplats: number;
      extra: Record<string, unknown>;
      splatEncoding: Record<string, unknown> | undefined;
      maxSh = 0;
      initialized: Promise<this>;

      constructor(options: Record<string, unknown>) {
        this.packedArray = options.packedArray as Uint32Array;
        this.numSplats = options.numSplats as number;
        this.extra = (options.extra as Record<string, unknown>) ?? {};
        this.splatEncoding = options.splatEncoding as Record<string, unknown> | undefined;
        this.initialized = Promise.resolve(this);
      }
    }

    class PackedSplatMesh {
      options: Record<string, unknown>;
      packedSplats: PackedSplats | null;
      initialized: Promise<this>;
      numSplats = 0;
      splatCount = 0;

      constructor(options: Record<string, unknown>) {
        this.options = options;
        this.packedSplats = (options.packedSplats as PackedSplats) ?? null;
        this.initialized = Promise.resolve(this);
      }
    }

    const sourceMesh = createSourceMesh({
      splats: [
        { center: new THREE.Vector3(0.25, 0.25, 0.25) },
        { center: new THREE.Vector3(1.25, 0.25, 0.25) },
        { center: new THREE.Vector3(2.25, 0.25, 0.25) }
      ],
      packedSplats: {
        packedArray: new Uint32Array([
          10, 11, 12, 13,
          20, 21, 22, 23,
          30, 31, 32, 33
        ]),
        extra: {
          sh1: new Uint32Array([101, 102, 201, 202, 301, 302]),
          sh2: new Uint32Array([
            1001, 1002, 1003, 1004,
            2001, 2002, 2003, 2004,
            3001, 3002, 3003, 3004
          ])
        },
        splatEncoding: { rgbMin: 0, rgbMax: 1 },
        maxSh: 2
      }
    });

    const result = await buildSplatSubsetMeshFromVoxelKeys({
      sourceMesh,
      sparkModule: {
        PackedSplats,
        SplatMesh: PackedSplatMesh
      },
      selectedKeys: new Set(['0,0,0', '2,0,0']),
      voxelData: {
        resolution: 1,
        origin: { x: 0, y: 0, z: 0 }
      },
      overlapScale: 0
    });

    const subset = (result.mesh as unknown as PackedSplatMesh).packedSplats;
    expect(result.method).toBe('packed-array');
    expect(result.splatCount).toBe(2);
    expect((result.mesh as unknown as PackedSplatMesh).numSplats).toBe(2);
    expect((result.mesh as unknown as PackedSplatMesh).splatCount).toBe(2);
    expect(subset?.numSplats).toBe(2);
    expect(Array.from(subset?.packedArray.slice(0, 8) ?? [])).toEqual([10, 11, 12, 13, 30, 31, 32, 33]);
    expect(Array.from((subset?.extra.sh1 as Uint32Array).slice(0, 4))).toEqual([101, 102, 301, 302]);
    expect(Array.from((subset?.extra.sh2 as Uint32Array).slice(0, 8))).toEqual([
      1001, 1002, 1003, 1004,
      3001, 3002, 3003, 3004
    ]);
    expect(subset?.packedArray.length).toBe(2048 * 4);
  });

  test('includes splats whose support overlaps selected voxels even when centers fall outside', () => {
    const sourceMesh = createSourceMesh({
      splats: [
        { center: new THREE.Vector3(0.72, 0.25, 0.25) },
        { center: new THREE.Vector3(1.6, 0.25, 0.25) }
      ]
    });

    const indices = collectSplatIndicesForVoxelKeys({
      sourceMesh,
      selectedKeys: new Set(['0,0,0']),
      voxelData: {
        resolution: 0.5,
        origin: { x: 0, y: 0, z: 0 }
      },
      overlapScale: 0.25,
      maxVoxelRadius: 1
    });

    expect(indices).toEqual([0]);
  });

  test('selects the actor-like center-cell cluster over a flat floor cluster', () => {
    const cellMap = new Map([
      ['0,0,0', [0]],
      ['0,1,0', [1]],
      ['0,2,0', [2]],
      ['3,0,0', [3]],
      ['4,0,0', [4]],
      ['5,0,0', [5]],
      ['6,0,0', [6]]
    ]);

    const selection = selectPrimaryActorSplatCellKeys(cellMap, {
      resolution: 1,
      origin: { x: 0, y: 0, z: 0 }
    });

    expect(Array.from(selection.selectedKeys)).toEqual(['0,0,0', '0,1,0', '0,2,0']);
  });
});
