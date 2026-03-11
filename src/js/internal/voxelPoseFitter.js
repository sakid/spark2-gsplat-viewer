import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tempVectorA = new THREE.Vector3();
const tempVectorB = new THREE.Vector3();
const tempVectorC = new THREE.Vector3();
const tempVectorD = new THREE.Vector3();
const tempQuaternionA = new THREE.Quaternion();
const tempQuaternionB = new THREE.Quaternion();
const tempMatrixA = new THREE.Matrix4();
const FIT_TARGET_COUNT = 17;

function parseVoxelKey(key) {
  const [xRaw, yRaw, zRaw] = String(key).split(',');
  return [Number(xRaw) || 0, Number(yRaw) || 0, Number(zRaw) || 0];
}

function voxelCenterFromKey(key, resolution, origin, out) {
  const [ix, iy, iz] = parseVoxelKey(key);
  out.set(
    origin.x + (ix + 0.5) * resolution,
    origin.y + (iy + 0.5) * resolution,
    origin.z + (iz + 0.5) * resolution
  );
  return out;
}

function pointsFromVoxelData(voxelData) {
  const points = [];
  const resolution = Math.max(1e-6, Number(voxelData?.resolution) || 1);
  const origin = voxelData?.origin ?? new THREE.Vector3(0, 0, 0);
  const center = new THREE.Vector3();
  for (const key of voxelData?.occupiedKeys ?? []) {
    points.push(voxelCenterFromKey(key, resolution, origin, center.clone()));
  }
  return points;
}

function pointsInYRange(points, minY, maxY) {
  return points.filter((point) => point.y >= minY && point.y <= maxY);
}

function pickClosestPoint(points, fallback, target) {
  if (!points.length) return fallback?.clone?.() ?? null;
  let best = points[0];
  let bestDistSq = points[0].distanceToSquared(target);
  for (let i = 1; i < points.length; i += 1) {
    const distSq = points[i].distanceToSquared(target);
    if (distSq < bestDistSq) {
      best = points[i];
      bestDistSq = distSq;
    }
  }
  return best.clone();
}

function sideCoordinate(point, lateralAxis) {
  return point.dot(lateralAxis);
}

function selectSideExtreme(points, lateralAxis, leftSign, side, fallback) {
  if (!points.length) return fallback?.clone?.() ?? null;
  const sideMultiplier = side === 'left' ? leftSign : -leftSign;
  let best = points[0];
  let bestValue = sideCoordinate(best, lateralAxis) * sideMultiplier;
  for (let i = 1; i < points.length; i += 1) {
    const value = sideCoordinate(points[i], lateralAxis) * sideMultiplier;
    if (value > bestValue) {
      best = points[i];
      bestValue = value;
    }
  }
  return best.clone();
}

function computeHorizontalAxis(points, minY, maxY) {
  const upper = pointsInYRange(points, minY + (maxY - minY) * 0.58, minY + (maxY - minY) * 0.9);
  const source = upper.length >= 8 ? upper : points;
  if (source.length < 2) {
    return new THREE.Vector3(1, 0, 0);
  }

  let meanX = 0;
  let meanZ = 0;
  for (const point of source) {
    meanX += point.x;
    meanZ += point.z;
  }
  meanX /= source.length;
  meanZ /= source.length;

  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const point of source) {
    const dx = point.x - meanX;
    const dz = point.z - meanZ;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }

  const trace = xx + zz;
  const det = xx * zz - xz * xz;
  const discriminant = Math.max(trace * trace - 4 * det, 0);
  const lambda = 0.5 * (trace + Math.sqrt(discriminant));

  let vx = xz;
  let vz = lambda - xx;
  if (Math.abs(vx) + Math.abs(vz) < 1e-6) {
    vx = lambda - zz;
    vz = xz;
  }
  if (Math.abs(vx) + Math.abs(vz) < 1e-6) {
    vx = 1;
    vz = 0;
  }

  const lateral = new THREE.Vector3(vx, 0, vz);
  if (lateral.lengthSq() < 1e-8) {
    lateral.set(1, 0, 0);
  } else {
    lateral.normalize();
  }
  return lateral;
}

function guessLeftSign(bones, lateralAxis) {
  const left = bones.leftShoulder ?? bones.leftArm ?? bones.leftUpLeg;
  const right = bones.rightShoulder ?? bones.rightArm ?? bones.rightUpLeg;
  if (!left || !right) return 1;
  const leftCoord = sideCoordinate(left.getWorldPosition(tempVectorA), lateralAxis);
  const rightCoord = sideCoordinate(right.getWorldPosition(tempVectorB), lateralAxis);
  const delta = leftCoord - rightCoord;
  if (Math.abs(delta) < 1e-5) return 1;
  return Math.sign(delta);
}

function extractLandmarks(voxelData, bones) {
  const points = pointsFromVoxelData(voxelData);
  if (points.length < 12) {
    return null;
  }

  const bounds = new THREE.Box3();
  bounds.setFromPoints(points);
  if (bounds.isEmpty()) return null;
  const minY = bounds.min.y;
  const maxY = bounds.max.y;
  const height = Math.max(maxY - minY, Number(voxelData?.resolution) || 0.1);

  const lateralAxis = computeHorizontalAxis(points, minY, maxY);
  const forwardAxis = tempVectorC.crossVectors(WORLD_UP, lateralAxis).normalize();
  const leftSign = guessLeftSign(bones, lateralAxis);

  const shoulderSlice = pointsInYRange(points, minY + height * 0.6, minY + height * 0.86);
  const hipSlice = pointsInYRange(points, minY + height * 0.38, minY + height * 0.62);
  const armSlice = pointsInYRange(points, minY + height * 0.34, minY + height * 0.9);
  const legSlice = pointsInYRange(points, minY + height * 0.04, minY + height * 0.64);
  const footSlice = pointsInYRange(points, minY, minY + height * 0.28);
  const headSlice = pointsInYRange(points, minY + height * 0.84, maxY + 1e-6);

  const fallbackCenter = bounds.getCenter(new THREE.Vector3());
  const leftShoulder = selectSideExtreme(shoulderSlice, lateralAxis, leftSign, 'left', fallbackCenter);
  const rightShoulder = selectSideExtreme(shoulderSlice, lateralAxis, leftSign, 'right', fallbackCenter);
  const leftHip = selectSideExtreme(hipSlice, lateralAxis, leftSign, 'left', fallbackCenter);
  const rightHip = selectSideExtreme(hipSlice, lateralAxis, leftSign, 'right', fallbackCenter);
  const leftHand = selectSideExtreme(armSlice, lateralAxis, leftSign, 'left', leftShoulder);
  const rightHand = selectSideExtreme(armSlice, lateralAxis, leftSign, 'right', rightShoulder);
  const leftFoot = selectSideExtreme(footSlice, lateralAxis, leftSign, 'left', leftHip);
  const rightFoot = selectSideExtreme(footSlice, lateralAxis, leftSign, 'right', rightHip);
  const headTop = headSlice.length
    ? headSlice.reduce((best, point) => (point.y > best.y ? point : best), headSlice[0]).clone()
    : new THREE.Vector3(fallbackCenter.x, maxY, fallbackCenter.z);

  const hipsCenter = leftHip.clone().add(rightHip).multiplyScalar(0.5);
  const shouldersCenter = leftShoulder.clone().add(rightShoulder).multiplyScalar(0.5);
  const chestCenter = shouldersCenter.clone().lerp(hipsCenter, 0.32);
  const neck = shouldersCenter.clone().lerp(headTop, 0.22);
  const spineBase = hipsCenter.clone().lerp(chestCenter, 0.38);
  const midSpine = hipsCenter.clone().lerp(chestCenter, 0.68);

  const leftArmPoints = armSlice.filter((point) => sideCoordinate(point, lateralAxis) * leftSign >= sideCoordinate(hipsCenter, lateralAxis) * leftSign);
  const rightArmPoints = armSlice.filter((point) => sideCoordinate(point, lateralAxis) * -leftSign >= sideCoordinate(hipsCenter, lateralAxis) * -leftSign);
  const leftLegPoints = legSlice.filter((point) => sideCoordinate(point, lateralAxis) * leftSign >= sideCoordinate(hipsCenter, lateralAxis) * leftSign);
  const rightLegPoints = legSlice.filter((point) => sideCoordinate(point, lateralAxis) * -leftSign >= sideCoordinate(hipsCenter, lateralAxis) * -leftSign);

  const leftElbowTarget = leftShoulder.clone().lerp(leftHand, 0.52);
  const rightElbowTarget = rightShoulder.clone().lerp(rightHand, 0.52);
  const leftKneeTarget = leftHip.clone().lerp(leftFoot, 0.52);
  const rightKneeTarget = rightHip.clone().lerp(rightFoot, 0.52);

  const leftElbow = pickClosestPoint(leftArmPoints, leftElbowTarget, leftElbowTarget);
  const rightElbow = pickClosestPoint(rightArmPoints, rightElbowTarget, rightElbowTarget);
  const leftKnee = pickClosestPoint(leftLegPoints, leftKneeTarget, leftKneeTarget);
  const rightKnee = pickClosestPoint(rightLegPoints, rightKneeTarget, rightKneeTarget);

  const footLift = height * 0.03;
  const leftAnkle = leftFoot.clone().addScaledVector(WORLD_UP, footLift);
  const rightAnkle = rightFoot.clone().addScaledVector(WORLD_UP, footLift);
  const toeStep = Math.max((Number(voxelData?.resolution) || 0.1) * 1.2, height * 0.06);
  const leftToe = leftFoot.clone().addScaledVector(forwardAxis, toeStep).addScaledVector(WORLD_UP, footLift * 0.5);
  const rightToe = rightFoot.clone().addScaledVector(forwardAxis, toeStep).addScaledVector(WORLD_UP, footLift * 0.5);

  return {
    bounds,
    height,
    lateralAxis: lateralAxis.clone(),
    forwardAxis: forwardAxis.clone(),
    leftSign,
    hipsCenter,
    spineBase,
    midSpine,
    chestCenter,
    neck,
    head: headTop.clone().lerp(neck, 0.28),
    headTop,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHand,
    rightHand,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftFoot,
    rightFoot,
    leftToe,
    rightToe
  };
}

function boneWorldPosition(bone, out) {
  if (!bone) return null;
  return bone.getWorldPosition(out);
}

function setBoneWorldPosition(bone, worldPosition) {
  if (!bone || !worldPosition) return false;
  if (!bone.parent) {
    bone.position.copy(worldPosition);
    bone.updateMatrixWorld(true);
    return true;
  }
  bone.parent.updateMatrixWorld(true);
  tempMatrixA.copy(bone.parent.matrixWorld).invert();
  tempVectorA.copy(worldPosition).applyMatrix4(tempMatrixA);
  bone.position.copy(tempVectorA);
  bone.updateMatrixWorld(true);
  return true;
}

function alignBoneTowardTarget(bone, child, targetWorld, stiffness = 1) {
  if (!bone || !child || !targetWorld) return false;
  bone.updateMatrixWorld(true);
  child.updateMatrixWorld(true);

  const bonePos = boneWorldPosition(bone, tempVectorA);
  const childPos = boneWorldPosition(child, tempVectorB);
  const currentDir = tempVectorC.copy(childPos).sub(bonePos);
  const desiredDir = tempVectorD.copy(targetWorld).sub(bonePos);
  if (currentDir.lengthSq() < 1e-8 || desiredDir.lengthSq() < 1e-8) {
    return false;
  }
  currentDir.normalize();
  desiredDir.normalize();

  tempQuaternionA.setFromUnitVectors(currentDir, desiredDir);
  const boneWorldQuaternion = bone.getWorldQuaternion(tempQuaternionB);
  const targetWorldQuaternion = tempQuaternionA.multiply(boneWorldQuaternion);
  const parentWorldQuaternion = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  const parentInverse = parentWorldQuaternion.invert();
  const targetLocalQuaternion = targetWorldQuaternion.premultiply(parentInverse);

  const blend = THREE.MathUtils.clamp(stiffness, 0, 1);
  bone.quaternion.slerp(targetLocalQuaternion, blend);
  bone.updateMatrixWorld(true);
  return true;
}

function findBoneByPatterns(bones, patterns) {
  const list = Array.isArray(bones) ? bones : [];
  for (const pattern of patterns) {
    const exact = list.find((bone) => pattern.exact.test(bone?.name || ''));
    if (exact) return exact;
  }
  for (const pattern of patterns) {
    const partial = list.find((bone) => pattern.partial.test(bone?.name || ''));
    if (partial) return partial;
  }
  return null;
}

function mapHumanoidBones(bones) {
  return {
    hips: findBoneByPatterns(bones, [
      { exact: /(^|:)hips$/i, partial: /hips/i }
    ]),
    spine: findBoneByPatterns(bones, [
      { exact: /(^|:)spine$/i, partial: /spine$/i }
    ]),
    spine1: findBoneByPatterns(bones, [
      { exact: /(^|:)spine1$/i, partial: /spine1/i }
    ]),
    spine2: findBoneByPatterns(bones, [
      { exact: /(^|:)spine2$/i, partial: /spine2/i }
    ]),
    neck: findBoneByPatterns(bones, [
      { exact: /(^|:)neck$/i, partial: /neck/i }
    ]),
    head: findBoneByPatterns(bones, [
      { exact: /(^|:)head$/i, partial: /head$/i }
    ]),
    leftShoulder: findBoneByPatterns(bones, [
      { exact: /(^|:)leftshoulder$/i, partial: /leftshoulder/i }
    ]),
    rightShoulder: findBoneByPatterns(bones, [
      { exact: /(^|:)rightshoulder$/i, partial: /rightshoulder/i }
    ]),
    leftArm: findBoneByPatterns(bones, [
      { exact: /(^|:)leftarm$/i, partial: /leftarm$/i }
    ]),
    rightArm: findBoneByPatterns(bones, [
      { exact: /(^|:)rightarm$/i, partial: /rightarm$/i }
    ]),
    leftForeArm: findBoneByPatterns(bones, [
      { exact: /(^|:)leftforearm$/i, partial: /leftforearm/i }
    ]),
    rightForeArm: findBoneByPatterns(bones, [
      { exact: /(^|:)rightforearm$/i, partial: /rightforearm/i }
    ]),
    leftHand: findBoneByPatterns(bones, [
      { exact: /(^|:)lefthand$/i, partial: /lefthand$/i }
    ]),
    rightHand: findBoneByPatterns(bones, [
      { exact: /(^|:)righthand$/i, partial: /righthand$/i }
    ]),
    leftUpLeg: findBoneByPatterns(bones, [
      { exact: /(^|:)leftupleg$/i, partial: /leftupleg/i }
    ]),
    rightUpLeg: findBoneByPatterns(bones, [
      { exact: /(^|:)rightupleg$/i, partial: /rightupleg/i }
    ]),
    leftLeg: findBoneByPatterns(bones, [
      { exact: /(^|:)leftleg$/i, partial: /leftleg$/i }
    ]),
    rightLeg: findBoneByPatterns(bones, [
      { exact: /(^|:)rightleg$/i, partial: /rightleg$/i }
    ]),
    leftFoot: findBoneByPatterns(bones, [
      { exact: /(^|:)leftfoot$/i, partial: /leftfoot$/i }
    ]),
    rightFoot: findBoneByPatterns(bones, [
      { exact: /(^|:)rightfoot$/i, partial: /rightfoot$/i }
    ]),
    leftToe: findBoneByPatterns(bones, [
      { exact: /(^|:)lefttoebase$/i, partial: /lefttoe/i }
    ]),
    rightToe: findBoneByPatterns(bones, [
      { exact: /(^|:)righttoebase$/i, partial: /righttoe/i }
    ])
  };
}

function applyLandmarksToBones(landmarks, bones, options = {}) {
  const stiffness = THREE.MathUtils.clamp(Number(options.stiffness) || 0.9, 0.1, 1);
  const moveHips = Boolean(options.moveHips);
  const mapped = mapHumanoidBones(bones);
  let appliedCount = 0;

  if (moveHips && mapped.hips && landmarks.hipsCenter) {
    if (setBoneWorldPosition(mapped.hips, landmarks.hipsCenter)) {
      appliedCount += 1;
    }
  }

  if (alignBoneTowardTarget(mapped.hips, mapped.spine, landmarks.spineBase, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.spine, mapped.spine1, landmarks.midSpine, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.spine1, mapped.spine2, landmarks.chestCenter, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.spine2, mapped.neck, landmarks.neck, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.neck, mapped.head, landmarks.head, stiffness)) appliedCount += 1;

  if (alignBoneTowardTarget(mapped.leftShoulder, mapped.leftArm, landmarks.leftElbow, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.leftArm, mapped.leftForeArm, landmarks.leftElbow, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.leftForeArm, mapped.leftHand, landmarks.leftHand, stiffness)) appliedCount += 1;

  if (alignBoneTowardTarget(mapped.rightShoulder, mapped.rightArm, landmarks.rightElbow, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.rightArm, mapped.rightForeArm, landmarks.rightElbow, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.rightForeArm, mapped.rightHand, landmarks.rightHand, stiffness)) appliedCount += 1;

  if (alignBoneTowardTarget(mapped.leftUpLeg, mapped.leftLeg, landmarks.leftKnee, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.leftLeg, mapped.leftFoot, landmarks.leftAnkle, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.leftFoot, mapped.leftToe, landmarks.leftToe, stiffness)) appliedCount += 1;

  if (alignBoneTowardTarget(mapped.rightUpLeg, mapped.rightLeg, landmarks.rightKnee, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.rightLeg, mapped.rightFoot, landmarks.rightAnkle, stiffness)) appliedCount += 1;
  if (alignBoneTowardTarget(mapped.rightFoot, mapped.rightToe, landmarks.rightToe, stiffness)) appliedCount += 1;

  return {
    mapped,
    appliedCount
  };
}

function computeFitError(landmarks, mapped) {
  const pairs = [
    ['leftHand', mapped.leftHand],
    ['rightHand', mapped.rightHand],
    ['leftFoot', mapped.leftFoot],
    ['rightFoot', mapped.rightFoot],
    ['head', mapped.head],
    ['leftKnee', mapped.leftLeg],
    ['rightKnee', mapped.rightLeg],
    ['leftElbow', mapped.leftForeArm],
    ['rightElbow', mapped.rightForeArm]
  ];
  let total = 0;
  let count = 0;
  for (const [name, bone] of pairs) {
    const target = landmarks[name];
    if (!target || !bone) continue;
    const world = bone.getWorldPosition(tempVectorA);
    total += world.distanceTo(target);
    count += 1;
  }
  return {
    count,
    meanError: count > 0 ? total / count : Number.POSITIVE_INFINITY
  };
}

export function fitHumanoidRigToVoxelData({ voxelData, bones, stiffness = 0.9 } = {}) {
  if (!voxelData || !Array.isArray(bones) || bones.length < 1) {
    return {
      applied: false,
      reason: 'missing-input'
    };
  }

  const landmarks = extractLandmarks(voxelData, mapHumanoidBones(bones));
  if (!landmarks) {
    return {
      applied: false,
      reason: 'insufficient-voxel-landmarks'
    };
  }

  const moveHips = false;
  const applied = applyLandmarksToBones(landmarks, bones, { stiffness, moveHips });
  const error = computeFitError(landmarks, applied.mapped);
  const fitTargetCount = FIT_TARGET_COUNT + (moveHips ? 1 : 0);
  const coverage = THREE.MathUtils.clamp(applied.appliedCount / fitTargetCount, 0, 1);

  return {
    applied: applied.appliedCount > 0,
    reason: applied.appliedCount > 0 ? '' : 'no-bone-matches',
    appliedCount: applied.appliedCount,
    coverage,
    meanError: error.meanError,
    sampleCount: error.count,
    landmarks
  };
}
