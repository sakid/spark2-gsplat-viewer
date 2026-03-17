import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { mergeVoxelKeysToBoxes } from '../src/viewer/voxelMaskMerge';

describe('voxelMaskMerge', () => {
  test('merges contiguous block into one box', () => {
    const keys = [
      '0,0,0', '1,0,0',
      '0,0,1', '1,0,1',
      '0,1,0', '1,1,0',
      '0,1,1', '1,1,1'
    ];
    const boxes = mergeVoxelKeysToBoxes(keys, 1, new THREE.Vector3(0, 0, 0));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].min.toArray()).toEqual([0, 0, 0]);
    expect(boxes[0].max.toArray()).toEqual([2, 2, 2]);
  });

  test('keeps separated islands as separate boxes', () => {
    const keys = ['0,0,0', '1,0,0', '10,2,3'];
    const boxes = mergeVoxelKeysToBoxes(keys, 0.5, new THREE.Vector3(1, 2, 3));
    expect(boxes).toHaveLength(2);

    const sorted = boxes
      .map((box) => ({ min: box.min.toArray(), max: box.max.toArray() }))
      .sort((a, b) => a.min[0] - b.min[0]);

    expect(sorted[0]).toEqual({
      min: [1, 2, 3],
      max: [2, 2.5, 3.5]
    });
    expect(sorted[1]).toEqual({
      min: [6, 3, 4.5],
      max: [6.5, 3.5, 5]
    });
  });
});
