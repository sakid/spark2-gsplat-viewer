import * as THREE from 'three';

const tempPos = new THREE.Vector3();
const tempBone = new THREE.Vector3();

function readVertexIndex(attribute, index, slot) {
  if (!attribute) return 0;
  if (slot === 0) return attribute.getX(index);
  if (slot === 1) return attribute.getY(index);
  if (slot === 2) return attribute.getZ(index);
  return attribute.getW(index);
}

function readVertexWeight(attribute, index, slot) {
  if (!attribute) return slot === 0 ? 1 : 0;
  if (slot === 0) return attribute.getX(index);
  if (slot === 1) return attribute.getY(index);
  if (slot === 2) return attribute.getZ(index);
  return attribute.getW(index);
}

function dominantBoneForVertex(skinIndex, skinWeight, vertex) {
  let bestBone = 0;
  let bestWeight = -1;
  for (let slot = 0; slot < 4; slot += 1) {
    const weight = readVertexWeight(skinWeight, vertex, slot);
    if (weight <= bestWeight) continue;
    bestWeight = weight;
    bestBone = readVertexIndex(skinIndex, vertex, slot);
  }
  return bestBone;
}

// NEW PROXY ANIMATION
export function createBoneColliderSet(skinnedMesh) {
  if (!skinnedMesh?.skeleton || !skinnedMesh.geometry) return null;
  const geometry = skinnedMesh.geometry;
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  if (!position || !skinIndex || !skinWeight) return null;

  skinnedMesh.updateMatrixWorld(true);
  const bones = skinnedMesh.skeleton.bones;
  const radii = new Float32Array(bones.length);
  const seen = new Uint8Array(bones.length);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    tempPos.fromBufferAttribute(position, vertex).applyMatrix4(skinnedMesh.matrixWorld);
    const boneIndex = Math.max(0, Math.min(bones.length - 1, dominantBoneForVertex(skinIndex, skinWeight, vertex)));
    bones[boneIndex].getWorldPosition(tempBone);
    const distance = tempPos.distanceTo(tempBone);
    radii[boneIndex] = Math.max(radii[boneIndex], distance);
    seen[boneIndex] = 1;
  }

  const colliders = [];
  for (let i = 0; i < bones.length; i += 1) {
    if (!seen[i]) continue;
    colliders.push({
      bone: bones[i],
      center: new THREE.Vector3(),
      radius: Math.max(0.05, radii[i] || 0.1)
    });
  }

  return {
    type: 'bone-spheres',
    source: skinnedMesh,
    colliders,
    update() {
      for (const item of colliders) item.bone.getWorldPosition(item.center);
      return colliders;
    }
  };
}
