const DEFAULT_OPTIONS = Object.freeze({
  colorThreshold: 0.15,
  minCount: 80,
  mergeMinSlenderness: 0.6,
  mergeScoreFraction: 0.55,
  mergeMaxGapScale: 1,
  maxMergedComponents: 3
});

const DEFAULT_EXPANSION_OPTIONS = Object.freeze({
  radius: 1,
  maxScale: 2.5,
  colorThreshold: 0.2,
  lowBandFraction: 0.16
});

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseKey = (key) => {
  const [xRaw, yRaw, zRaw] = String(key).split(',');
  return [Number(xRaw) || 0, Number(yRaw) || 0, Number(zRaw) || 0];
};

const hashKey = (x, y, z) => `${x},${y},${z}`;

const neighborsForKey = (x, y, z) => ([
  hashKey(x + 1, y, z),
  hashKey(x - 1, y, z),
  hashKey(x, y + 1, z),
  hashKey(x, y - 1, z),
  hashKey(x, y, z + 1),
  hashKey(x, y, z - 1)
]);

const colorDistanceSquared = (a, b) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

const buildColorByKey = (voxelData) => {
  const colors = new Map();
  for (const key of voxelData.occupiedKeys ?? []) {
    const index = voxelData.keyToIndex.get(key);
    const sourceColor = Number.isInteger(index) ? voxelData.baseIndexToColor[index] : null;
    if (!sourceColor) {
      colors.set(key, [0, 0, 0]);
      continue;
    }
    colors.set(key, [toNumber(sourceColor.r, 0), toNumber(sourceColor.g, 0), toNumber(sourceColor.b, 0)]);
  }
  return colors;
};

const computeGlobalYRange = (occupied) => {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const key of occupied) {
    const [, y] = parseKey(key);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + 1);
  }
  return {
    minY,
    maxY
  };
};

const createComponent = ({
  keys,
  count,
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
  resolution,
  origin,
  globalMinYWorld,
  globalHeightWorld
}) => {
  const width = (maxX - minX + 1) * resolution;
  const height = (maxY - minY + 1) * resolution;
  const depth = (maxZ - minZ + 1) * resolution;
  const footprint = Math.max(width, depth, resolution);
  const volume = width * height * depth;
  const centerY = origin.y + ((minY + maxY + 1) * 0.5) * resolution;
  const elevated = (centerY - globalMinYWorld) / globalHeightWorld;
  const slenderness = height / footprint;
  const compactness = count / Math.max(1, volume / (resolution ** 3));

  const boundsWorld = {
    min: {
      x: origin.x + minX * resolution,
      y: origin.y + minY * resolution,
      z: origin.z + minZ * resolution
    },
    max: {
      x: origin.x + (maxX + 1) * resolution,
      y: origin.y + (maxY + 1) * resolution,
      z: origin.z + (maxZ + 1) * resolution
    }
  };

  // Person-like shape favors slender, elevated, and sufficiently populated components.
  const score = (
    slenderness * 1.5
    + (height / Math.max(1e-6, resolution)) * 0.02
    + elevated * 0.4
    + Math.log10(count + 1) * 0.25
    + compactness * 0.1
  );

  return {
    keys,
    count,
    width,
    height,
    depth,
    slenderness,
    elevated,
    compactness,
    score,
    boundsWorld
  };
};

const mergeBoundsWorld = (target, source) => {
  target.min.x = Math.min(target.min.x, source.min.x);
  target.min.y = Math.min(target.min.y, source.min.y);
  target.min.z = Math.min(target.min.z, source.min.z);
  target.max.x = Math.max(target.max.x, source.max.x);
  target.max.y = Math.max(target.max.y, source.max.y);
  target.max.z = Math.max(target.max.z, source.max.z);
  return target;
};

const boundsGapDistance = (a, b) => {
  const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
  const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
  const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
  return Math.hypot(dx, dy, dz);
};

const findLargestConnectedComponent = (voxelData) => {
  const occupied = voxelData?.occupiedKeys;
  if (!occupied || occupied.size < 1) return null;

  const visited = new Set();
  let best = null;
  let bestCount = 0;

  for (const startKey of occupied) {
    if (visited.has(startKey)) continue;
    visited.add(startKey);
    const queue = [startKey];
    let cursor = 0;
    const keys = [];

    while (cursor < queue.length) {
      const key = queue[cursor];
      cursor += 1;
      keys.push(key);

      const [x, y, z] = parseKey(key);
      for (const neighbor of neighborsForKey(x, y, z)) {
        if (!occupied.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (keys.length > bestCount) {
      bestCount = keys.length;
      best = keys;
    }
  }

  return best;
};

export function findLargestConnectedVoxelSeedIndex(voxelData) {
  const largestKeys = findLargestConnectedComponent(voxelData);
  if (!largestKeys?.length) return null;
  const index = voxelData?.keyToIndex?.get(largestKeys[0]);
  return Number.isInteger(index) ? index : null;
}

export function autoSelectPrimaryActorVoxelIndices(voxelData, options = {}) {
  const occupied = voxelData?.occupiedKeys;
  if (!occupied || occupied.size < 1) {
    return {
      strategy: 'none',
      selectedIndices: [],
      selectedCount: 0,
      selectedKeys: []
    };
  }

  const config = {
    colorThreshold: Math.max(0.01, toNumber(options.colorThreshold, DEFAULT_OPTIONS.colorThreshold)),
    minCount: Math.max(1, Math.floor(toNumber(options.minCount, DEFAULT_OPTIONS.minCount))),
    mergeMinSlenderness: Math.max(0, toNumber(options.mergeMinSlenderness, DEFAULT_OPTIONS.mergeMinSlenderness)),
    mergeScoreFraction: Math.max(0, toNumber(options.mergeScoreFraction, DEFAULT_OPTIONS.mergeScoreFraction)),
    mergeMaxGapScale: Math.max(0, toNumber(options.mergeMaxGapScale, DEFAULT_OPTIONS.mergeMaxGapScale)),
    maxMergedComponents: Math.max(1, Math.floor(toNumber(options.maxMergedComponents, DEFAULT_OPTIONS.maxMergedComponents)))
  };

  const resolution = Math.max(1e-6, toNumber(voxelData.resolution, 1));
  const origin = voxelData.origin ?? { x: 0, y: 0, z: 0 };
  const colorByKey = buildColorByKey(voxelData);
  const colorThresholdSq = config.colorThreshold * config.colorThreshold;
  const yRange = computeGlobalYRange(occupied);
  const globalMinYWorld = origin.y + yRange.minY * resolution;
  const globalHeightWorld = Math.max((yRange.maxY - yRange.minY) * resolution, resolution);

  const visited = new Set();
  const components = [];

  for (const startKey of occupied) {
    if (visited.has(startKey)) continue;
    visited.add(startKey);
    const queue = [startKey];
    let cursor = 0;
    const keys = [];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    while (cursor < queue.length) {
      const key = queue[cursor];
      cursor += 1;
      keys.push(key);

      const [x, y, z] = parseKey(key);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);

      const sourceColor = colorByKey.get(key) ?? [0, 0, 0];
      for (const neighbor of neighborsForKey(x, y, z)) {
        if (!occupied.has(neighbor) || visited.has(neighbor)) continue;
        const neighborColor = colorByKey.get(neighbor) ?? [0, 0, 0];
        if (colorDistanceSquared(sourceColor, neighborColor) > colorThresholdSq) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    const component = createComponent({
      keys,
      count: keys.length,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      resolution,
      origin,
      globalMinYWorld,
      globalHeightWorld
    });
    components.push(component);
  }

  const candidates = components
    .filter((component) => component.count >= config.minCount)
    .sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    const best = candidates[0];
    const selectedComponents = [best];
    const selectedKeys = new Set(best.keys);
    const mergedBounds = {
      min: { ...best.boundsWorld.min },
      max: { ...best.boundsWorld.max }
    };
    const mergeMaxGap = resolution * config.mergeMaxGapScale;

    for (const candidate of candidates.slice(1)) {
      if (selectedComponents.length >= config.maxMergedComponents) break;
      if (candidate.slenderness < config.mergeMinSlenderness) continue;
      if (candidate.score < best.score * config.mergeScoreFraction) continue;
      if (boundsGapDistance(mergedBounds, candidate.boundsWorld) > mergeMaxGap) continue;
      selectedComponents.push(candidate);
      mergeBoundsWorld(mergedBounds, candidate.boundsWorld);
      for (const key of candidate.keys) selectedKeys.add(key);
    }

    const selectedIndices = Array.from(selectedKeys)
      .map((key) => voxelData.keyToIndex.get(key))
      .filter((index) => Number.isInteger(index))
      .map((index) => Number(index))
      .sort((a, b) => a - b);

    if (selectedIndices.length > 0) {
      return {
        strategy: 'color-aware',
        selectedIndices,
        selectedKeys: Array.from(selectedKeys),
        selectedCount: selectedIndices.length,
        mergedComponents: selectedComponents.length,
        threshold: config.colorThreshold,
        minCount: config.minCount
      };
    }
  }

  const fallbackKeys = findLargestConnectedComponent(voxelData) ?? [];
  const fallbackIndices = fallbackKeys
    .map((key) => voxelData.keyToIndex.get(key))
    .filter((index) => Number.isInteger(index))
    .map((index) => Number(index))
    .sort((a, b) => a - b);

  return {
    strategy: 'largest-connected',
    selectedIndices: fallbackIndices,
    selectedKeys: fallbackKeys,
    selectedCount: fallbackIndices.length,
    threshold: config.colorThreshold,
    minCount: config.minCount
  };
}

export function expandSelectedVoxelKeysForExtraction(voxelData, selectedKeys, options = {}) {
  const occupied = voxelData?.occupiedKeys;
  if (!occupied || occupied.size < 1 || !selectedKeys) {
    return new Set();
  }

  const selected = new Set(Array.from(selectedKeys).filter((key) => occupied.has(key)));
  if (selected.size < 1) {
    return selected;
  }

  const config = {
    radius: Math.max(0, Math.floor(toNumber(options.radius, DEFAULT_EXPANSION_OPTIONS.radius))),
    maxScale: Math.max(1, toNumber(options.maxScale, DEFAULT_EXPANSION_OPTIONS.maxScale)),
    colorThreshold: Math.max(0, toNumber(options.colorThreshold, DEFAULT_EXPANSION_OPTIONS.colorThreshold)),
    lowBandFraction: Math.max(0, toNumber(options.lowBandFraction, DEFAULT_EXPANSION_OPTIONS.lowBandFraction))
  };

  if (config.radius < 1) {
    return selected;
  }

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const key of selected) {
    const [, y] = parseKey(key);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const selectedHeight = Math.max(1, maxY - minY + 1);
  const lowBandMaxY = minY + Math.max(1, Math.floor(selectedHeight * config.lowBandFraction));

  const colorThresholdSq = config.colorThreshold > 0
    ? config.colorThreshold * config.colorThreshold
    : Number.POSITIVE_INFINITY;
  const colorByKey = buildColorByKey(voxelData);

  const expanded = new Set(selected);
  const maxCount = Math.max(expanded.size, Math.floor(expanded.size * config.maxScale));
  let frontier = Array.from(selected);

  for (let step = 0; step < config.radius; step += 1) {
    if (!frontier.length || expanded.size >= maxCount) break;
    const next = [];
    let reachedLimit = false;

    for (const key of frontier) {
      const [x, y, z] = parseKey(key);
      const sourceColor = colorByKey.get(key) ?? null;
      for (const neighbor of neighborsForKey(x, y, z)) {
        if (!occupied.has(neighbor) || expanded.has(neighbor)) continue;

        const [nx, ny, nz] = parseKey(neighbor);
        if (ny <= lowBandMaxY && !occupied.has(hashKey(nx, ny + 1, nz))) {
          continue;
        }

        if (sourceColor && Number.isFinite(colorThresholdSq)) {
          const neighborColor = colorByKey.get(neighbor) ?? null;
          if (neighborColor && colorDistanceSquared(sourceColor, neighborColor) > colorThresholdSq) {
            continue;
          }
        }

        expanded.add(neighbor);
        next.push(neighbor);
        if (expanded.size >= maxCount) {
          reachedLimit = true;
          break;
        }
      }
      if (reachedLimit) break;
    }

    frontier = next;
    if (reachedLimit) break;
  }

  return expanded;
}
