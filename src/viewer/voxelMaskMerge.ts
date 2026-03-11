import * as THREE from 'three';

interface VoxelIndex {
    x: number;
    y: number;
    z: number;
}

function voxelKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
}

function parseVoxelKey(raw: string): VoxelIndex | null {
    const [xRaw, yRaw, zRaw] = String(raw).split(',');
    const x = Number(xRaw);
    const y = Number(yRaw);
    const z = Number(zRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return {
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z)
    };
}

function hasAll(cells: Set<string>, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): boolean {
    for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                if (!cells.has(voxelKey(x, y, z))) {
                    return false;
                }
            }
        }
    }
    return true;
}

function removeAll(cells: Set<string>, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): void {
    for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                cells.delete(voxelKey(x, y, z));
            }
        }
    }
}

/**
 * Greedily merge contiguous voxel keys into larger axis-aligned boxes.
 */
export function mergeVoxelKeysToBoxes(
    keys: Iterable<string>,
    resolution: number,
    origin: THREE.Vector3
): THREE.Box3[] {
    const safeResolution = Math.max(1e-6, Number(resolution) || 1);
    const safeOrigin = origin instanceof THREE.Vector3 ? origin : new THREE.Vector3();

    const cells = new Set<string>();
    for (const raw of keys) {
        const parsed = parseVoxelKey(raw);
        if (!parsed) continue;
        cells.add(voxelKey(parsed.x, parsed.y, parsed.z));
    }

    const boxes: THREE.Box3[] = [];
    while (cells.size > 0) {
        const firstKey = cells.values().next().value as string;
        const seed = parseVoxelKey(firstKey);
        if (!seed) {
            cells.delete(firstKey);
            continue;
        }

        let minX = seed.x;
        let maxX = seed.x;
        let minY = seed.y;
        let maxY = seed.y;
        let minZ = seed.z;
        let maxZ = seed.z;

        while (cells.has(voxelKey(maxX + 1, seed.y, seed.z))) {
            maxX += 1;
        }

        while (hasAll(cells, minX, maxX, seed.y, seed.y, minZ, maxZ + 1)) {
            maxZ += 1;
        }

        while (hasAll(cells, minX, maxX, minY, maxY + 1, minZ, maxZ)) {
            maxY += 1;
        }

        removeAll(cells, minX, maxX, minY, maxY, minZ, maxZ);

        boxes.push(new THREE.Box3(
            new THREE.Vector3(
                safeOrigin.x + minX * safeResolution,
                safeOrigin.y + minY * safeResolution,
                safeOrigin.z + minZ * safeResolution
            ),
            new THREE.Vector3(
                safeOrigin.x + (maxX + 1) * safeResolution,
                safeOrigin.y + (maxY + 1) * safeResolution,
                safeOrigin.z + (maxZ + 1) * safeResolution
            )
        ));
    }

    return boxes;
}
