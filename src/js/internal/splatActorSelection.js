import * as THREE from 'three';
import {
  autoSelectPrimaryActorVoxelIndices,
  expandSelectedVoxelKeysForExtraction
} from './voxelSegmentation';

const DEFAULT_OPTIONS = Object.freeze({
  syntheticResolutionScale: 0.75,
  minCellSplats: 1,
  expansionRadius: 1,
  expansionMaxScale: 1.35
});

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOrigin(origin) {
  return {
    x: toFiniteNumber(origin?.x, 0),
    y: toFiniteNumber(origin?.y, 0),
    z: toFiniteNumber(origin?.z, 0)
  };
}

function hashKey(x, y, z) {
  return `${x},${y},${z}`;
}

export function createSelectedSplatCellMap({
  worldCenters,
  resolution,
  origin,
  minCellSplats = DEFAULT_OPTIONS.minCellSplats
} = {}) {
  const safeResolution = Math.max(1e-6, toFiniteNumber(resolution, 1));
  const safeOrigin = normalizeOrigin(origin);
  const counts = new Map();

  for (const entry of Array.isArray(worldCenters) ? worldCenters : []) {
    const world = Array.isArray(entry?.worldCenter) ? entry.worldCenter : null;
    if (!world || world.length < 3) continue;
    const key = hashKey(
      Math.floor((toFiniteNumber(world[0], 0) - safeOrigin.x) / safeResolution),
      Math.floor((toFiniteNumber(world[1], 0) - safeOrigin.y) / safeResolution),
      Math.floor((toFiniteNumber(world[2], 0) - safeOrigin.z) / safeResolution)
    );
    let bucket = counts.get(key);
    if (!bucket) {
      bucket = [];
      counts.set(key, bucket);
    }
    bucket.push(toFiniteNumber(entry?.index, -1));
  }

  const cellMap = new Map();
  const requiredCount = Math.max(1, Math.floor(toFiniteNumber(minCellSplats, DEFAULT_OPTIONS.minCellSplats)));
  for (const [key, indices] of counts.entries()) {
    if (!Array.isArray(indices) || indices.length < requiredCount) continue;
    cellMap.set(key, indices);
  }

  if (cellMap.size > 0) return cellMap;
  return counts;
}

export function buildSyntheticVoxelDataFromCellMap(cellMap, { resolution, origin } = {}) {
  const safeResolution = Math.max(1e-6, toFiniteNumber(resolution, 1));
  const safeOrigin = normalizeOrigin(origin);
  const keys = Array.from(cellMap?.keys?.() ?? []);
  const keyToIndex = new Map();
  const indexToKey = [];
  const baseIndexToColor = [];
  const occupiedKeys = new Set();
  const occupiedCounts = new Map();

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    keyToIndex.set(key, index);
    indexToKey.push(key);
    baseIndexToColor.push(new THREE.Color(1, 1, 1));
    occupiedKeys.add(key);
    occupiedCounts.set(key, cellMap.get(key)?.length ?? 0);
  }

  return {
    resolution: safeResolution,
    origin: safeOrigin,
    keyToIndex,
    indexToKey,
    baseIndexToColor,
    occupiedKeys,
    occupiedCounts,
    activeCount: occupiedKeys.size
  };
}

export function selectPrimaryActorSplatCellKeys(cellMap, voxelData, options = {}) {
  const config = {
    syntheticResolutionScale: Math.max(0.25, toFiniteNumber(options.syntheticResolutionScale, DEFAULT_OPTIONS.syntheticResolutionScale)),
    minCellSplats: Math.max(1, Math.floor(toFiniteNumber(options.minCellSplats, DEFAULT_OPTIONS.minCellSplats))),
    expansionRadius: Math.max(0, Math.floor(toFiniteNumber(options.expansionRadius, DEFAULT_OPTIONS.expansionRadius))),
    expansionMaxScale: Math.max(1, toFiniteNumber(options.expansionMaxScale, DEFAULT_OPTIONS.expansionMaxScale))
  };

  const syntheticResolution = Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1) * config.syntheticResolutionScale);
  const synthetic = buildSyntheticVoxelDataFromCellMap(cellMap, {
    resolution: syntheticResolution,
    origin: voxelData?.origin
  });
  if (!synthetic.occupiedKeys.size) {
    return {
      syntheticVoxelData: synthetic,
      selectedKeys: new Set()
    };
  }

  const selection = autoSelectPrimaryActorVoxelIndices(synthetic, {
    colorThreshold: 1,
    minCount: Math.max(2, config.minCellSplats),
    mergeMaxGapScale: 1,
    maxMergedComponents: 2
  });

  const initial = new Set(selection?.selectedKeys ?? []);
  const expanded = expandSelectedVoxelKeysForExtraction(synthetic, initial, {
    radius: config.expansionRadius,
    maxScale: config.expansionMaxScale,
    colorThreshold: 1,
    lowBandFraction: 0.1
  });

  return {
    syntheticVoxelData: synthetic,
    selectedKeys: expanded.size > 0 ? expanded : initial,
    selection
  };
}
