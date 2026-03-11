import * as THREE from 'three';
import { normalizeSplatMeshCounts } from './splatMeshCounts';
import { createVoxelOverlapSelector, normalizeVoxelOrigin, resolveWorldScaleMax } from './splatSelection';
import { selectPrimaryActorSplatCandidateIndices } from './splatActorSelection';
import { summarizeSplatCandidates } from './splatDiagnostics';

const SPARK_SPLAT_TEXTURE_WIDTH = 2048;
const DEFAULT_OVERLAP_SCALE = 2.0;
const DEFAULT_MAX_VOXEL_RADIUS = 2;
const tempWorldCenter = new THREE.Vector3();

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashKey(x, y, z) {
  return `${x},${y},${z}`;
}

function roundUpSplatCapacity(count) {
  const size = Math.max(0, Math.floor(toFiniteNumber(count, 0)));
  if (size < 1) return 0;
  return Math.ceil(size / SPARK_SPLAT_TEXTURE_WIDTH) * SPARK_SPLAT_TEXTURE_WIDTH;
}

function copyTypedArraySubset(source, indices, stride, paddedCount = indices.length) {
  if (!source || typeof source.length !== 'number') {
    return null;
  }
  const Constructor = source.constructor;
  const target = new Constructor(Math.max(0, paddedCount) * stride);
  let cursor = 0;
  for (const index of indices) {
    const sourceOffset = index * stride;
    const targetOffset = cursor * stride;
    for (let part = 0; part < stride; part += 1) {
      target[targetOffset + part] = source[sourceOffset + part];
    }
    cursor += 1;
  }
  return target;
}

function buildPackedExtraSubset(extra, indices) {
  const subset = {};
  if (extra?.sh1) subset.sh1 = copyTypedArraySubset(extra.sh1, indices, 2);
  if (extra?.sh2) subset.sh2 = copyTypedArraySubset(extra.sh2, indices, 4);
  if (extra?.sh3) subset.sh3 = copyTypedArraySubset(extra.sh3, indices, 4);
  return subset;
}

function buildExtExtraSubset(extra, indices) {
  const subset = {};
  if (extra?.sh1) subset.sh1 = copyTypedArraySubset(extra.sh1, indices, 4);
  if (extra?.sh2) subset.sh2 = copyTypedArraySubset(extra.sh2, indices, 4);
  if (extra?.sh3a) subset.sh3a = copyTypedArraySubset(extra.sh3a, indices, 4);
  if (extra?.sh3b) subset.sh3b = copyTypedArraySubset(extra.sh3b, indices, 4);
  return subset;
}

function getSubsetMeshOptions(sourceMesh, overrides = {}) {
  return {
    editable: sourceMesh?.editable,
    raycastable: sourceMesh?.raycastable,
    covSplats: sourceMesh?.covSplats === true,
    lod: false,
    nonLod: true,
    maxSh: Number(sourceMesh?.maxSh ?? sourceMesh?.packedSplats?.maxSh ?? sourceMesh?.extSplats?.maxSh) || 3,
    ...overrides
  };
}

async function createSubsetMesh(sourceMesh, sparkModule, overrides = {}) {
  if (typeof sparkModule?.SplatMesh !== 'function') {
    throw new Error('Spark SplatMesh constructor is unavailable.');
  }
  const mesh = new sparkModule.SplatMesh(getSubsetMeshOptions(sourceMesh, overrides));
  if (mesh.initialized) {
    await mesh.initialized;
  }
  return mesh;
}

async function buildPackedSubsetMesh(sourceMesh, sparkModule, indices) {
  if (typeof sparkModule?.PackedSplats !== 'function') {
    return null;
  }
  const sourcePacked = sourceMesh?.packedSplats;
  if (!(sourcePacked?.packedArray instanceof Uint32Array)) {
    return null;
  }

  const count = indices.length;
  const paddedCount = roundUpSplatCapacity(count);
  const packedSplats = new sparkModule.PackedSplats({
    packedArray: copyTypedArraySubset(sourcePacked.packedArray, indices, 4, paddedCount),
    numSplats: count,
    extra: buildPackedExtraSubset(sourcePacked.extra, indices),
    splatEncoding: sourcePacked.splatEncoding,
    lod: false,
    nonLod: true
  });
  if (packedSplats.initialized) {
    await packedSplats.initialized;
  }
  packedSplats.maxSh = Number(sourcePacked.maxSh) || Number(sourceMesh?.maxSh) || 3;
  const mesh = await createSubsetMesh(sourceMesh, sparkModule, { packedSplats });
  normalizeSplatMeshCounts(mesh, count);
  return mesh;
}

async function buildExtSubsetMesh(sourceMesh, sparkModule, indices) {
  if (typeof sparkModule?.ExtSplats !== 'function') {
    return null;
  }
  const sourceExt = sourceMesh?.extSplats;
  if (!(sourceExt?.extArrays?.[0] instanceof Uint32Array) || !(sourceExt?.extArrays?.[1] instanceof Uint32Array)) {
    return null;
  }

  const count = indices.length;
  const paddedCount = roundUpSplatCapacity(count);
  const extSplats = new sparkModule.ExtSplats({
    extArrays: [
      copyTypedArraySubset(sourceExt.extArrays[0], indices, 4, paddedCount),
      copyTypedArraySubset(sourceExt.extArrays[1], indices, 4, paddedCount)
    ],
    numSplats: count,
    extra: buildExtExtraSubset(sourceExt.extra, indices),
    lod: false,
    nonLod: true
  });
  if (extSplats.initialized) {
    await extSplats.initialized;
  }
  extSplats.maxSh = Number(sourceExt.maxSh) || Number(sourceMesh?.maxSh) || 3;
  const mesh = await createSubsetMesh(sourceMesh, sparkModule, { extSplats });
  normalizeSplatMeshCounts(mesh, count);
  return mesh;
}

async function buildPushSubsetMesh(sourceMesh, sparkModule, indices) {
  const selected = new Set(indices);
  const mesh = await createSubsetMesh(sourceMesh, sparkModule, {
    extSplats: Boolean(sourceMesh?.extSplats)
  });
  if (typeof mesh.pushSplat !== 'function') {
    throw new Error('Spark subset mesh does not support pushSplat.');
  }

  sourceMesh.forEachSplat((index, center, scales, quaternion, opacity, color) => {
    if (!selected.has(index)) return;
    mesh.pushSplat(center, scales, quaternion, opacity, color);
  });
  normalizeSplatMeshCounts(mesh, indices.length);
  return mesh;
}

function estimateSupportScore({
  extractionKeys,
  centerKey,
  centerWorld,
  scales,
  origin,
  resolution,
  worldScaleMax,
  overlapScale,
  maxVoxelRadius
}) {
  if (extractionKeys.has(centerKey)) return 1;

  const maxScale = Math.max(
    0,
    toFiniteNumber(scales?.x, 0),
    toFiniteNumber(scales?.y, 0),
    toFiniteNumber(scales?.z, 0)
  );
  const radiusWorld = Math.max(
    0,
    Math.min(maxVoxelRadius * resolution, maxScale * worldScaleMax * overlapScale)
  );
  if (radiusWorld <= 1e-6) return 0;

  const minKeyX = Math.floor((centerWorld.x - radiusWorld - origin.x) / resolution);
  const minKeyY = Math.floor((centerWorld.y - radiusWorld - origin.y) / resolution);
  const minKeyZ = Math.floor((centerWorld.z - radiusWorld - origin.z) / resolution);
  const maxKeyX = Math.floor((centerWorld.x + radiusWorld - origin.x) / resolution);
  const maxKeyY = Math.floor((centerWorld.y + radiusWorld - origin.y) / resolution);
  const maxKeyZ = Math.floor((centerWorld.z + radiusWorld - origin.z) / resolution);

  let overlapHits = 0;
  let overlapTotal = 0;
  for (let x = minKeyX; x <= maxKeyX; x += 1) {
    for (let y = minKeyY; y <= maxKeyY; y += 1) {
      for (let z = minKeyZ; z <= maxKeyZ; z += 1) {
        overlapTotal += 1;
        if (extractionKeys.has(hashKey(x, y, z))) {
          overlapHits += 1;
        }
      }
    }
  }

  if (overlapTotal < 1) return 0;
  return overlapHits / overlapTotal;
}

function buildSelectedSplatCandidates({
  sourceMesh,
  coreSelectedKeys,
  extractionKeys,
  voxelData,
  overlapScale,
  maxVoxelRadius
}) {
  const candidates = [];

  sourceMesh.updateMatrixWorld?.(true);
  const worldMatrix = sourceMesh.matrixWorld instanceof THREE.Matrix4
    ? sourceMesh.matrixWorld
    : new THREE.Matrix4();
  const resolution = Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1));
  const origin = normalizeVoxelOrigin(voxelData?.origin);
  const worldScaleMax = resolveWorldScaleMax(worldMatrix);
  const selector = createVoxelOverlapSelector({
    selectedKeys: extractionKeys,
    voxelData: {
      resolution,
      origin
    },
    worldMatrix,
    overlapScale,
    maxVoxelRadius
  });

  sourceMesh.forEachSplat((index, center, scales, _quat, opacity) => {
    if (!selector(center, scales)) return;
    tempWorldCenter.copy(center).applyMatrix4(worldMatrix);
    const centerKey = hashKey(
      Math.floor((tempWorldCenter.x - origin.x) / resolution),
      Math.floor((tempWorldCenter.y - origin.y) / resolution),
      Math.floor((tempWorldCenter.z - origin.z) / resolution)
    );
    candidates.push({
      index,
      worldCenter: [tempWorldCenter.x, tempWorldCenter.y, tempWorldCenter.z],
      opacity: Math.max(0, toFiniteNumber(opacity, 0)),
      centerInCore: coreSelectedKeys.has(centerKey),
      centerInExtraction: extractionKeys.has(centerKey),
      supportScore: estimateSupportScore({
        extractionKeys,
        centerKey,
        centerWorld: tempWorldCenter,
        scales,
        origin,
        resolution,
        worldScaleMax,
        overlapScale,
        maxVoxelRadius
      })
    });
  });

  return candidates;
}

export function collectSplatSelectionForVoxelKeys({
  sourceMesh,
  selectedKeys,
  extractionKeys = selectedKeys,
  voxelData,
  overlapScale = DEFAULT_OVERLAP_SCALE,
  maxVoxelRadius = DEFAULT_MAX_VOXEL_RADIUS
}) {
  const coreSelectedKeys = selectedKeys instanceof Set ? selectedKeys : new Set();
  const expandedKeys = extractionKeys instanceof Set ? extractionKeys : coreSelectedKeys;
  if (expandedKeys.size < 1) {
    return {
      candidates: [],
      selectedIndices: [],
      selectionStats: summarizeSplatCandidates([], voxelData, {
        extra: { subsetMethod: 'empty' }
      })
    };
  }
  if (typeof sourceMesh?.forEachSplat !== 'function') {
    throw new Error('Source splat mesh does not support forEachSplat iteration.');
  }

  const candidates = buildSelectedSplatCandidates({
    sourceMesh,
    coreSelectedKeys,
    extractionKeys: expandedKeys,
    voxelData,
    overlapScale,
    maxVoxelRadius
  });
  if (candidates.length < 1) {
    return {
      candidates,
      selectedIndices: [],
      selectionStats: summarizeSplatCandidates(candidates, voxelData, {
        extra: { subsetMethod: 'empty' }
      })
    };
  }

  const refined = selectPrimaryActorSplatCandidateIndices(candidates, voxelData, {
    coreSelectedKeys,
    extractionKeys: expandedKeys
  });
  const selectedIndices = refined.selectedIndices.length > 0
    ? refined.selectedIndices
    : candidates.map((entry) => entry.index);
  const kept = new Set(selectedIndices);
  const retainedCandidates = candidates.filter((entry) => kept.has(entry.index)).map((entry) => ({
    ...entry,
    score: refined.cellStats.get(hashKey(
      Math.floor((entry.worldCenter[0] - normalizeVoxelOrigin(voxelData?.origin).x) / Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1))),
      Math.floor((entry.worldCenter[1] - normalizeVoxelOrigin(voxelData?.origin).y) / Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1))),
      Math.floor((entry.worldCenter[2] - normalizeVoxelOrigin(voxelData?.origin).z) / Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1)))
    ))?.score ?? 0
  }));

  return {
    candidates: retainedCandidates,
    selectedIndices,
    selectionStats: summarizeSplatCandidates(retainedCandidates, voxelData, {
      extra: {
        subsetMethod: 'scored-cells',
        retainedCount: selectedIndices.length,
        threshold: refined.scoreStats.threshold,
        componentCount: refined.scoreStats.componentCount,
        scoreRange: refined.scoreStats.scoreRange
      }
    })
  };
}

export function collectSplatIndicesForVoxelKeys(options) {
  return collectSplatSelectionForVoxelKeys(options).selectedIndices;
}

export async function buildSplatSubsetMeshFromVoxelKeys({
  sourceMesh,
  sparkModule,
  selectedKeys,
  extractionKeys = selectedKeys,
  voxelData,
  overlapScale = DEFAULT_OVERLAP_SCALE,
  maxVoxelRadius = DEFAULT_MAX_VOXEL_RADIUS
}) {
  if (!sourceMesh) {
    throw new Error('Missing source splat mesh.');
  }

  const selection = collectSplatSelectionForVoxelKeys({
    sourceMesh,
    selectedKeys,
    extractionKeys,
    voxelData,
    overlapScale,
    maxVoxelRadius
  });
  const indices = selection.selectedIndices;
  if (indices.length < 1) {
    return { mesh: null, splatCount: 0, method: 'empty', selectionStats: selection.selectionStats };
  }

  let mesh = await buildPackedSubsetMesh(sourceMesh, sparkModule, indices);
  if (mesh) {
    return { mesh, splatCount: indices.length, method: 'packed-array', selectionStats: selection.selectionStats };
  }

  mesh = await buildExtSubsetMesh(sourceMesh, sparkModule, indices);
  if (mesh) {
    return { mesh, splatCount: indices.length, method: 'ext-array', selectionStats: selection.selectionStats };
  }

  mesh = await buildPushSubsetMesh(sourceMesh, sparkModule, indices);
  return { mesh, splatCount: indices.length, method: 'push', selectionStats: selection.selectionStats };
}
