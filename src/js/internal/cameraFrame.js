import * as THREE from 'three';

const tempBox = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const tempDir = new THREE.Vector3();
const tempWorldPosition = new THREE.Vector3();

function applyFrame(camera, center, radius, direction = tempDir) {
  const safeRadius = Math.max(radius, 0.2);
  const fov = Math.max(THREE.MathUtils.degToRad(camera.fov || 60), 0.1);
  const baseDistance = Math.max(safeRadius / Math.tan(fov * 0.5), safeRadius * 1.15, 2);
  const safeFar = Math.max(10, camera.far || 1000);
  const distance = Math.min(baseDistance, safeFar * 0.75);
  direction.set(0.4, 0.25, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  if (distance > camera.far * 0.7) camera.far = Math.max(camera.far, distance * 2.5);
  camera.near = Math.max(0.01, Math.min(camera.near || 0.1, camera.far / 5000));
  camera.lookAt(center);
  camera.updateProjectionMatrix?.();
  return center.clone();
}

// NEW PROXY ANIMATION
export function frameCameraToSplat(camera, splatMesh) {
  if (!camera || !splatMesh || typeof splatMesh.getBoundingBox !== 'function') return null;
  let box = null;
  try { box = splatMesh.getBoundingBox(false); } catch {}
  if (!box || box.isEmpty()) return null;
  tempBox.copy(box);
  tempBox.getCenter(tempCenter);
  tempBox.getSize(tempSize);
  const radius = tempSize.length() * 0.5;
  return applyFrame(camera, tempCenter, radius);
}

export function frameCameraToObject(camera, object) {
  if (!camera || !object) return null;

  if (typeof object.getBoundingBox === 'function') {
    const splatCenter = frameCameraToSplat(camera, object);
    if (splatCenter) return splatCenter;
  }

  object.updateMatrixWorld?.(true);
  tempBox.setFromObject(object);

  if (tempBox.isEmpty()) {
    object.getWorldPosition?.(tempWorldPosition);
    return applyFrame(camera, tempWorldPosition, 1);
  }

  tempBox.getCenter(tempCenter);
  tempBox.getSize(tempSize);
  const radius = Math.max(tempSize.length() * 0.5, 0.75);
  return applyFrame(camera, tempCenter, radius);
}
