import * as THREE from 'three';
import {
    deleteVoxelInstance,
    moveVoxelInstance,
    restoreVoxelInstance,
    setVoxelSelected,
    voxelCenter,
    type VoxelData
} from './voxelizer';

export interface VoxelEditAction {
    type: 'delete' | 'move';
    /** Instance indices affected */
    indices: number[];
    /** For delete actions, keys removed at delete time */
    keys?: string[];
    /** For move actions, the displacement applied */
    delta?: THREE.Vector3;
}

export class VoxelEditState {
    private readonly selected = new Set<number>();
    private readonly deleted = new Set<string>(); // grid keys
    private readonly undoStack: VoxelEditAction[] = [];
    private data: VoxelData | null = null;

    /** Callbacks for external listeners */
    private onChangeCallbacks: Array<() => void> = [];

    setVoxelData(data: VoxelData | null): void {
        this.data = data;
        this.selected.clear();
        this.deleted.clear();
        this.undoStack.length = 0;
        this.notifyChange();
    }

    getVoxelData(): VoxelData | null {
        return this.data;
    }

    onChange(callback: () => void): () => void {
        this.onChangeCallbacks.push(callback);
        return () => {
            const index = this.onChangeCallbacks.indexOf(callback);
            if (index >= 0) {
                this.onChangeCallbacks.splice(index, 1);
            }
        };
    }

    private notifyChange(): void {
        for (const cb of this.onChangeCallbacks) {
            cb();
        }
    }

    // --- Selection ---

    toggleSelect(instanceIndex: number): void {
        if (!this.data) return;

        if (this.selected.has(instanceIndex)) {
            this.selected.delete(instanceIndex);
            setVoxelSelected(this.data, instanceIndex, false);
        } else {
            this.selected.add(instanceIndex);
            setVoxelSelected(this.data, instanceIndex, true);
        }
        this.notifyChange();
    }

    selectOnly(instanceIndex: number): void {
        if (!this.data) return;

        // Deselect all current
        for (const idx of this.selected) {
            setVoxelSelected(this.data, idx, false);
        }
        this.selected.clear();

        // Select just this one
        this.selected.add(instanceIndex);
        setVoxelSelected(this.data, instanceIndex, true);
        this.notifyChange();
    }

    clearSelection(): void {
        if (!this.data) return;
        for (const idx of this.selected) {
            setVoxelSelected(this.data, idx, false);
        }
        this.selected.clear();
        this.notifyChange();
    }

    getSelectedCount(): number {
        return this.selected.size;
    }

    getSelected(): ReadonlySet<number> {
        return this.selected;
    }

    setSelection(indices: Iterable<number>): void {
        if (!this.data) return;

        const next = new Set<number>();
        const upperBound = this.data.indexToKey.length;
        for (const index of indices) {
            if (!Number.isInteger(index)) continue;
            if (index < 0 || index >= upperBound) continue;
            next.add(index);
        }

        for (const index of this.selected) {
            if (!next.has(index)) {
                setVoxelSelected(this.data, index, false);
            }
        }
        for (const index of next) {
            if (!this.selected.has(index)) {
                setVoxelSelected(this.data, index, true);
            }
        }

        this.selected.clear();
        for (const index of next) this.selected.add(index);
        this.notifyChange();
    }

    addSelect(instanceIndex: number): void {
        if (!this.data) return;
        if (instanceIndex < 0 || instanceIndex >= this.data.indexToKey.length) return;
        if (this.selected.has(instanceIndex)) return;
        this.selected.add(instanceIndex);
        setVoxelSelected(this.data, instanceIndex, true);
        this.notifyChange();
    }

    // --- Delete ---

    deleteSelected(): string[] {
        if (!this.data || this.selected.size === 0) return [];

        const indices = [...this.selected];
        const deletedKeys: string[] = [];

        for (const idx of indices) {
            const key = deleteVoxelInstance(this.data, idx);
            if (key) {
                this.deleted.add(key);
                deletedKeys.push(key);
            }
        }

        this.undoStack.push({ type: 'delete', indices, keys: deletedKeys });
        this.selected.clear();
        this.notifyChange();
        return deletedKeys;
    }

    invertSelection(): void {
        if (!this.data) return;

        const next = new Set<number>();
        for (let i = 0; i < this.data.indexToKey.length; i += 1) {
            const key = this.data.indexToKey[i];
            if (!this.data.occupiedKeys.has(key)) continue;
            if (!this.selected.has(i)) next.add(i);
        }

        this.setSelection(next);
    }

    keepSelected(): string[] {
        if (!this.data || this.selected.size === 0) return [];

        const indicesToDelete: number[] = [];
        for (let i = 0; i < this.data.indexToKey.length; i += 1) {
            const key = this.data.indexToKey[i];
            if (!this.data.occupiedKeys.has(key)) continue;
            if (this.selected.has(i)) continue;
            indicesToDelete.push(i);
        }

        const deletedKeys: string[] = [];
        for (const index of indicesToDelete) {
            const key = deleteVoxelInstance(this.data, index);
            if (!key) continue;
            this.deleted.add(key);
            deletedKeys.push(key);
        }

        if (indicesToDelete.length > 0) {
            this.undoStack.push({ type: 'delete', indices: indicesToDelete, keys: deletedKeys });
        }
        this.notifyChange();
        return deletedKeys;
    }

    selectConnectedFrom(seedIndex: number): void {
        if (!this.data) return;
        if (!Number.isInteger(seedIndex) || seedIndex < 0 || seedIndex >= this.data.indexToKey.length) return;

        const seedKey = this.data.indexToKey[seedIndex];
        if (!this.data.occupiedKeys.has(seedKey)) return;

        const parse = (key: string): [number, number, number] => {
            const [x, y, z] = key.split(',');
            return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
        };

        const hash = (x: number, y: number, z: number): string => `${x},${y},${z}`;
        const visited = new Set<string>();
        const queue: string[] = [seedKey];
        const connectedIndices = new Set<number>();

        while (queue.length > 0) {
            const key = queue.pop() as string;
            if (visited.has(key)) continue;
            visited.add(key);
            if (!this.data.occupiedKeys.has(key)) continue;

            const index = this.data.keyToIndex.get(key);
            if (Number.isInteger(index)) connectedIndices.add(index as number);

            const [x, y, z] = parse(key);
            queue.push(
                hash(x + 1, y, z),
                hash(x - 1, y, z),
                hash(x, y + 1, z),
                hash(x, y - 1, z),
                hash(x, y, z + 1),
                hash(x, y, z - 1)
            );
        }

        this.setSelection(connectedIndices);
    }

    // --- Move ---

    moveSelected(delta: THREE.Vector3): void {
        if (!this.data || this.selected.size === 0) return;

        const step = this.data.resolution;
        const snappedDelta = new THREE.Vector3(
            Math.round(delta.x / step) * step,
            Math.round(delta.y / step) * step,
            Math.round(delta.z / step) * step
        );
        if (snappedDelta.lengthSq() === 0) {
            return;
        }

        const indices = [...this.selected];
        for (const idx of indices) {
            moveVoxelInstance(this.data, idx, snappedDelta);
        }

        this.undoStack.push({ type: 'move', indices, delta: snappedDelta.clone() });
        this.notifyChange();
    }

    // --- Undo ---

    undo(): boolean {
        if (!this.data || this.undoStack.length === 0) return false;

        const action = this.undoStack.pop()!;

        if (action.type === 'delete') {
            for (let i = 0; i < action.indices.length; i++) {
                const idx = action.indices[i];
                const actionKey = action.keys?.[i];
                restoreVoxelInstance(this.data, idx, actionKey);
                if (actionKey) {
                    this.deleted.delete(actionKey);
                }
            }
        } else if (action.type === 'move' && action.delta) {
            const reverseDelta = action.delta.clone().negate();
            for (const idx of action.indices) {
                moveVoxelInstance(this.data, idx, reverseDelta);
            }
        }

        this.notifyChange();
        return true;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    // --- Queries ---

    getDeletedKeys(): ReadonlySet<string> {
        return this.deleted;
    }

    /**
     * Get the world-space bounding boxes of all deleted voxel regions.
     * Used for splat masking.
     */
    getDeletedBoxes(): THREE.Box3[] {
        if (!this.data) return [];

        const halfRes = this.data.resolution / 2;
        const boxes: THREE.Box3[] = [];

        for (const key of this.deleted) {
            const center = voxelCenter(key, this.data.resolution, this.data.origin);
            const box = new THREE.Box3(
                new THREE.Vector3(center.x - halfRes, center.y - halfRes, center.z - halfRes),
                new THREE.Vector3(center.x + halfRes, center.y + halfRes, center.z + halfRes)
            );
            boxes.push(box);
        }

        return boxes;
    }

    /**
     * Get the bounding boxes and displacements of all moved voxel regions.
     * Used for splat displacement.
     */
    getMovedBoxes(): Array<{ box: THREE.Box3, delta: THREE.Vector3 }> {
        if (!this.data) return [];

        const halfRes = this.data.resolution / 2;
        const movedMap = new Map<string, THREE.Vector3>(); // key -> cumulative delta

        // Replay undo stack to find net displacement for each voxel
        for (const action of this.undoStack) {
            if (action.type === 'move' && action.delta) {
                for (const idx of action.indices) {
                    const key = this.data.baseIndexToKey[idx];
                    const currentDelta = movedMap.get(key) || new THREE.Vector3();
                    currentDelta.add(action.delta);
                    movedMap.set(key, currentDelta);
                }
            }
        }

        const result: Array<{ box: THREE.Box3, delta: THREE.Vector3 }> = [];

        for (const [key, delta] of movedMap.entries()) {
            // Only yield if there's a net displacement and it's not deleted
            if (delta.lengthSq() > 0.0001 && !this.deleted.has(key)) {
                // Return the original center box, plus the delta it should move by
                const center = voxelCenter(key, this.data.resolution, this.data.origin);
                const box = new THREE.Box3(
                    new THREE.Vector3(center.x - halfRes, center.y - halfRes, center.z - halfRes),
                    new THREE.Vector3(center.x + halfRes, center.y + halfRes, center.z + halfRes)
                );
                result.push({ box, delta: delta.clone() });
            }
        }

        return result;
    }
}
