import * as THREE from 'three';
import { voxelHash } from '../../viewer/voxelizer';

const DEFAULT_OVERLAP_SCALE = 2.0;
const DEFAULT_MAX_VOXEL_RADIUS = 2;
const tempWorldScale = new THREE.Vector3(1, 1, 1);
const tempWorldCenter = new THREE.Vector3();

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeVoxelOrigin(origin) {
  return {
    x: toFiniteNumber(origin?.x, 0),
    y: toFiniteNumber(origin?.y, 0),
    z: toFiniteNumber(origin?.z, 0)
  };
}

export function composeTransformMatrix(transform = {}) {
  const position = Array.isArray(transform.position) ? transform.position : [0, 0, 0];
  const quaternion = Array.isArray(transform.quaternion) ? transform.quaternion : [0, 0, 0, 1];
  const scale = Array.isArray(transform.scale) ? transform.scale : [1, 1, 1];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      toFiniteNumber(position[0], 0),
      toFiniteNumber(position[1], 0),
      toFiniteNumber(position[2], 0)
    ),
    new THREE.Quaternion(
      toFiniteNumber(quaternion[0], 0),
      toFiniteNumber(quaternion[1], 0),
      toFiniteNumber(quaternion[2], 0),
      toFiniteNumber(quaternion[3], 1)
    ),
    new THREE.Vector3(
      Math.max(1e-6, Math.abs(toFiniteNumber(scale[0], 1))),
      Math.max(1e-6, Math.abs(toFiniteNumber(scale[1], 1))),
      Math.max(1e-6, Math.abs(toFiniteNumber(scale[2], 1)))
    )
  );
}

export function resolveWorldScaleMax(worldMatrix) {
  tempWorldScale.setFromMatrixScale(worldMatrix);
  return Math.max(
    1e-6,
    Math.abs(toFiniteNumber(tempWorldScale.x, 1)),
    Math.abs(toFiniteNumber(tempWorldScale.y, 1)),
    Math.abs(toFiniteNumber(tempWorldScale.z, 1))
  );
}

function overlapsSelectedVoxelKeys({
  selectedKeys,
  centerKeyX,
  centerKeyY,
  centerKeyZ,
  centerWorldX,
  centerWorldY,
  centerWorldZ,
  scales,
  origin,
  resolution,
  worldScaleMax,
  overlapScale,
  maxVoxelRadius
}) {
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
  const minKeyX = Math.floor((centerWorldX - radiusWorld - origin.x) / resolution);
  const minKeyY = Math.floor((centerWorldY - radiusWorld - origin.y) / resolution);
  const minKeyZ = Math.floor((centerWorldZ - radiusWorld - origin.z) / resolution);
  const maxKeyX = Math.floor((centerWorldX + radiusWorld - origin.x) / resolution);
  const maxKeyY = Math.floor((centerWorldY + radiusWorld - origin.y) / resolution);
  const maxKeyZ = Math.floor((centerWorldZ + radiusWorld - origin.z) / resolution);

  if (
    minKeyX === centerKeyX
    && maxKeyX === centerKeyX
    && minKeyY === centerKeyY
    && maxKeyY === centerKeyY
    && minKeyZ === centerKeyZ
    && maxKeyZ === centerKeyZ
  ) {
    return selectedKeys.has(voxelHash(centerKeyX, centerKeyY, centerKeyZ));
  }

  for (let x = minKeyX; x <= maxKeyX; x += 1) {
    for (let y = minKeyY; y <= maxKeyY; y += 1) {
      for (let z = minKeyZ; z <= maxKeyZ; z += 1) {
        if (selectedKeys.has(voxelHash(x, y, z))) {
          return true;
        }
      }
    }
  }

  return false;
}

export function createVoxelOverlapSelector({
  selectedKeys,
  voxelData,
  worldMatrix = new THREE.Matrix4(),
  overlapScale = DEFAULT_OVERLAP_SCALE,
  maxVoxelRadius = DEFAULT_MAX_VOXEL_RADIUS
}) {
  const resolution = Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1));
  const origin = normalizeVoxelOrigin(voxelData?.origin);
  const worldScaleMax = resolveWorldScaleMax(worldMatrix);

  return (center, scales) => {
    tempWorldCenter.copy(center).applyMatrix4(worldMatrix);
    const keyX = Math.floor((tempWorldCenter.x - origin.x) / resolution);
    const keyY = Math.floor((tempWorldCenter.y - origin.y) / resolution);
    const keyZ = Math.floor((tempWorldCenter.z - origin.z) / resolution);
    return overlapsSelectedVoxelKeys({
      selectedKeys,
      centerKeyX: keyX,
      centerKeyY: keyY,
      centerKeyZ: keyZ,
      centerWorldX: tempWorldCenter.x,
      centerWorldY: tempWorldCenter.y,
      centerWorldZ: tempWorldCenter.z,
      scales,
      origin,
      resolution,
      worldScaleMax,
      overlapScale,
      maxVoxelRadius
    });
  };
}
