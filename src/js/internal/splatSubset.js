import * as THREE from 'three';
import { voxelHash } from '../../viewer/voxelizer';

const SPARK_SPLAT_TEXTURE_WIDTH = 2048;

const tempWorldCenter = new THREE.Vector3();

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
    lod: true,
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
  return createSubsetMesh(sourceMesh, sparkModule, { packedSplats });
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
  return createSubsetMesh(sourceMesh, sparkModule, { extSplats });
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
  return mesh;
}

export function collectSplatIndicesForVoxelKeys({ sourceMesh, selectedKeys, voxelData }) {
  if (!(selectedKeys instanceof Set) || selectedKeys.size < 1) {
    return [];
  }
  if (typeof sourceMesh?.forEachSplat !== 'function') {
    throw new Error('Source splat mesh does not support forEachSplat iteration.');
  }

  const resolution = Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1));
  const origin = normalizeOrigin(voxelData?.origin);
  const indices = [];

  sourceMesh.updateMatrixWorld?.(true);
  const worldMatrix = sourceMesh.matrixWorld instanceof THREE.Matrix4
    ? sourceMesh.matrixWorld
    : new THREE.Matrix4();

  sourceMesh.forEachSplat((index, center) => {
    tempWorldCenter.copy(center).applyMatrix4(worldMatrix);
    const key = voxelHash(
      Math.floor((tempWorldCenter.x - origin.x) / resolution),
      Math.floor((tempWorldCenter.y - origin.y) / resolution),
      Math.floor((tempWorldCenter.z - origin.z) / resolution)
    );
    if (selectedKeys.has(key)) {
      indices.push(index);
    }
  });

  return indices;
}

export async function buildSplatSubsetMeshFromVoxelKeys({
  sourceMesh,
  sparkModule,
  selectedKeys,
  voxelData
}) {
  if (!sourceMesh) {
    throw new Error('Missing source splat mesh.');
  }

  const indices = collectSplatIndicesForVoxelKeys({
    sourceMesh,
    selectedKeys,
    voxelData
  });
  if (indices.length < 1) {
    return { mesh: null, splatCount: 0, method: 'empty' };
  }

  let mesh = await buildPackedSubsetMesh(sourceMesh, sparkModule, indices);
  if (mesh) {
    return { mesh, splatCount: indices.length, method: 'packed-array' };
  }

  mesh = await buildExtSubsetMesh(sourceMesh, sparkModule, indices);
  if (mesh) {
    return { mesh, splatCount: indices.length, method: 'ext-array' };
  }

  mesh = await buildPushSubsetMesh(sourceMesh, sparkModule, indices);
  return { mesh, splatCount: indices.length, method: 'push' };
}
