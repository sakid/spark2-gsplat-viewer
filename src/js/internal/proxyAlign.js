import * as THREE from 'three';

const tempBounds = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempProxyBounds = new THREE.Box3();
const tempProxyCenter = new THREE.Vector3();

function getSplatWorldBounds(mesh, out) {
  if (!mesh) return false;
  mesh.updateMatrixWorld(true);

  if (typeof mesh.getBoundingBox === 'function') {
    const bounds = mesh.getBoundingBox(false);
    if (bounds && !bounds.isEmpty()) {
      out.copy(bounds).applyMatrix4(mesh.matrixWorld);
      return !out.isEmpty();
    }
  }

  out.setFromObject(mesh);
  return !out.isEmpty();
}

function getProxyWorldBounds(proxy, out) {
  if (!proxy) return false;
  proxy.updateMatrixWorld(true);
  if (proxy.isInstancedMesh && typeof proxy.computeBoundingBox === 'function') {
    proxy.computeBoundingBox();
    if (proxy.boundingBox) {
      out.copy(proxy.boundingBox).applyMatrix4(proxy.matrixWorld);
      return !out.isEmpty();
    }
  }
  out.setFromObject(proxy);
  return !out.isEmpty();
}

// NEW PROXY ANIMATION
export function computeProxyAlignOffset(splatMesh, proxyRoot, out = new THREE.Vector3()) {
  out.set(0, 0, 0);
  if (!getSplatWorldBounds(splatMesh, tempBounds)) return out;
  if (!getProxyWorldBounds(proxyRoot, tempProxyBounds)) return out;

  tempBounds.getCenter(tempCenter);
  tempProxyBounds.getCenter(tempProxyCenter);
  out.set(
    tempCenter.x - tempProxyCenter.x,
    tempBounds.min.y - tempProxyBounds.min.y,
    tempCenter.z - tempProxyCenter.z
  );
  return out;
}
