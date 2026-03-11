import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { fitHumanoidRigToVoxelData } from '../src/js/internal/voxelPoseFitter';

function createVoxelData() {
  const keys = new Set<string>();

  for (let y = 0; y <= 10; y += 1) {
    keys.add(`0,${y},0`);
  }

  keys.add('1,7,0');
  keys.add('2,7,0');
  keys.add('-1,7,0');
  keys.add('-2,7,0');

  keys.add('3,6,1');
  keys.add('3,5,1');
  keys.add('3,4,1');
  keys.add('-3,6,1');
  keys.add('-3,5,1');
  keys.add('-3,4,1');

  keys.add('1,4,0');
  keys.add('-1,4,0');
  keys.add('1,3,0');
  keys.add('1,2,0');
  keys.add('1,1,0');
  keys.add('1,0,1');
  keys.add('-1,3,0');
  keys.add('-1,2,0');
  keys.add('-1,1,0');
  keys.add('-1,0,1');

  return {
    resolution: 1,
    origin: new THREE.Vector3(0, 0, 0),
    occupiedKeys: keys
  };
}

function createBone(name: string, parent: THREE.Bone | THREE.Group | null, position: [number, number, number]) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(position[0], position[1], position[2]);
  if (parent) parent.add(bone);
  return bone;
}

function createMixamoLikeBones() {
  const root = new THREE.Group();
  const hips = createBone('mixamorig:Hips', root, [0, 4, 0]);
  const spine = createBone('mixamorig:Spine', hips, [0, 0.8, 0]);
  const spine1 = createBone('mixamorig:Spine1', spine, [0, 0.8, 0]);
  const spine2 = createBone('mixamorig:Spine2', spine1, [0, 0.8, 0]);
  const neck = createBone('mixamorig:Neck', spine2, [0, 0.5, 0]);
  const head = createBone('mixamorig:Head', neck, [0, 0.5, 0]);

  const leftShoulder = createBone('mixamorig:LeftShoulder', spine2, [0.35, 0.2, 0]);
  const leftArm = createBone('mixamorig:LeftArm', leftShoulder, [0.6, 0, 0]);
  const leftForeArm = createBone('mixamorig:LeftForeArm', leftArm, [0.6, 0, 0]);
  const leftHand = createBone('mixamorig:LeftHand', leftForeArm, [0.4, 0, 0]);

  const rightShoulder = createBone('mixamorig:RightShoulder', spine2, [-0.35, 0.2, 0]);
  const rightArm = createBone('mixamorig:RightArm', rightShoulder, [-0.6, 0, 0]);
  const rightForeArm = createBone('mixamorig:RightForeArm', rightArm, [-0.6, 0, 0]);
  const rightHand = createBone('mixamorig:RightHand', rightForeArm, [-0.4, 0, 0]);

  const leftUpLeg = createBone('mixamorig:LeftUpLeg', hips, [0.32, -0.9, 0]);
  const leftLeg = createBone('mixamorig:LeftLeg', leftUpLeg, [0, -1.1, 0]);
  const leftFoot = createBone('mixamorig:LeftFoot', leftLeg, [0, -1.0, 0.2]);
  const leftToe = createBone('mixamorig:LeftToeBase', leftFoot, [0, 0, 0.3]);

  const rightUpLeg = createBone('mixamorig:RightUpLeg', hips, [-0.32, -0.9, 0]);
  const rightLeg = createBone('mixamorig:RightLeg', rightUpLeg, [0, -1.1, 0]);
  const rightFoot = createBone('mixamorig:RightFoot', rightLeg, [0, -1.0, 0.2]);
  const rightToe = createBone('mixamorig:RightToeBase', rightFoot, [0, 0, 0.3]);

  root.updateMatrixWorld(true);

  return {
    root,
    bones: [
      hips,
      spine,
      spine1,
      spine2,
      neck,
      head,
      leftShoulder,
      leftArm,
      leftForeArm,
      leftHand,
      rightShoulder,
      rightArm,
      rightForeArm,
      rightHand,
      leftUpLeg,
      leftLeg,
      leftFoot,
      leftToe,
      rightUpLeg,
      rightLeg,
      rightFoot,
      rightToe
    ],
    leftShoulder,
    leftForeArm
  };
}

describe('voxel pose fitter', () => {
  test('fits mixamo-like bones to voxel landmarks from a non-T-pose person cloud', () => {
    const voxelData = createVoxelData();
    const skeleton = createMixamoLikeBones();

    const beforeForeArmWorld = skeleton.leftForeArm.getWorldPosition(new THREE.Vector3());
    const beforeShoulderWorld = skeleton.leftShoulder.getWorldPosition(new THREE.Vector3());
    const beforeArmDirection = beforeForeArmWorld.clone().sub(beforeShoulderWorld).normalize();

    const result = fitHumanoidRigToVoxelData({
      voxelData,
      bones: skeleton.bones,
      stiffness: 1
    });
    skeleton.root.updateMatrixWorld(true);

    const afterForeArmWorld = skeleton.leftForeArm.getWorldPosition(new THREE.Vector3());
    const afterShoulderWorld = skeleton.leftShoulder.getWorldPosition(new THREE.Vector3());
    const afterArmDirection = afterForeArmWorld.clone().sub(afterShoulderWorld).normalize();

    expect(result.applied).toBe(true);
    expect(result.appliedCount).toBeGreaterThanOrEqual(12);
    expect(result.coverage).toBeGreaterThan(0.65);
    expect(Number.isFinite(result.meanError)).toBe(true);
    expect(beforeForeArmWorld.distanceTo(afterForeArmWorld)).toBeGreaterThan(0.05);
    expect(Math.abs(beforeArmDirection.y)).toBeLessThan(0.02);
    expect(Math.abs(afterArmDirection.y)).toBeGreaterThan(0.05);
  });

  test('returns a missing-input reason when inputs are invalid', () => {
    const result = fitHumanoidRigToVoxelData({
      voxelData: null,
      bones: []
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('missing-input');
  });
});
