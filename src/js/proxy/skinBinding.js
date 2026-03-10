import * as THREE from 'three';

const tempCenter = new THREE.Vector3();
const tempNearestIndices = [0, 0, 0, 0];
const tempNearestDistSq = [Infinity, Infinity, Infinity, Infinity];
const tempIndexVector = new THREE.Vector4();
const tempWeightVector = new THREE.Vector4();

function captureBonePositions(bones) {
  return bones.map((bone) => bone.getWorldPosition(new THREE.Vector3()));
}

export function nearestBoneWeights(center, bonePositions) {
  tempNearestIndices[0] = 0;
  tempNearestIndices[1] = 0;
  tempNearestIndices[2] = 0;
  tempNearestIndices[3] = 0;
  tempNearestDistSq[0] = Infinity;
  tempNearestDistSq[1] = Infinity;
  tempNearestDistSq[2] = Infinity;
  tempNearestDistSq[3] = Infinity;

  for (let index = 0; index < bonePositions.length; index += 1) {
    const distSq = center.distanceToSquared(bonePositions[index]);
    if (distSq >= tempNearestDistSq[3]) continue;
    let slot = 3;
    while (slot > 0 && distSq < tempNearestDistSq[slot - 1]) {
      tempNearestDistSq[slot] = tempNearestDistSq[slot - 1];
      tempNearestIndices[slot] = tempNearestIndices[slot - 1];
      slot -= 1;
    }
    tempNearestDistSq[slot] = distSq;
    tempNearestIndices[slot] = index;
  }

  const count = Math.min(4, bonePositions.length || 1);
  let w0 = count > 0 ? 1 / Math.max(tempNearestDistSq[0], 1e-5) : 1;
  let w1 = count > 1 ? 1 / Math.max(tempNearestDistSq[1], 1e-5) : 0;
  let w2 = count > 2 ? 1 / Math.max(tempNearestDistSq[2], 1e-5) : 0;
  let w3 = count > 3 ? 1 / Math.max(tempNearestDistSq[3], 1e-5) : 0;
  const total = w0 + w1 + w2 + w3;
  if (total > 0) {
    w0 /= total;
    w1 /= total;
    w2 /= total;
    w3 /= total;
  } else w0 = 1;

  return {
    indices: new THREE.Vector4(tempNearestIndices[0], tempNearestIndices[1], tempNearestIndices[2], tempNearestIndices[3]),
    weights: new THREE.Vector4(w0, w1, w2, w3)
  };
}

export function computeSplatBoneBindingArrays(worldCenters, bones) {
  const bonePositions = Array.isArray(bones) ? captureBonePositions(bones) : [];
  const count = Math.max(0, Math.floor((worldCenters?.length ?? 0) / 3));
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    tempCenter.set(worldCenters[offset], worldCenters[offset + 1], worldCenters[offset + 2]);
    const binding = nearestBoneWeights(tempCenter, bonePositions);
    const bindingOffset = index * 4;
    indices[bindingOffset] = binding.indices.x;
    indices[bindingOffset + 1] = binding.indices.y;
    indices[bindingOffset + 2] = binding.indices.z;
    indices[bindingOffset + 3] = binding.indices.w;
    weights[bindingOffset] = binding.weights.x;
    weights[bindingOffset + 1] = binding.weights.y;
    weights[bindingOffset + 2] = binding.weights.z;
    weights[bindingOffset + 3] = binding.weights.w;
  }

  return { indices, weights };
}

export function applyPrecomputedSplatBoneBindings({ skinning, bindingArrays }) {
  const indices = bindingArrays?.indices;
  const weights = bindingArrays?.weights;
  if (!(indices instanceof Uint16Array) || !(weights instanceof Float32Array)) {
    return 0;
  }

  const count = Math.min(Math.floor(indices.length / 4), Math.floor(weights.length / 4));
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    tempIndexVector.set(indices[offset], indices[offset + 1], indices[offset + 2], indices[offset + 3]);
    tempWeightVector.set(weights[offset], weights[offset + 1], weights[offset + 2], weights[offset + 3]);
    skinning.setSplatBones(index, tempIndexVector, tempWeightVector);
  }

  return count;
}

// NEW PROXY ANIMATION
export function bindSplatToBones({ splatMesh, skinning, bones, bindingArrays = null }) {
  if (bindingArrays) {
    return applyPrecomputedSplatBoneBindings({ skinning, bindingArrays });
  }

  if (!splatMesh || typeof splatMesh.forEachSplat !== 'function') {
    return 0;
  }

  const bonePositions = Array.isArray(bones) ? captureBonePositions(bones) : [];
  splatMesh.updateMatrixWorld(true);
  let boundCount = 0;

  splatMesh.forEachSplat((index, center) => {
    tempCenter.copy(center).applyMatrix4(splatMesh.matrixWorld);
    const { indices, weights } = nearestBoneWeights(tempCenter, bonePositions);
    skinning.setSplatBones(index, indices, weights);
    boundCount += 1;
  });

  return boundCount;
}
