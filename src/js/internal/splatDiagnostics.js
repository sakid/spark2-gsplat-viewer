import * as THREE from 'three';

const tempWorldCenter = new THREE.Vector3();
const tempWorldScale = new THREE.Vector3();

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toWorldArray(value) {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      toFiniteNumber(value[0], 0),
      toFiniteNumber(value[1], 0),
      toFiniteNumber(value[2], 0)
    ];
  }
  if (value?.isVector3) {
    return [toFiniteNumber(value.x, 0), toFiniteNumber(value.y, 0), toFiniteNumber(value.z, 0)];
  }
  return [0, 0, 0];
}

function normalizeOrigin(origin) {
  return {
    x: toFiniteNumber(origin?.x, 0),
    y: toFiniteNumber(origin?.y, 0),
    z: toFiniteNumber(origin?.z, 0)
  };
}

function hashWorldCell(world, resolution, origin) {
  return [
    Math.floor((world[0] - origin.x) / resolution),
    Math.floor((world[1] - origin.y) / resolution),
    Math.floor((world[2] - origin.z) / resolution)
  ].join(',');
}

function summarizeRange(values) {
  if (!Array.isArray(values) || values.length < 1) {
    return { min: 0, max: 0, mean: 0, p10: 0, p50: 0, p90: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const percentile = (fraction) => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
    return sorted[index];
  };
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    p10: percentile(0.1),
    p50: percentile(0.5),
    p90: percentile(0.9)
  };
}

function summarizeHistogram(values, bucketCount = 8) {
  if (!Array.isArray(values) || values.length < 1) {
    return [];
  }
  const summary = summarizeRange(values);
  const span = Math.max(1e-6, summary.max - summary.min);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: summary.min + (span * index) / bucketCount,
    end: summary.min + (span * (index + 1)) / bucketCount,
    count: 0
  }));
  for (const value of values) {
    const offset = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor(((value - summary.min) / span) * bucketCount))
    );
    buckets[offset].count += 1;
  }
  return buckets;
}

function box3ToJson(bounds) {
  if (!bounds?.isBox3) return null;
  return {
    min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
  };
}

function collectCellCounts(worldCenters, { resolution = 1, origin = { x: 0, y: 0, z: 0 } } = {}) {
  const safeResolution = Math.max(1e-6, toFiniteNumber(resolution, 1));
  const safeOrigin = normalizeOrigin(origin);
  const counts = new Map();
  for (const center of Array.isArray(worldCenters) ? worldCenters : []) {
    const world = toWorldArray(center);
    const key = hashWorldCell(world, safeResolution, safeOrigin);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function summarizeCellDensity(worldCenters, voxelData) {
  const counts = collectCellCounts(worldCenters, voxelData);
  const values = Array.from(counts.values());
  return {
    cellCount: counts.size,
    occupiedRange: summarizeRange(values),
    histogram: summarizeHistogram(values)
  };
}

function summarizeOpacities(opacities) {
  return {
    range: summarizeRange(opacities),
    histogram: summarizeHistogram(opacities)
  };
}

function inferMeshBounds(mesh, worldCenters) {
  if (typeof mesh?.getBoundingBox === 'function') {
    try {
      const local = mesh.getBoundingBox(false);
      if (local?.isBox3) {
        const worldMatrix = mesh.matrixWorld?.isMatrix4 ? mesh.matrixWorld : null;
        return worldMatrix ? local.clone().applyMatrix4(worldMatrix) : local.clone();
      }
    } catch {
      // Fall back to center-derived bounds.
    }
  }
  const bounds = new THREE.Box3().makeEmpty();
  for (const center of worldCenters) {
    tempWorldCenter.fromArray(toWorldArray(center));
    bounds.expandByPoint(tempWorldCenter);
  }
  return bounds.isEmpty() ? null : bounds;
}

export function summarizeSplatCandidates(candidates, voxelData, { extra = {} } = {}) {
  const worldCenters = [];
  const opacities = [];
  const supportScores = [];
  const scoreValues = [];
  let coreCount = 0;
  let expandedCount = 0;

  for (const entry of Array.isArray(candidates) ? candidates : []) {
    worldCenters.push(toWorldArray(entry?.worldCenter));
    opacities.push(toFiniteNumber(entry?.opacity, 0));
    supportScores.push(toFiniteNumber(entry?.supportScore, 0));
    scoreValues.push(toFiniteNumber(entry?.score, 0));
    if (entry?.centerInCore) coreCount += 1;
    if (entry?.centerInExtraction) expandedCount += 1;
  }

  const bounds = new THREE.Box3().makeEmpty();
  for (const world of worldCenters) {
    tempWorldCenter.fromArray(world);
    bounds.expandByPoint(tempWorldCenter);
  }

  return {
    candidateCount: worldCenters.length,
    coreCenterCount: coreCount,
    extractionCenterCount: expandedCount,
    opacity: summarizeOpacities(opacities),
    support: {
      range: summarizeRange(supportScores),
      histogram: summarizeHistogram(supportScores)
    },
    score: {
      range: summarizeRange(scoreValues),
      histogram: summarizeHistogram(scoreValues)
    },
    density: summarizeCellDensity(worldCenters, voxelData),
    bounds: box3ToJson(bounds.isEmpty() ? null : bounds),
    ...extra
  };
}

export function summarizeSplatMesh(mesh, voxelData, { label = '', extra = {}, sampleLimit = 200_000 } = {}) {
  const worldCenters = [];
  const opacities = [];
  const scales = [];
  const worldMatrix = mesh?.matrixWorld?.isMatrix4 ? mesh.matrixWorld : new THREE.Matrix4();
  mesh?.updateMatrixWorld?.(true);
  let sampledCount = 0;
  const stop = { stop: true };

  if (typeof mesh?.forEachSplat === 'function') {
    try {
      mesh.forEachSplat((_index, center, splatScale, _quaternion, opacity) => {
        tempWorldCenter.copy(center).applyMatrix4(worldMatrix);
        worldCenters.push([tempWorldCenter.x, tempWorldCenter.y, tempWorldCenter.z]);
        opacities.push(toFiniteNumber(opacity, 0));
        scales.push(Math.max(
          0,
          toFiniteNumber(splatScale?.x, 0),
          toFiniteNumber(splatScale?.y, 0),
          toFiniteNumber(splatScale?.z, 0)
        ));
        sampledCount += 1;
        if (sampledCount >= sampleLimit) throw stop;
      });
    } catch (error) {
      if (error !== stop) throw error;
    }
  }

  const bounds = inferMeshBounds(mesh, worldCenters);
  const packedCount = Math.max(0, Math.floor(toFiniteNumber(mesh?.packedSplats?.numSplats, 0)));
  const extCount = Math.max(0, Math.floor(toFiniteNumber(mesh?.extSplats?.numSplats, 0)));
  const meshCount = Math.max(
    0,
    Math.floor(toFiniteNumber(mesh?.numSplats ?? mesh?.splatCount, Math.max(packedCount, extCount, worldCenters.length)))
  );

  return {
    label,
    meshCount,
    sampledCount,
    packedCount,
    extCount,
    opacity: summarizeOpacities(opacities),
    scale: {
      range: summarizeRange(scales),
      histogram: summarizeHistogram(scales)
    },
    density: summarizeCellDensity(worldCenters, voxelData),
    bounds: box3ToJson(bounds),
    ...extra
  };
}
