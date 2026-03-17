import * as THREE from 'three';
import {
  autoSelectPrimaryActorVoxelIndices,
  expandSelectedVoxelKeysForExtraction
} from './voxelSegmentation';

const DEFAULT_OPTIONS = Object.freeze({
  syntheticResolutionScale: 0.75,
  minCellSplats: 1,
  expansionRadius: 1,
  expansionMaxScale: 1.35,
  scoreThresholdFraction: 0.48,
  coreWeight: 1.4,
  extractionWeight: 0.45,
  supportWeight: 0.6,
  opacityWeight: 0.45,
  densityWeight: 0.75,
  proximityWeight: 0.65
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

function parseKey(key) {
  const [xRaw, yRaw, zRaw] = String(key).split(',');
  return [
    Math.floor(toFiniteNumber(xRaw, 0)),
    Math.floor(toFiniteNumber(yRaw, 0)),
    Math.floor(toFiniteNumber(zRaw, 0))
  ];
}

function buildNeighborKeys(key) {
  const [x, y, z] = parseKey(key);
  return [
    hashKey(x + 1, y, z),
    hashKey(x - 1, y, z),
    hashKey(x, y + 1, z),
    hashKey(x, y - 1, z),
    hashKey(x, y, z + 1),
    hashKey(x, y, z - 1)
  ];
}

function nearestGridDistance(key, targets) {
  if (!(targets instanceof Set) || targets.size < 1) return 0;
  const [x, y, z] = parseKey(key);
  let best = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const [tx, ty, tz] = parseKey(target);
    const distance = Math.hypot(x - tx, y - ty, z - tz);
    if (distance < best) best = distance;
    if (best <= 0) break;
  }
  return Number.isFinite(best) ? best : 0;
}

function summarizeRange(values) {
  if (!Array.isArray(values) || values.length < 1) {
    return { min: 0, max: 0, mean: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }
  return { min, max, mean: sum / values.length };
}

function normalizeMetric(value, summary) {
  const span = Math.max(1e-6, toFiniteNumber(summary?.max, 0) - toFiniteNumber(summary?.min, 0));
  return (toFiniteNumber(value, 0) - toFiniteNumber(summary?.min, 0)) / span;
}

function collectScoredComponents(selectedKeys, scoreByKey, coreKeys = new Set()) {
  const available = new Set(selectedKeys);
  const components = [];

  while (available.size > 0) {
    const seed = available.values().next().value;
    available.delete(seed);
    const queue = [seed];
    const component = { keys: [], totalScore: 0, coreHits: 0 };

    while (queue.length > 0) {
      const current = queue.shift();
      component.keys.push(current);
      component.totalScore += toFiniteNumber(scoreByKey.get(current), 0);
      if (coreKeys.has(current)) component.coreHits += 1;
      for (const neighbor of buildNeighborKeys(current)) {
        if (!available.has(neighbor)) continue;
        available.delete(neighbor);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  components.sort((a, b) => b.totalScore - a.totalScore || b.keys.length - a.keys.length);
  return components;
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

export function buildSelectedSplatCellStats(
  candidates,
  {
    resolution,
    origin,
    coreSelectedKeys = null,
    extractionKeys = null
  } = {}
) {
  const safeResolution = Math.max(1e-6, toFiniteNumber(resolution, 1));
  const safeOrigin = normalizeOrigin(origin);
  const cellStats = new Map();
  const coreKeys = coreSelectedKeys instanceof Set ? coreSelectedKeys : new Set();
  const expandedKeys = extractionKeys instanceof Set ? extractionKeys : coreKeys;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const world = Array.isArray(candidate?.worldCenter) ? candidate.worldCenter : null;
    if (!world || world.length < 3) continue;
    const key = hashKey(
      Math.floor((toFiniteNumber(world[0], 0) - safeOrigin.x) / safeResolution),
      Math.floor((toFiniteNumber(world[1], 0) - safeOrigin.y) / safeResolution),
      Math.floor((toFiniteNumber(world[2], 0) - safeOrigin.z) / safeResolution)
    );

    let stats = cellStats.get(key);
    if (!stats) {
      stats = {
        key,
        indices: [],
        density: 0,
        opacitySum: 0,
        supportSum: 0,
        coreCenters: 0,
        extractionCenters: 0,
        coreDistance: nearestGridDistance(key, coreKeys),
        inCore: coreKeys.has(key),
        inExtraction: expandedKeys.has(key)
      };
      cellStats.set(key, stats);
    }

    stats.indices.push(toFiniteNumber(candidate?.index, -1));
    stats.density += 1;
    stats.opacitySum += Math.max(0, toFiniteNumber(candidate?.opacity, 0));
    stats.supportSum += Math.max(0, toFiniteNumber(candidate?.supportScore, 0));
    if (candidate?.centerInCore) stats.coreCenters += 1;
    if (candidate?.centerInExtraction) stats.extractionCenters += 1;
  }

  for (const stats of cellStats.values()) {
    const divisor = Math.max(1, stats.density);
    stats.opacityMean = stats.opacitySum / divisor;
    stats.supportMean = stats.supportSum / divisor;
  }

  return cellStats;
}

export function selectPrimaryActorSplatCandidateIndices(candidates, voxelData, options = {}) {
  const coreKeys = options.coreSelectedKeys instanceof Set
    ? options.coreSelectedKeys
    : (options.selectedKeys instanceof Set ? options.selectedKeys : new Set());
  const expandedKeys = options.extractionKeys instanceof Set ? options.extractionKeys : coreKeys;
  const cellStats = buildSelectedSplatCellStats(candidates, {
    resolution: voxelData?.resolution,
    origin: voxelData?.origin,
    coreSelectedKeys: coreKeys,
    extractionKeys: expandedKeys
  });

  if (cellStats.size < 1) {
    return {
      selectedKeys: new Set(),
      selectedIndices: [],
      scoreStats: { scoreRange: summarizeRange([]), threshold: 0, componentCount: 0 },
      cellStats
    };
  }

  const cells = Array.from(cellStats.values());
  const densitySummary = summarizeRange(cells.map((entry) => entry.density));
  const opacitySummary = summarizeRange(cells.map((entry) => entry.opacityMean));
  const supportSummary = summarizeRange(cells.map((entry) => entry.supportMean));
  const distanceSummary = summarizeRange(cells.map((entry) => entry.coreDistance));
  const scoreByKey = new Map();

  for (const cell of cells) {
    const densityScore = normalizeMetric(cell.density, densitySummary);
    const opacityScore = normalizeMetric(cell.opacityMean, opacitySummary);
    const supportScore = normalizeMetric(cell.supportMean, supportSummary);
    const proximityScore = 1 - normalizeMetric(cell.coreDistance, distanceSummary);
    const centerWeight = cell.inCore
      ? DEFAULT_OPTIONS.coreWeight
      : (cell.inExtraction ? DEFAULT_OPTIONS.extractionWeight : 0);
    cell.score = centerWeight
      + densityScore * DEFAULT_OPTIONS.densityWeight
      + opacityScore * DEFAULT_OPTIONS.opacityWeight
      + supportScore * DEFAULT_OPTIONS.supportWeight
      + proximityScore * DEFAULT_OPTIONS.proximityWeight;
    scoreByKey.set(cell.key, cell.score);
  }

  const scoreSummary = summarizeRange(cells.map((entry) => entry.score));
  const threshold = scoreSummary.max > 0
    ? scoreSummary.max * Math.max(0.1, toFiniteNumber(options.scoreThresholdFraction, DEFAULT_OPTIONS.scoreThresholdFraction))
    : 0;

  const candidateKeys = new Set(
    cells
      .filter((cell) => cell.score >= threshold || cell.inCore)
      .map((cell) => cell.key)
  );
  if (candidateKeys.size < 1) {
    const best = cells[0];
    if (best) candidateKeys.add(best.key);
  }

  const components = collectScoredComponents(candidateKeys, scoreByKey, coreKeys);
  const primary = components[0] ?? { keys: [] };
  const selectedKeys = new Set();
  for (const component of components) {
    if (component.coreHits > 0 || component === primary) {
      for (const key of component.keys) selectedKeys.add(key);
    }
  }
  const selectedIndices = [];
  for (const key of selectedKeys) {
    const bucket = cellStats.get(key)?.indices ?? [];
    for (const index of bucket) {
      if (index >= 0) selectedIndices.push(index);
    }
  }

  return {
    selectedKeys,
    selectedIndices,
    scoreStats: {
      scoreRange: scoreSummary,
      threshold,
      componentCount: components.length
    },
    cellStats
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
