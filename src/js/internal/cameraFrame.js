import * as THREE from 'three';

const tempBox = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const tempDir = new THREE.Vector3();

// NEW PROXY ANIMATION
export function frameCameraToSplat(camera, splatMesh) {
  if (!camera || !splatMesh || typeof splatMesh.getBoundingBox !== 'function') return;
  let box = null;
  try { box = splatMesh.getBoundingBox(false); } catch {}
  if (!box || box.isEmpty()) return;
  tempBox.copy(box);
  tempBox.getCenter(tempCenter);
  tempBox.getSize(tempSize);
  const radius = tempSize.length() * 0.5;
  const fov = Math.max(THREE.MathUtils.degToRad(camera.fov || 60), 0.1);
  const baseDistance = Math.max(radius / Math.tan(fov * 0.5), radius * 1.15, 2);
  const safeFar = Math.max(10, camera.far || 1000);
  const distance = Math.min(baseDistance, safeFar * 0.75);
  tempDir.set(0.4, 0.25, 1).normalize();
  camera.position.copy(tempCenter).addScaledVector(tempDir, distance);
  if (distance > camera.far * 0.7) camera.far = Math.max(camera.far, distance * 2.5);
  camera.near = Math.max(0.01, Math.min(camera.near || 0.1, camera.far / 5000));
  camera.lookAt(tempCenter);
  camera.updateProjectionMatrix?.();
}
