import { describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { generateVoxelMesh, type VoxelData } from '../src/viewer/voxelizer';
import type { SplatMeshLike } from '../src/spark/previewAdapter';

function createMockSplatMesh(
    splats: Array<{ center: [number, number, number]; opacity: number; color?: [number, number, number] }>
): SplatMeshLike {
    const mesh = new THREE.Object3D() as SplatMeshLike;

    mesh.forEachSplat = (callback) => {
        const centerVec = new THREE.Vector3();
        const scales = new THREE.Vector3(0.01, 0.01, 0.01);
        const quat = new THREE.Quaternion();
        const color = new THREE.Color();

        for (let i = 0; i < splats.length; i++) {
            centerVec.set(splats[i].center[0], splats[i].center[1], splats[i].center[2]);
            const [r, g, b] = splats[i].color ?? [1, 1, 1];
            color.setRGB(r, g, b);
            callback(i, centerVec, scales, quat, splats[i].opacity, color);
        }
    };

    return mesh;
}

describe('voxelizer', () => {
    test('returns null when no splats meet the density threshold', async () => {
        const mesh = createMockSplatMesh([
            { center: [0, 0, 0], opacity: 1 },
            { center: [5, 5, 5], opacity: 1 }
        ]);

        const result = await generateVoxelMesh(mesh, {
            resolution: 0.5,
            densityThreshold: 5
        });

        expect(result).toBeNull();
    });

    test('generates VoxelData with InstancedMesh when enough splats cluster', async () => {
        const splats = [];
        for (let i = 0; i < 10; i++) {
            splats.push({ center: [0.1 * i, 0.1, 0.1] as [number, number, number], opacity: 1 });
        }

        const mesh = createMockSplatMesh(splats);
        const result = await generateVoxelMesh(mesh, {
            resolution: 1.0,
            densityThreshold: 5
        });

        expect(result).not.toBeNull();
        const data = result as VoxelData;

        expect(data.mesh).toBeInstanceOf(THREE.InstancedMesh);
        expect(data.keyToIndex.size).toBeGreaterThan(0);
        expect(data.indexToKey.length).toBeGreaterThan(0);
        expect(data.activeCount).toBeGreaterThan(0);
        expect(data.resolution).toBe(1.0);
    });

    test('filters out splats with low opacity', async () => {
        const splats = [];
        for (let i = 0; i < 10; i++) {
            splats.push({ center: [0.1, 0.1, 0.1] as [number, number, number], opacity: 0.01 });
        }

        const mesh = createMockSplatMesh(splats);
        const result = await generateVoxelMesh(mesh, {
            resolution: 1.0,
            densityThreshold: 5,
            minOpacity: 0.1
        });

        expect(result).toBeNull();
    });

    test('generates exactly 1 instance for a single solid voxel', async () => {
        const splats = [];
        for (let i = 0; i < 10; i++) {
            splats.push({ center: [0.25, 0.25, 0.25] as [number, number, number], opacity: 1 });
        }

        const mesh = createMockSplatMesh(splats);
        const result = await generateVoxelMesh(mesh, {
            resolution: 1.0,
            densityThreshold: 5
        });

        expect(result).not.toBeNull();
        const data = result as VoxelData;

        // Single voxel = 1 instance
        expect(data.activeCount).toBe(1);
        expect(data.keyToIndex.size).toBe(1);
        expect(data.mesh.count).toBe(1);
    });

    test('calls onProgress callback', async () => {
        const splats = [];
        for (let i = 0; i < 10; i++) {
            splats.push({ center: [0.1, 0.1, 0.1] as [number, number, number], opacity: 1 });
        }

        const progressCalls: Array<{ progress: number; status?: string }> = [];
        const mesh = createMockSplatMesh(splats);

        await generateVoxelMesh(mesh, {
            resolution: 1.0,
            densityThreshold: 5,
            onProgress: (progress, status) => {
                progressCalls.push({ progress, status });
            }
        });

        expect(progressCalls.length).toBeGreaterThan(0);
        expect(progressCalls[0].progress).toBe(0);
        expect(progressCalls[progressCalls.length - 1].progress).toBe(1.0);
    });

    test('colors voxels by nearest splat color within each voxel cell', async () => {
        const mesh = createMockSplatMesh([
            { center: [0.49, 0.49, 0.49], opacity: 1, color: [1, 0, 0] },
            { center: [0.05, 0.05, 0.05], opacity: 1, color: [0, 0, 1] }
        ]);

        const result = await generateVoxelMesh(mesh, {
            resolution: 1.0,
            densityThreshold: 2
        });

        expect(result).not.toBeNull();
        const data = result as VoxelData;
        const color = new THREE.Color();
        data.mesh.getColorAt(0, color);
        expect(color.r).toBeCloseTo(1, 5);
        expect(color.g).toBeCloseTo(0, 5);
        expect(color.b).toBeCloseTo(0, 5);
    });

    test('throws when forEachSplat is not available', async () => {
        const mesh = new THREE.Object3D() as SplatMeshLike;
        await expect(generateVoxelMesh(mesh)).rejects.toThrow('forEachSplat');
    });
});
