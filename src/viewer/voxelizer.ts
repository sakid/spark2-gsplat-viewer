import * as THREE from 'three';
import type { SplatMeshLike } from '../spark/previewAdapter';

export interface VoxelizerOptions {
    resolution?: number;
    densityThreshold?: number;
    minOpacity?: number;
    onProgress?: (progress: number, status?: string) => void;
}

export interface VoxelData {
    /** The InstancedMesh used for rendering and collision */
    mesh: THREE.InstancedMesh;
    /** Maps grid hash key → instance index */
    keyToIndex: Map<string, number>;
    /** Immutable original grid key for each instance index */
    baseIndexToKey: string[];
    /** Immutable base color (nearest splat color) for each instance index */
    baseIndexToColor: THREE.Color[];
    /** Mutable current grid key for each instance index */
    indexToKey: string[];
    /** World-space origin of the voxel grid */
    origin: THREE.Vector3;
    /** The voxel resolution used during generation */
    resolution: number;
    /** Sparse occupancy set for current live voxels */
    occupiedKeys: Set<string>;
    /** Counted occupancy used to keep occupiedKeys correct during overlapping moves */
    occupiedCounts: Map<string, number>;
    /** Total number of active (non-deleted) voxels */
    activeCount: number;
}

const DEFAULT_OPTIONS = {
    resolution: 0.5,
    densityThreshold: 5,
    minOpacity: 0.1
};

const DEFAULT_COLOR = new THREE.Color(0x00ff00);
const SELECTED_COLOR = new THREE.Color(0xff8800);

interface VoxelCellStats {
    count: number;
    nearestDistSq: number;
    nearestColor: THREE.Color;
}

function incrementOccupancy(data: VoxelData, key: string): void {
    const next = (data.occupiedCounts.get(key) ?? 0) + 1;
    data.occupiedCounts.set(key, next);
    data.occupiedKeys.add(key);
}

function decrementOccupancy(data: VoxelData, key: string): void {
    const current = data.occupiedCounts.get(key) ?? 0;
    if (current <= 1) {
        data.occupiedCounts.delete(key);
        data.occupiedKeys.delete(key);
        return;
    }

    data.occupiedCounts.set(key, current - 1);
}

/**
 * Convert a grid coordinate to a hash key
 */
export function voxelHash(ix: number, iy: number, iz: number): string {
    return `${ix},${iy},${iz}`;
}

/**
 * Convert a hash key back to grid coordinates
 */
export function voxelUnhash(key: string): [number, number, number] {
    const parts = key.split(',');
    return [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10)];
}

/**
 * Get the world-space center of a voxel from its grid key
 */
export function voxelCenter(
    key: string,
    resolution: number,
    origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): THREE.Vector3 {
    const [ix, iy, iz] = voxelUnhash(key);
    return new THREE.Vector3(
        origin.x + (ix + 0.5) * resolution,
        origin.y + (iy + 0.5) * resolution,
        origin.z + (iz + 0.5) * resolution
    );
}

/**
 * Generate a voxel grid as an InstancedMesh from a splat scene.
 * Each voxel is an individual instance that can be selected, deleted, or moved.
 */
export async function generateVoxelMesh(
    mesh: SplatMeshLike,
    options: VoxelizerOptions = {}
): Promise<VoxelData | null> {
    const { resolution, densityThreshold, minOpacity, onProgress } = { ...DEFAULT_OPTIONS, ...options };

    if (typeof mesh.forEachSplat !== 'function') {
        throw new Error('Provided splat mesh does not support forEachSplat iteration');
    }

    onProgress?.(0, 'Scanning splats...');

    // Ensure the mesh's world matrix is up-to-date (accounts for flip, rotation, scale)
    mesh.updateMatrixWorld(true);
    const worldMatrix = mesh.matrixWorld;
    const transformedCenter = new THREE.Vector3();

    // 1. Grid counting
    const grid = new Map<string, VoxelCellStats>();

    mesh.forEachSplat((index, center, scales, quaternion, opacity, color) => {
        if (opacity < minOpacity) {
            return;
        }

        transformedCenter.copy(center).applyMatrix4(worldMatrix);

        const ix = Math.floor(transformedCenter.x / resolution);
        const iy = Math.floor(transformedCenter.y / resolution);
        const iz = Math.floor(transformedCenter.z / resolution);

        const hash = voxelHash(ix, iy, iz);
        const voxelCenterX = (ix + 0.5) * resolution;
        const voxelCenterY = (iy + 0.5) * resolution;
        const voxelCenterZ = (iz + 0.5) * resolution;
        const dx = transformedCenter.x - voxelCenterX;
        const dy = transformedCenter.y - voxelCenterY;
        const dz = transformedCenter.z - voxelCenterZ;
        const distSq = dx * dx + dy * dy + dz * dz;
        const cell = grid.get(hash);
        if (!cell) {
            grid.set(hash, {
                count: 1,
                nearestDistSq: distSq,
                nearestColor: color.clone()
            });
            return;
        }
        cell.count += 1;
        if (distSq < cell.nearestDistSq) {
            cell.nearestDistSq = distSq;
            cell.nearestColor.copy(color);
        }
    });

    onProgress?.(0.4, 'Filtering solid voxels...');

    // 2. Identify solid voxels
    const solidKeys: string[] = [];
    for (const [hash, stats] of grid.entries()) {
        if (stats.count >= densityThreshold) {
            solidKeys.push(hash);
        }
    }

    if (solidKeys.length === 0) {
        return null;
    }

    onProgress?.(0.6, 'Building instanced mesh...');

    // 3. Create InstancedMesh
    const boxGeom = new THREE.BoxGeometry(resolution, resolution, resolution);
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        side: THREE.DoubleSide
    });

    const instancedMesh = new THREE.InstancedMesh(boxGeom, material, solidKeys.length);
    instancedMesh.name = 'AutoGeneratedVoxelCollider';
    instancedMesh.frustumCulled = false;
    instancedMesh.renderOrder = 999;
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const keyToIndex = new Map<string, number>();
    const baseIndexToKey: string[] = [];
    const baseIndexToColor: THREE.Color[] = [];
    const indexToKey: string[] = [];
    const occupiedKeys = new Set<string>();
    const occupiedCounts = new Map<string, number>();
    const origin = new THREE.Vector3(0, 0, 0);
    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    for (let i = 0; i < solidKeys.length; i++) {
        const key = solidKeys[i];
        const center = voxelCenter(key, resolution, origin);

        dummy.position.copy(center);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();

        instancedMesh.setMatrixAt(i, dummy.matrix);
        const cellStats = grid.get(key);
        instancedMesh.setColorAt(i, tempColor.copy(cellStats?.nearestColor ?? DEFAULT_COLOR));

        keyToIndex.set(key, i);
        baseIndexToKey.push(key);
        baseIndexToColor.push((cellStats?.nearestColor ?? DEFAULT_COLOR).clone());
        indexToKey.push(key);
        occupiedKeys.add(key);
        occupiedCounts.set(key, 1);

        if (i % 1000 === 0 && onProgress) {
            onProgress(0.6 + 0.35 * (i / solidKeys.length), 'Building instanced mesh...');
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
    }

    onProgress?.(1.0, 'Voxel generation complete');

    return {
        mesh: instancedMesh,
        keyToIndex,
        baseIndexToKey,
        baseIndexToColor,
        indexToKey,
        origin,
        resolution,
        occupiedKeys,
        occupiedCounts,
        activeCount: solidKeys.length
    };
}

/**
 * Highlight or un-highlight voxel instances by changing their color.
 */
export function setVoxelSelected(data: VoxelData, instanceIndex: number, selected: boolean): void {
    const color = selected ? SELECTED_COLOR : (data.baseIndexToColor[instanceIndex] ?? DEFAULT_COLOR);
    data.mesh.setColorAt(instanceIndex, color);
    if (data.mesh.instanceColor) {
        data.mesh.instanceColor.needsUpdate = true;
    }
}

/**
 * "Delete" a voxel by scaling it to zero (making it invisible and non-collidable).
 * Returns the grid key of the deleted voxel.
 */
export function deleteVoxelInstance(data: VoxelData, instanceIndex: number): string | null {
    if (instanceIndex < 0 || instanceIndex >= data.indexToKey.length) {
        return null;
    }

    const key = data.indexToKey[instanceIndex];
    decrementOccupancy(data, key);

    const dummy = new THREE.Object3D();
    dummy.position.set(0, 0, 0);
    dummy.scale.set(0, 0, 0); // Scale to zero = invisible
    dummy.updateMatrix();
    data.mesh.setMatrixAt(instanceIndex, dummy.matrix);
    data.mesh.instanceMatrix.needsUpdate = true;

    data.activeCount--;
    return key;
}

/**
 * Restore a deleted voxel to its original position and scale.
 */
export function restoreVoxelInstance(data: VoxelData, instanceIndex: number, key?: string): void {
    const resolvedKey = key ?? data.baseIndexToKey[instanceIndex];
    data.indexToKey[instanceIndex] = resolvedKey;
    const center = voxelCenter(resolvedKey, data.resolution, data.origin);

    const dummy = new THREE.Object3D();
    dummy.position.copy(center);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();

    data.mesh.setMatrixAt(instanceIndex, dummy.matrix);
    data.mesh.setColorAt(instanceIndex, data.baseIndexToColor[instanceIndex] ?? DEFAULT_COLOR);
    data.mesh.instanceMatrix.needsUpdate = true;
    if (data.mesh.instanceColor) {
        data.mesh.instanceColor.needsUpdate = true;
    }

    incrementOccupancy(data, resolvedKey);
    data.activeCount++;
}

/**
 * Move a voxel instance by a delta offset.
 */
export function moveVoxelInstance(data: VoxelData, instanceIndex: number, delta: THREE.Vector3): void {
    const previousKey = data.indexToKey[instanceIndex];
    decrementOccupancy(data, previousKey);

    const matrix = new THREE.Matrix4();
    data.mesh.getMatrixAt(instanceIndex, matrix);

    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(matrix);
    pos.add(delta);

    const dummy = new THREE.Object3D();
    dummy.position.copy(pos);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();

    data.mesh.setMatrixAt(instanceIndex, dummy.matrix);
    data.mesh.instanceMatrix.needsUpdate = true;

    const ix = Math.floor((pos.x - data.origin.x) / data.resolution);
    const iy = Math.floor((pos.y - data.origin.y) / data.resolution);
    const iz = Math.floor((pos.z - data.origin.z) / data.resolution);
    const nextKey = voxelHash(ix, iy, iz);
    data.indexToKey[instanceIndex] = nextKey;
    incrementOccupancy(data, nextKey);
}
