import * as THREE from 'three';
import { colliderIntersectsSphere } from './bvh';

const tempSphere = new THREE.Sphere();
const tempMin = new THREE.Vector3();
const tempMax = new THREE.Vector3();
const tempCandidate = new THREE.Vector3();
const tempLifted = new THREE.Vector3();

function isVoxelColliding(position, voxelData, radius = 0.22, height = 1.3, ignoreGround = false) {
  if (!voxelData || voxelData.occupiedKeys.size === 0) {
    return false;
  }

  const skin = Math.max(0.01, radius * 0.25);
  const groundIgnoreOffset = ignoreGround ? Math.max(skin * 2, voxelData.resolution * 0.2) : 0;
  const minWorldY = position.y - height + skin + groundIgnoreOffset;
  const maxWorldY = position.y - skin;
  tempMin.set(position.x - radius, minWorldY, position.z - radius);
  tempMax.set(position.x + radius, maxWorldY, position.z + radius);

  const origin = voxelData.origin;
  const step = voxelData.resolution;
  const minX = Math.floor((tempMin.x - origin.x) / step);
  const minY = Math.floor((tempMin.y - origin.y) / step);
  const minZ = Math.floor((tempMin.z - origin.z) / step);
  const maxX = Math.floor((tempMax.x - origin.x) / step);
  const maxY = Math.floor((tempMax.y - origin.y) / step);
  const maxZ = Math.floor((tempMax.z - origin.z) / step);

  for (let z = minZ; z <= maxZ; z += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (voxelData.occupiedKeys.has(`${x},${y},${z}`)) {
          return true;
        }
      }
    }
  }
  return false;
}

function intersectsMeshColliders(position, colliders, radius, height) {
  tempSphere.center.set(position.x, position.y - height * 0.5, position.z);
  tempSphere.radius = radius;
  for (const mesh of colliders) {
    if (colliderIntersectsSphere(mesh, tempSphere.center, tempSphere.radius)) {
      return true;
    }
  }
  return false;
}

function canOccupy(position, { colliders, voxelData, radius, height }, ignoreGround = false) {
  if (intersectsMeshColliders(position, colliders, radius, height)) {
    return false;
  }
  return !isVoxelColliding(position, voxelData, radius, height, ignoreGround);
}

function tryUnstuckUp(position, query) {
  if (canOccupy(position, query)) {
    return true;
  }
  const step = Math.max(0.05, query.voxelData?.resolution ?? 0.2);
  const maxLift = Math.max(0.4, step * 10);
  for (let lift = step; lift <= maxLift + 1e-3; lift += step) {
    tempLifted.copy(position);
    tempLifted.y += lift;
    if (canOccupy(tempLifted, query)) {
      position.copy(tempLifted);
      return true;
    }
  }
  return false;
}

// NEW PROXY ANIMATION
export function resolveCameraMovement({ from, to, out, colliders, voxelData, radius = 0.22, height = 1.3 }) {
  const resolved = out ? out.copy(from) : from.clone();
  const query = { colliders, voxelData, radius, height };
  const stepHeight = Math.max(0.08, Math.min(0.45, (voxelData?.resolution ?? radius) * 0.75));

  tryUnstuckUp(resolved, query);

  const moveAxis = (axis, value, ignoreGround = false) => {
    tempCandidate.copy(resolved);
    tempCandidate[axis] = value;
    if (canOccupy(tempCandidate, query, ignoreGround)) {
      resolved.copy(tempCandidate);
      return;
    }
    if (axis === 'y') {
      return;
    }
    tempLifted.copy(tempCandidate);
    tempLifted.y += stepHeight;
    if (canOccupy(tempLifted, query)) {
      resolved.copy(tempLifted);
    }
  };

  moveAxis('x', to.x, true);
  moveAxis('z', to.z, true);
  moveAxis('y', to.y, false);

  if (!canOccupy(resolved, query)) {
    resolved.copy(from);
    tryUnstuckUp(resolved, query);
  }

  return resolved;
}
