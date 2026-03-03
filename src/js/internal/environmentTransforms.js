import * as THREE from 'three';

const unitX = new THREE.Vector3(1, 0, 0);
const tempQuat = new THREE.Quaternion();
const tempQuatB = new THREE.Quaternion();
const tempPos = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempParentInv = new THREE.Matrix4();
const tempParentToMesh = new THREE.Matrix4();
const tempWorld = new THREE.Matrix4();
const flipQuat = new THREE.Quaternion();

function captureBaseTransform(object) {
  if (!object) return null;
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: new THREE.Vector3(Math.abs(object.scale.x) || 1, Math.abs(object.scale.y) || 1, Math.abs(object.scale.z) || 1)
  };
}

function applyFlipQuaternion(quaternion) {
  flipQuat.setFromAxisAngle(unitX, Math.PI);
  quaternion.multiply(flipQuat);
}

function captureRelativeTransform(object, parent) {
  if (!object) return null;
  if (!parent) return captureBaseTransform(object);
  parent.updateMatrixWorld(true);
  object.updateMatrixWorld(true);
  tempParentInv.copy(parent.matrixWorld).invert();
  tempParentToMesh.multiplyMatrices(tempParentInv, object.matrixWorld);
  tempParentToMesh.decompose(tempPos, tempQuatB, tempScale);
  return {
    position: tempPos.clone(),
    quaternion: tempQuatB.clone(),
    scale: new THREE.Vector3(Math.abs(tempScale.x) || 1, Math.abs(tempScale.y) || 1, Math.abs(tempScale.z) || 1)
  };
}

// NEW PROXY ANIMATION
export class EnvironmentTransforms {
  constructor() {
    this.flipUpDown = false;
    this.flipLeftRight = false;
    this.proxyFlipUpDown = false;
    this.proxyMirrorX = false;
    this.proxyMirrorZ = false;
    this.splatBase = null;
    this.proxyBase = null;
    this.proxyAlignOffset = new THREE.Vector3();
    this.proxyAlignScale = 1;
    this.proxyAlignQuaternion = new THREE.Quaternion();
  }

  setFlag(flag, enabled) {
    if (!(flag in this)) return;
    this[flag] = Boolean(enabled);
  }

  captureSplat(mesh, parent = null) {
    this.splatBase = captureRelativeTransform(mesh, parent);
  }

  captureProxy(proxy) {
    this.proxyBase = captureBaseTransform(proxy);
  }

  clearSplat() {
    this.splatBase = null;
  }

  clearProxy() {
    this.proxyBase = null;
    this.proxyAlignOffset.set(0, 0, 0);
    this.proxyAlignScale = 1;
    this.proxyAlignQuaternion.identity();
  }

  setProxyAutoAlignment({ offset, scale, quaternion } = {}) {
    this.proxyAlignOffset.copy(offset ?? new THREE.Vector3());
    this.proxyAlignScale = Number.isFinite(scale) ? Math.max(scale, 1e-4) : 1;
    if (quaternion instanceof THREE.Quaternion) this.proxyAlignQuaternion.copy(quaternion);
    else this.proxyAlignQuaternion.identity();
  }

  applySplat(mesh, parent = null) {
    if (!mesh || !this.splatBase) return;
    tempQuat.copy(this.splatBase.quaternion);
    if (this.flipUpDown) applyFlipQuaternion(tempQuat);
    tempScale.copy(this.splatBase.scale);
    if (this.flipLeftRight) tempScale.x = -tempScale.x;
    if (!parent) {
      mesh.position.copy(this.splatBase.position);
      mesh.quaternion.copy(tempQuat);
      mesh.scale.copy(tempScale);
      mesh.updateMatrixWorld(true);
      return;
    }
    parent.updateMatrixWorld(true);
    tempParentToMesh.compose(this.splatBase.position, tempQuat, tempScale);
    tempWorld.multiplyMatrices(parent.matrixWorld, tempParentToMesh);
    if (mesh.parent) {
      mesh.parent.updateMatrixWorld(true);
      tempParentInv.copy(mesh.parent.matrixWorld).invert();
      tempParentToMesh.multiplyMatrices(tempParentInv, tempWorld);
      tempParentToMesh.decompose(mesh.position, mesh.quaternion, mesh.scale);
    } else {
      tempWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    }
    mesh.updateMatrixWorld(true);
  }

  applyProxy(proxy) {
    if (!proxy || !this.proxyBase) return;
    tempQuat.copy(this.proxyBase.quaternion);
    tempQuat.multiply(this.proxyAlignQuaternion);
    if (this.proxyFlipUpDown) applyFlipQuaternion(tempQuat);
    if (this.flipUpDown) applyFlipQuaternion(tempQuat);
    proxy.position.copy(this.proxyBase.position).add(this.proxyAlignOffset);
    proxy.quaternion.copy(tempQuat);
    proxy.scale.copy(this.proxyBase.scale).multiplyScalar(this.proxyAlignScale);
    if (this.proxyMirrorX) proxy.scale.x = -proxy.scale.x;
    if (this.proxyMirrorZ) proxy.scale.z = -proxy.scale.z;
    if (this.flipLeftRight) proxy.scale.x = -proxy.scale.x;
    proxy.updateMatrixWorld(true);
  }

  apply(splatMesh, proxyRoot) {
    this.applySplat(splatMesh);
    this.applyProxy(proxyRoot);
  }
}
