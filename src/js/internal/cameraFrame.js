import * as THREE from 'three';

const tempBox = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const tempDir = new THREE.Vector3();
const tempWorldPosition = new THREE.Vector3();

const FRAMING_DIRECTIONS = [
  new THREE.Vector3(0.4, 0.25, 1).normalize(),
  new THREE.Vector3(0, 0.25, 1).normalize(),
  new THREE.Vector3(0.4, 0, 1).normalize(),
  new THREE.Vector3(1, 0.25, 0.4).normalize(),
  new THREE.Vector3(-0.4, 0.25, 1).normalize(),
];

function applyFrame(camera, center, radius, options = {}) {
  const safeRadius = Math.max(radius, 0.2);
  const fov = Math.max(THREE.MathUtils.degToRad(camera.fov || 60), 0.1);
  const baseDistance = Math.max(safeRadius / Math.tan(fov * 0.5), safeRadius * 1.15, 2);
  const safeFar = Math.max(10, camera.far || 1000);
  const distance = Math.min(baseDistance, safeFar * 0.75);

  const directionIndex = Math.max(0, Math.min(FRAMING_DIRECTIONS.length - 1, Number(options.directionIndex) || 0));
  const direction = FRAMING_DIRECTIONS[directionIndex].clone();

  camera.position.copy(center).addScaledVector(direction, distance);

  if (distance > camera.far * 0.7) {
    camera.far = Math.max(camera.far, distance * 2.5);
  }
  camera.near = Math.max(0.01, Math.min(camera.near || 0.1, camera.far / 5000));
  camera.lookAt(center);
  camera.updateProjectionMatrix?.();

  return { center: center.clone(), radius: safeRadius, distance };
}

function computeRobustBounds(splatMesh, voxelBounds = null) {
  if (!splatMesh) {
    return null;
  }

  if (voxelBounds && !voxelBounds.isEmpty()) {
    const voxelSize = new THREE.Vector3();
    voxelBounds.getSize(voxelSize);
    const voxelCenter = new THREE.Vector3();
    voxelBounds.getCenter(voxelCenter);

    const splatBox = getSplatBoundingBox(splatMesh);
    if (splatBox && !splatBox.isEmpty()) {
      const splatSize = new THREE.Vector3();
      splatBox.getSize(splatSize);
      const splatRadius = splatSize.length() * 0.5;

      const voxelRadius = voxelSize.length() * 0.5;
      const blendedRadius = Math.max(voxelRadius, splatRadius * 0.5);

      tempBox.copy(voxelBounds);
      tempBox.expandByScalar(blendedRadius * 0.1);

      return {
        box: tempBox.clone(),
        center: voxelCenter.clone(),
        radius: blendedRadius
      };
    }

    return {
      box: voxelBounds.clone(),
      center: voxelCenter,
      radius: voxelSize.length() * 0.5
    };
  }

  const splatBox = getSplatBoundingBox(splatMesh);
  if (splatBox && !splatBox.isEmpty()) {
    const size = new THREE.Vector3();
    splatBox.getSize(size);
    const center = new THREE.Vector3();
    splatBox.getCenter(center);

    return {
      box: splatBox.clone(),
      center,
      radius: size.length() * 0.5
    };
  }

  return null;
}

function getSplatBoundingBox(splatMesh) {
  if (!splatMesh) return null;

  if (typeof splatMesh.getBoundingBox === 'function') {
    try {
      const box = splatMesh.getBoundingBox(false);
      if (box && !box.isEmpty()) {
        return box;
      }
    } catch {}
  }

  if (splatMesh.boundingBox && !splatMesh.boundingBox.isEmpty()) {
    return splatMesh.boundingBox;
  }

  if (typeof splatMesh.geometry?.boundingBox !== 'undefined') {
    const geoBox = splatMesh.geometry.boundingBox;
    if (geoBox && !geoBox.isEmpty()) {
      return geoBox;
    }
  }

  return null;
}

export function frameCameraToSplat(camera, splatMesh, options = {}) {
  if (!camera || !splatMesh) return null;

  const bounds = computeRobustBounds(splatMesh, options.voxelBounds || null);
  if (!bounds) {
    if (typeof splatMesh.getWorldPosition === 'function') {
      splatMesh.getWorldPosition(tempWorldPosition);
      return applyFrame(camera, tempWorldPosition, 1, options);
    }
    return null;
  }

  return applyFrame(camera, bounds.center, bounds.radius, options);
}

export function frameCameraToObject(camera, object, options = {}) {
  if (!camera || !object) return null;

  if (typeof object.getBoundingBox === 'function') {
    const splatResult = frameCameraToSplat(camera, object, options);
    if (splatResult) return splatResult;
  }

  if (object.getFocusBoundingBox) {
    const focusBox = object.getFocusBoundingBox();
    if (focusBox && !focusBox.isEmpty()) {
      const size = new THREE.Vector3();
      focusBox.getSize(size);
      const center = new THREE.Vector3();
      focusBox.getCenter(center);
      return applyFrame(camera, center, size.length() * 0.5, options);
    }
  }

  object.updateMatrixWorld?.(true);
  tempBox.setFromObject(object);

  if (tempBox.isEmpty()) {
    object.getWorldPosition?.(tempWorldPosition);
    return applyFrame(camera, tempWorldPosition, 1, options);
  }

  tempBox.getCenter(tempCenter);
  tempBox.getSize(tempSize);
  const radius = Math.max(tempSize.length() * 0.5, 0.75);

  return applyFrame(camera, tempCenter, radius, options);
}

export function frameCameraToVoxelData(camera, voxelData, options = {}) {
  if (!camera || !voxelData) return null;

  const occupiedKeys = voxelData.occupiedKeys;
  if (!occupiedKeys || occupiedKeys.size === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const key of occupiedKeys) {
    const [xRaw, yRaw, zRaw] = String(key).split(',');
    const x = Number(xRaw) || 0;
    const y = Number(yRaw) || 0;
    const z = Number(zRaw) || 0;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + 1);
    maxY = Math.max(maxY, y + 1);
    maxZ = Math.max(maxZ, z + 1);
  }

  const resolution = Math.max(1e-6, Number(voxelData.resolution) || 1);
  const origin = voxelData.origin || { x: 0, y: 0, z: 0 };

  const min = new THREE.Vector3(
    origin.x + minX * resolution,
    origin.y + minY * resolution,
    origin.z + minZ * resolution
  );
  const max = new THREE.Vector3(
    origin.x + maxX * resolution,
    origin.y + maxY * resolution,
    origin.z + maxZ * resolution
  );

  const box = new THREE.Box3(min, max);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  return applyFrame(camera, center, size.length() * 0.5, options);
}

export { computeRobustBounds, getSplatBoundingBox };
