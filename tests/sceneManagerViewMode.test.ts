import { describe, expect, test, vi } from 'vitest';
import { SceneManager } from '../src/js/SceneManager';
import { VoxelSplatActor } from '../src/js/sceneSubjects/VoxelSplatActor';

function createManagerStub() {
  return {
    viewMode: 'full',
    showProxyRequested: true,
    entities: []
  } as unknown as SceneManager;
}

describe('SceneManager view mode proxy visibility', () => {
  test('hides extracted actor proxies when splats-only mode is active', () => {
    const manager = createManagerStub();
    const setProxyVisible = vi.fn();
    const actor = Object.create(VoxelSplatActor.prototype) as VoxelSplatActor;
    actor.setProxyVisible = setProxyVisible;
    manager.entities = [actor];

    SceneManager.prototype.applySceneViewMode.call(manager);
    expect(setProxyVisible).toHaveBeenCalledWith(true);

    manager.viewMode = 'splats-only';
    SceneManager.prototype.applySceneViewMode.call(manager);
    expect(setProxyVisible).toHaveBeenLastCalledWith(false);
  });

  test('hides extracted actor proxies when show-proxy is disabled', () => {
    const manager = createManagerStub();
    const setProxyVisible = vi.fn();
    const actor = Object.create(VoxelSplatActor.prototype) as VoxelSplatActor;
    actor.setProxyVisible = setProxyVisible;
    manager.entities = [actor];

    manager.showProxyRequested = false;
    SceneManager.prototype.applySceneViewMode.call(manager);
    expect(setProxyVisible).toHaveBeenCalledWith(false);
  });
});
