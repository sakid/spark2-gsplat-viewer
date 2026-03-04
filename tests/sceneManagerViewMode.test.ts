import { describe, expect, test, vi } from 'vitest';
import { SceneManager } from '../src/js/SceneManager';
import { VoxelSplatActor } from '../src/js/sceneSubjects/VoxelSplatActor';

function createManagerStub() {
  return {
    viewMode: 'full',
    showProxyRequested: true,
    actorPoseModeRequested: 'walk',
    entities: [],
    normalizeActorPoseMode: SceneManager.prototype.normalizeActorPoseMode,
    findSelectedVoxelActor: SceneManager.prototype.findSelectedVoxelActor,
    getPrimarySelectedObject: () => null
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

  test('applies actor pose mode to latest extracted actor when none is selected', () => {
    const manager = createManagerStub();
    const setStatus = vi.fn();
    (manager as any).setStatus = setStatus;
    (manager as any).getPrimarySelectedObject = () => null;
    const actorA = Object.create(VoxelSplatActor.prototype) as VoxelSplatActor;
    actorA.setPoseMode = vi.fn();
    const actorB = Object.create(VoxelSplatActor.prototype) as VoxelSplatActor;
    actorB.setPoseMode = vi.fn();
    manager.entities = [actorA, actorB];

    const changed = SceneManager.prototype.applyActorPoseMode.call(manager, 't-pose');
    expect(changed).toBe(1);
    expect(actorA.setPoseMode).not.toHaveBeenCalled();
    expect(actorB.setPoseMode).toHaveBeenCalledWith('t-pose');
    expect(manager.actorPoseModeRequested).toBe('t-pose');
    expect(setStatus).toHaveBeenCalledWith('Extracted actor switched to T-pose.', 'success');
  });

  test('applies actor pose mode to selected extracted actor', () => {
    const manager = createManagerStub();
    (manager as any).setStatus = vi.fn();
    const actorA = Object.create(VoxelSplatActor.prototype) as VoxelSplatActor;
    actorA.setPoseMode = vi.fn();
    actorA.root = { uuid: 'actor-root-a', parent: null } as any;
    const actorB = Object.create(VoxelSplatActor.prototype) as VoxelSplatActor;
    actorB.setPoseMode = vi.fn();
    actorB.root = { uuid: 'actor-root-b', parent: null } as any;
    manager.entities = [actorA, actorB];

    const selectedChild = { parent: actorA.root };
    (manager as any).getPrimarySelectedObject = () => selectedChild;
    SceneManager.prototype.applyActorPoseMode.call(manager, 'walk', { silent: true });

    expect(actorA.setPoseMode).toHaveBeenCalledWith('walk');
    expect(actorB.setPoseMode).not.toHaveBeenCalled();
  });
});
