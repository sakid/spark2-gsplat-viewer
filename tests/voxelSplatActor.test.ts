import { describe, expect, test, vi } from 'vitest';
import { VoxelSplatActor } from '../src/js/sceneSubjects/VoxelSplatActor';

describe('VoxelSplatActor', () => {
  test('setProxyVisible toggles voxel runtime visibility and hides bones in splats-only mode', () => {
    const actor = new VoxelSplatActor();
    const setVisible = vi.fn();
    const setBonesVisible = vi.fn();

    actor.voxelRuntime = {
      setVisible,
      setBonesVisible
    };

    actor.setProxyVisible(false);
    expect(setVisible).toHaveBeenCalledWith(false);
    expect(setBonesVisible).toHaveBeenCalledWith(false);

    actor.setProxyVisible(true);
    expect(setVisible).toHaveBeenCalledWith(true);
  });

  test('setPoseMode(t-pose) pauses external animation and restores bind pose', () => {
    const actor = new VoxelSplatActor();
    const setPlaying = vi.fn();
    const setSpeed = vi.fn();
    const playClip = vi.fn();
    const pose = vi.fn();
    const update = vi.fn();

    actor.activeClipIndex = 1;
    actor.walkSpeed = 1;
    actor.externalRuntime = {
      animator: {
        playing: true,
        speed: 1.25,
        setPlaying,
        setSpeed,
        playClip
      },
      asset: {
        skinnedMeshes: [{ skeleton: { pose } }]
      },
      update
    } as any;

    actor.setPoseMode('t-pose');

    expect(setPlaying).toHaveBeenCalledWith(false);
    expect(setSpeed).toHaveBeenCalledWith(0);
    expect(playClip).not.toHaveBeenCalled();
    expect(pose).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(0);
    expect(actor.poseMode).toBe('t-pose');
  });

  test('setPoseMode(walk) resumes external walk animation from saved state', () => {
    const actor = new VoxelSplatActor();
    const setPlaying = vi.fn();
    const setSpeed = vi.fn();
    const playClip = vi.fn();
    const update = vi.fn();

    actor.activeClipIndex = 0;
    actor.walkSpeed = 1;
    actor.walkStateBeforeTPose = {
      clipIndex: 1,
      speed: 1.5,
      playing: true
    };
    actor.externalRuntime = {
      clipNames: ['Idle', 'Walk'],
      animator: {
        setPlaying,
        setSpeed,
        playClip
      },
      update
    } as any;

    actor.setPoseMode('walk');

    expect(setSpeed).toHaveBeenCalledWith(1.5);
    expect(playClip).toHaveBeenCalledWith(1);
    expect(setPlaying).toHaveBeenCalledWith(true);
    expect(update).toHaveBeenCalledWith(0);
    expect(actor.activeClipIndex).toBe(1);
    expect(actor.poseMode).toBe('walk');
  });

  test('getFocusBoundingBox derives actor framing bounds from voxel subset', () => {
    const actor = new VoxelSplatActor({
      voxelData: {
        occupiedKeys: new Set(['0,0,0', '1,2,1']),
        resolution: 0.5,
        origin: { x: 1, y: 2, z: 3 }
      } as any
    });

    const first = actor.getFocusBoundingBox();
    const second = actor.getFocusBoundingBox();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    expect(first?.min.x).toBeCloseTo(1);
    expect(first?.min.y).toBeCloseTo(2);
    expect(first?.min.z).toBeCloseTo(3);
    expect(first?.max.x).toBeCloseTo(2);
    expect(first?.max.y).toBeCloseTo(3.5);
    expect(first?.max.z).toBeCloseTo(4);
  });
});
