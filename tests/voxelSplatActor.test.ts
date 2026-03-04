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
});
