import * as THREE from 'three';
import {
  STANDARD_HUMANOID_RIG_FILE_NAME,
  STANDARD_HUMANOID_RIG_PRESET,
  STANDARD_HUMANOID_RIG_URL
} from './actorCacheShared';

const STANDARD_RIG_FETCH_TIMEOUT_MS = 15000;
let standardHumanoidRigFilePromise = null;

export {
  STANDARD_HUMANOID_RIG_FILE_NAME,
  STANDARD_HUMANOID_RIG_PRESET,
  STANDARD_HUMANOID_RIG_URL
};

async function fetchAssetAsFileWithTimeout(url, fallbackName, timeoutMs = STANDARD_RIG_FETCH_TIMEOUT_MS) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) {
      throw new Error(`Asset fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    const rawName = String(url || '').split('/').pop() || fallbackName || 'asset.bin';
    return new File([blob], rawName, { type: blob.type || 'application/octet-stream' });
  } finally {
    clearTimeout(timer);
  }
}

export async function getStandardHumanoidRigFile() {
  if (!standardHumanoidRigFilePromise) {
    standardHumanoidRigFilePromise = fetchAssetAsFileWithTimeout(STANDARD_HUMANOID_RIG_URL, STANDARD_HUMANOID_RIG_FILE_NAME);
  }

  try {
    return await standardHumanoidRigFilePromise;
  } catch (error) {
    standardHumanoidRigFilePromise = null;
    throw error;
  }
}

export function serializeBoneLocalTransforms(bones) {
  if (!Array.isArray(bones)) return [];
  return bones.map((bone, index) => ({
    index,
    name: typeof bone?.name === 'string' ? bone.name : '',
    position: [
      Number(bone?.position?.x) || 0,
      Number(bone?.position?.y) || 0,
      Number(bone?.position?.z) || 0
    ],
    quaternion: [
      Number(bone?.quaternion?.x) || 0,
      Number(bone?.quaternion?.y) || 0,
      Number(bone?.quaternion?.z) || 0,
      Number(bone?.quaternion?.w) || 1
    ],
    scale: [
      Number(bone?.scale?.x) || 1,
      Number(bone?.scale?.y) || 1,
      Number(bone?.scale?.z) || 1
    ]
  }));
}

export function applyBoneLocalTransforms(bones, serialized) {
  if (!Array.isArray(bones) || !Array.isArray(serialized)) return 0;
  let applied = 0;
  for (const entry of serialized) {
    const index = Math.max(0, Math.floor(Number(entry?.index) || 0));
    const bone = bones[index] ?? null;
    if (!bone) continue;
    const position = Array.isArray(entry?.position) ? entry.position : [0, 0, 0];
    const quaternion = Array.isArray(entry?.quaternion) ? entry.quaternion : [0, 0, 0, 1];
    const scale = Array.isArray(entry?.scale) ? entry.scale : [1, 1, 1];
    bone.position.set(Number(position[0]) || 0, Number(position[1]) || 0, Number(position[2]) || 0);
    bone.quaternion.set(
      Number(quaternion[0]) || 0,
      Number(quaternion[1]) || 0,
      Number(quaternion[2]) || 0,
      Number(quaternion[3]) || 1
    );
    bone.scale.set(Number(scale[0]) || 1, Number(scale[1]) || 1, Number(scale[2]) || 1);
    bone.updateMatrixWorld(true);
    applied += 1;
  }
  return applied;
}

export function serializeAlignment(alignment) {
  return {
    offset: [
      Number(alignment?.offset?.x) || 0,
      Number(alignment?.offset?.y) || 0,
      Number(alignment?.offset?.z) || 0
    ],
    quaternion: [
      Number(alignment?.quaternion?.x) || 0,
      Number(alignment?.quaternion?.y) || 0,
      Number(alignment?.quaternion?.z) || 0,
      Number(alignment?.quaternion?.w) || 1
    ],
    scale: Math.max(1e-6, Number(alignment?.scale) || 1)
  };
}

export function applyAlignment(root, alignment) {
  if (!root || !alignment) return;
  const offset = Array.isArray(alignment.offset) ? alignment.offset : [0, 0, 0];
  const quaternion = Array.isArray(alignment.quaternion) ? alignment.quaternion : [0, 0, 0, 1];
  root.quaternion.multiply(new THREE.Quaternion(
    Number(quaternion[0]) || 0,
    Number(quaternion[1]) || 0,
    Number(quaternion[2]) || 0,
    Number(quaternion[3]) || 1
  ));
  root.scale.multiplyScalar(Math.max(1e-6, Number(alignment.scale) || 1));
  root.position.add(new THREE.Vector3(
    Number(offset[0]) || 0,
    Number(offset[1]) || 0,
    Number(offset[2]) || 0
  ));
  root.updateMatrixWorld(true);
}
