import * as THREE from 'three';

const tempBounds = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const tempProxyBounds = new THREE.Box3();
const tempProxyCenter = new THREE.Vector3();
const tempProxySize = new THREE.Vector3();
const tempIntersectionBounds = new THREE.Box3();
const tempOriginalPosition = new THREE.Vector3();
const tempOriginalScale = new THREE.Vector3();
const tempOriginalQuaternion = new THREE.Quaternion();
const tempCandidateQuaternion = new THREE.Quaternion();
const tempProxyUp = new THREE.Vector3();
const tempWorldQuaternion = new THREE.Quaternion();
const tempAnchorWorld = new THREE.Vector3();
const unitY = new THREE.Vector3(0, 1, 0);

const MIN_AXIS = 1e-4;
const MIN_SCALE = 1e-3;
const MAX_SCALE = 1e3;

const EULER_CANDIDATES = [
  [0, 0, 0],
  [0, Math.PI * 0.5, 0],
  [0, Math.PI, 0],
  [0, -Math.PI * 0.5, 0],
  [Math.PI * 0.5, 0, 0],
  [Math.PI * 0.5, Math.PI * 0.5, 0],
  [Math.PI * 0.5, Math.PI, 0],
  [Math.PI * 0.5, -Math.PI * 0.5, 0],
  [-Math.PI * 0.5, 0, 0],
  [-Math.PI * 0.5, Math.PI * 0.5, 0],
  [-Math.PI * 0.5, Math.PI, 0],
  [-Math.PI * 0.5, -Math.PI * 0.5, 0],
  [Math.PI, 0, 0],
  [Math.PI, Math.PI * 0.5, 0],
  [Math.PI, Math.PI, 0],
  [Math.PI, -Math.PI * 0.5, 0]
];

const PROFILE_WEIGHTS = {
  generic: {
    size: 0.5,
    center: 0.2,
    floor: 0.15,
    iou: 0.15,
    upright: 0
  },
  character: {
    size: 0.35,
    center: 0.2,
    floor: 0.15,
    iou: 0.15,
    upright: 0.15
  }
};

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

function getProfile(options) {
  const requested = options?.profile === 'character' ? 'character' : 'generic';
  return PROFILE_WEIGHTS[requested];
}

function getRatios(splatBounds, proxyBounds) {
  splatBounds.getSize(tempSize);
  proxyBounds.getSize(tempProxySize);

  const ratios = {
    x: null,
    y: null,
    z: null,
    list: []
  };

  for (const axis of ['x', 'y', 'z']) {
    const target = tempSize[axis];
    const source = tempProxySize[axis];
    if (target > MIN_AXIS && source > MIN_AXIS) {
      const ratio = target / source;
      ratios[axis] = ratio;
      ratios.list.push(ratio);
    }
  }

  return ratios;
}

function median(values) {
  if (!values.length) return 1;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length * 0.5)];
}

function estimateScaleFactor(splatBounds, proxyBounds, options) {
  const ratios = getRatios(splatBounds, proxyBounds);
  const medianRatio = median(ratios.list);
  if (!ratios.list.length) return 1;

  if (options?.profile !== 'character') {
    return THREE.MathUtils.clamp(medianRatio, MIN_SCALE, MAX_SCALE);
  }

  const ratioY = ratios.y ?? medianRatio;
  const ratioX = ratios.x ?? medianRatio;
  const ratioZ = ratios.z ?? medianRatio;
  const horizontalRatio = Math.sqrt(Math.max(ratioX * ratioZ, MIN_AXIS));
  const blended = ratioY * 0.55 + horizontalRatio * 0.35 + medianRatio * 0.1;
  return THREE.MathUtils.clamp(blended, MIN_SCALE, MAX_SCALE);
}

function getAnchorWorldPosition(anchorNode, out) {
  if (!anchorNode || typeof anchorNode.getWorldPosition !== 'function') return false;
  anchorNode.getWorldPosition(out);
  return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
}

function calculateAlignmentOffset(splatBounds, proxyBounds, options, out) {
  splatBounds.getCenter(tempCenter);
  proxyBounds.getCenter(tempProxyCenter);

  let sourceX = tempProxyCenter.x;
  let sourceZ = tempProxyCenter.z;
  if (getAnchorWorldPosition(options?.anchorNode, tempAnchorWorld)) {
    const blend = THREE.MathUtils.clamp(options?.anchorBlend ?? 0.8, 0, 1);
    sourceX = THREE.MathUtils.lerp(tempProxyCenter.x, tempAnchorWorld.x, blend);
    sourceZ = THREE.MathUtils.lerp(tempProxyCenter.z, tempAnchorWorld.z, blend);
  }

  out.set(
    tempCenter.x - sourceX,
    splatBounds.min.y - proxyBounds.min.y,
    tempCenter.z - sourceZ
  );
  return out;
}

function boxVolume(bounds) {
  bounds.getSize(tempSize);
  return Math.max(tempSize.x, 0) * Math.max(tempSize.y, 0) * Math.max(tempSize.z, 0);
}

function computeIouPenalty(splatBounds, proxyBounds) {
  tempIntersectionBounds.copy(splatBounds).intersect(proxyBounds);
  if (tempIntersectionBounds.isEmpty()) return 1;
  const intersectionVolume = boxVolume(tempIntersectionBounds);
  const unionVolume = boxVolume(splatBounds) + boxVolume(proxyBounds) - intersectionVolume;
  if (!Number.isFinite(unionVolume) || unionVolume <= MIN_AXIS) return 1;
  const iou = THREE.MathUtils.clamp(intersectionVolume / unionVolume, 0, 1);
  return 1 - iou;
}

function computeUprightPenalty(proxyRoot, options) {
  if (!options?.preferUpright) return 0;
  proxyRoot.getWorldQuaternion(tempWorldQuaternion);
  tempProxyUp.copy(unitY).applyQuaternion(tempWorldQuaternion).normalize();
  const upright = Math.abs(tempProxyUp.dot(unitY));
  return 1 - THREE.MathUtils.clamp(upright, 0, 1);
}

function calculateFitScore(splatBounds, proxyBounds, proxyRoot, options) {
  const weights = getProfile(options);
  splatBounds.getCenter(tempCenter);
  proxyBounds.getCenter(tempProxyCenter);
  splatBounds.getSize(tempSize);
  proxyBounds.getSize(tempProxySize);

  let sourceX = tempProxyCenter.x;
  let sourceZ = tempProxyCenter.z;
  if (getAnchorWorldPosition(options?.anchorNode, tempAnchorWorld)) {
    const blend = THREE.MathUtils.clamp(options?.anchorBlend ?? 0.8, 0, 1);
    sourceX = THREE.MathUtils.lerp(tempProxyCenter.x, tempAnchorWorld.x, blend);
    sourceZ = THREE.MathUtils.lerp(tempProxyCenter.z, tempAnchorWorld.z, blend);
  }

  const splatDiag = Math.max(tempSize.length(), MIN_AXIS);
  const sizeError = tempSize.distanceTo(tempProxySize) / splatDiag;
  const centerError = Math.hypot(tempCenter.x - sourceX, tempCenter.z - sourceZ) / splatDiag;
  const floorError = Math.abs(splatBounds.min.y - proxyBounds.min.y) / splatDiag;
  const iouPenalty = computeIouPenalty(splatBounds, proxyBounds);
  const uprightPenalty = computeUprightPenalty(proxyRoot, options);

  return (
    sizeError * weights.size +
    centerError * weights.center +
    floorError * weights.floor +
    iouPenalty * weights.iou +
    uprightPenalty * weights.upright
  );
}

function evaluateCandidate({
  splatBounds,
  proxyRoot,
  candidateQuaternion,
  baseScale,
  options,
  offsetOut
}) {
  proxyRoot.quaternion.copy(candidateQuaternion);
  proxyRoot.scale.copy(baseScale);
  proxyRoot.updateMatrixWorld(true);
  if (!getProxyWorldBounds(proxyRoot, tempProxyBounds)) return null;

  const scale = estimateScaleFactor(splatBounds, tempProxyBounds, options);
  proxyRoot.scale.copy(baseScale).multiplyScalar(scale);
  proxyRoot.updateMatrixWorld(true);
  if (!getProxyWorldBounds(proxyRoot, tempProxyBounds)) return null;

  calculateAlignmentOffset(splatBounds, tempProxyBounds, options, offsetOut);
  proxyRoot.position.add(offsetOut);
  proxyRoot.updateMatrixWorld(true);
  if (!getProxyWorldBounds(proxyRoot, tempProxyBounds)) return null;

  const score = calculateFitScore(splatBounds, tempProxyBounds, proxyRoot, options);
  return { score, scale };
}

function createRotationCandidates() {
  return EULER_CANDIDATES.map(([x, y, z]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ')));
}

const ROTATION_CANDIDATES = createRotationCandidates();
const tempOffset = new THREE.Vector3();

export function computeProxyAlignment(splatMesh, proxyRoot, options = {}) {
  const result = {
    offset: new THREE.Vector3(),
    scale: 1,
    quaternion: new THREE.Quaternion(),
    score: Number.POSITIVE_INFINITY
  };

  if (!getSplatWorldBounds(splatMesh, tempBounds)) return result;
  if (!getProxyWorldBounds(proxyRoot, tempProxyBounds)) return result;

  tempOriginalPosition.copy(proxyRoot.position);
  tempOriginalQuaternion.copy(proxyRoot.quaternion);
  tempOriginalScale.copy(proxyRoot.scale);

  for (const rotationDelta of ROTATION_CANDIDATES) {
    proxyRoot.position.copy(tempOriginalPosition);
    tempCandidateQuaternion.copy(tempOriginalQuaternion).multiply(rotationDelta);

    const candidate = evaluateCandidate({
      splatBounds: tempBounds,
      proxyRoot,
      candidateQuaternion: tempCandidateQuaternion,
      baseScale: tempOriginalScale,
      options,
      offsetOut: tempOffset
    });

    if (!candidate) continue;
    if (candidate.score >= result.score) continue;

    result.score = candidate.score;
    result.scale = candidate.scale;
    result.quaternion.copy(rotationDelta);
    result.offset.copy(proxyRoot.position).sub(tempOriginalPosition);
  }

  proxyRoot.position.copy(tempOriginalPosition);
  proxyRoot.quaternion.copy(tempOriginalQuaternion);
  proxyRoot.scale.copy(tempOriginalScale);
  proxyRoot.updateMatrixWorld(true);

  return result;
}

// NEW PROXY ANIMATION
export function computeProxyAlignOffset(splatMesh, proxyRoot, out = new THREE.Vector3()) {
  const alignment = computeProxyAlignment(splatMesh, proxyRoot);
  out.copy(alignment.offset);
  return out;
}
