import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import {
  autoSelectPrimaryActorVoxelIndices,
  expandSelectedVoxelKeysForExtraction,
  findLargestConnectedVoxelSeedIndex
} from '../src/js/internal/voxelSegmentation';

interface SyntheticVoxelEntry {
  key: string;
  color: [number, number, number];
}

interface SyntheticVoxelData {
  occupiedKeys: Set<string>;
  keyToIndex: Map<string, number>;
  baseIndexToColor: THREE.Color[];
  resolution: number;
  origin: THREE.Vector3;
}

function createSyntheticVoxelData(entries: SyntheticVoxelEntry[], resolution = 0.5): SyntheticVoxelData {
  const occupiedKeys = new Set<string>();
  const keyToIndex = new Map<string, number>();
  const baseIndexToColor: THREE.Color[] = [];

  for (const entry of entries) {
    const index = baseIndexToColor.length;
    occupiedKeys.add(entry.key);
    keyToIndex.set(entry.key, index);
    baseIndexToColor.push(new THREE.Color(entry.color[0], entry.color[1], entry.color[2]));
  }

  return {
    occupiedKeys,
    keyToIndex,
    baseIndexToColor,
    resolution,
    origin: new THREE.Vector3(0, 0, 0)
  };
}

function buildFixtureData(): SyntheticVoxelData {
  const entries: SyntheticVoxelEntry[] = [];

  // Flat background slab (large but low slenderness).
  for (let x = -4; x <= -1; x += 1) {
    for (let z = 0; z <= 2; z += 1) {
      entries.push({ key: `${x},0,${z}`, color: [0.3, 0.3, 0.3] });
    }
  }

  // Subject upper body chunk (tall).
  const upperKeys = ['5,2,0', '5,3,0', '5,4,0', '5,5,0', '6,4,0'];
  for (const key of upperKeys) {
    entries.push({ key, color: [0.9, 0.7, 0.6] });
  }

  // Subject lower body chunk (adjacent bounds, different color).
  const lowerKeys = ['5,0,0', '5,1,0', '6,0,0', '6,1,0', '6,2,0'];
  for (const key of lowerKeys) {
    entries.push({ key, color: [0.75, 0.5, 0.45] });
  }

  return createSyntheticVoxelData(entries);
}

describe('voxelSegmentation', () => {
  test('findLargestConnectedVoxelSeedIndex returns seed from largest connected set', () => {
    const data = createSyntheticVoxelData([
      { key: '0,0,0', color: [1, 1, 1] },
      { key: '1,0,0', color: [1, 1, 1] },
      { key: '2,0,0', color: [1, 1, 1] },
      { key: '10,0,0', color: [1, 1, 1] }
    ]);

    const seedIndex = findLargestConnectedVoxelSeedIndex(data);
    expect(seedIndex).toBe(data.keyToIndex.get('0,0,0'));
  });

  test('autoSelectPrimaryActorVoxelIndices prefers person-like segmented components', () => {
    const data = buildFixtureData();
    const selected = autoSelectPrimaryActorVoxelIndices(data, {
      colorThreshold: 0.15,
      minCount: 3,
      mergeScoreFraction: 0.5,
      mergeMinSlenderness: 0.6
    });

    expect(selected.strategy).toBe('color-aware');
    expect(selected.selectedCount).toBeGreaterThanOrEqual(10);
    expect(selected.selectedKeys).toContain('5,4,0');
    expect(selected.selectedKeys).toContain('6,1,0');
    expect(selected.selectedKeys).not.toContain('-4,0,0');
  });

  test('falls back to largest connected selection when candidates are filtered out', () => {
    const data = buildFixtureData();
    const selected = autoSelectPrimaryActorVoxelIndices(data, {
      colorThreshold: 0.15,
      minCount: 9999
    });

    expect(selected.strategy).toBe('largest-connected');
    expect(selected.selectedCount).toBe(12);
    expect(selected.selectedKeys).toContain('-4,0,0');
  });

  test('expansion keeps low-band growth anchored to vertical support', () => {
    const data = createSyntheticVoxelData([
      { key: '0,0,0', color: [0.8, 0.6, 0.5] },
      { key: '0,1,0', color: [0.8, 0.6, 0.5] },
      { key: '0,2,0', color: [0.8, 0.6, 0.5] },
      { key: '1,0,0', color: [0.8, 0.6, 0.5] }, // has support above
      { key: '1,1,0', color: [0.8, 0.6, 0.5] },
      { key: '-1,0,0', color: [0.8, 0.6, 0.5] } // unsupported floor noise
    ]);

    const expanded = expandSelectedVoxelKeysForExtraction(data, new Set(['0,0,0', '0,1,0', '0,2,0']), {
      radius: 1,
      maxScale: 4,
      colorThreshold: 0.5,
      lowBandFraction: 0.4
    });

    expect(expanded.has('1,0,0')).toBe(true);
    expect(expanded.has('-1,0,0')).toBe(false);
  });

  test('expansion respects color threshold when adding neighbors', () => {
    const data = createSyntheticVoxelData([
      { key: '0,0,0', color: [0.9, 0.3, 0.3] },
      { key: '0,1,0', color: [0.9, 0.3, 0.3] },
      { key: '1,0,0', color: [0.1, 0.2, 0.9] },
      { key: '1,1,0', color: [0.1, 0.2, 0.9] }
    ]);

    const expanded = expandSelectedVoxelKeysForExtraction(data, new Set(['0,0,0', '0,1,0']), {
      radius: 1,
      maxScale: 3,
      colorThreshold: 0.05,
      lowBandFraction: 0.4
    });

    expect(expanded.has('1,0,0')).toBe(false);
    expect(expanded.has('1,1,0')).toBe(false);
  });
});
