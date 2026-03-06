import { describe, expect, test, vi } from 'vitest';
import { createEventBus } from '../src/utils/eventBus.js';

function createMockSceneManager(eventBus: ReturnType<typeof createEventBus>) {
  const state = {
    defaultWalkingSceneBootstrapped: false,
    generateVoxelCalls: 0,
    splatMesh: null as unknown,
    disposed: false,
  };

  const findEnvironmentEntity = () => ({
    splatMesh: state.splatMesh,
  });

  const bootstrapDefaultWalkingSceneIfNeeded = () => {
    if (state.defaultWalkingSceneBootstrapped) return;
    const environment = findEnvironmentEntity();
    if (!environment?.splatMesh) return;
    state.defaultWalkingSceneBootstrapped = true;
    eventBus.emit('environment:generateVoxel');
  };

  return {
    state,
    bootstrapDefaultWalkingSceneIfNeeded,
    setSplatMesh: (mesh: unknown) => {
      state.splatMesh = mesh;
    },
  };
}

describe('defaultWalkingSceneBootstrap', () => {
  test('does not bootstrap when splat is not loaded', () => {
    const eventBus = createEventBus();
    const manager = createMockSceneManager(eventBus);

    const generateVoxelHandler = vi.fn();
    eventBus.on('environment:generateVoxel', generateVoxelHandler);

    manager.bootstrapDefaultWalkingSceneIfNeeded();

    expect(generateVoxelHandler).not.toHaveBeenCalled();
    expect(manager.state.defaultWalkingSceneBootstrapped).toBe(false);
  });

  test('bootstraps when splat is loaded', () => {
    const eventBus = createEventBus();
    const manager = createMockSceneManager(eventBus);

    manager.setSplatMesh({ name: 'test-splat' });

    const generateVoxelHandler = vi.fn();
    eventBus.on('environment:generateVoxel', generateVoxelHandler);

    manager.bootstrapDefaultWalkingSceneIfNeeded();

    expect(generateVoxelHandler).toHaveBeenCalledTimes(1);
    expect(manager.state.defaultWalkingSceneBootstrapped).toBe(true);
  });

  test('does not bootstrap twice', () => {
    const eventBus = createEventBus();
    const manager = createMockSceneManager(eventBus);

    manager.setSplatMesh({ name: 'test-splat' });

    const generateVoxelHandler = vi.fn();
    eventBus.on('environment:generateVoxel', generateVoxelHandler);

    manager.bootstrapDefaultWalkingSceneIfNeeded();
    manager.bootstrapDefaultWalkingSceneIfNeeded();

    expect(generateVoxelHandler).toHaveBeenCalledTimes(1);
  });

  test('re-triggers on environment:splatLoaded event', () => {
    const eventBus = createEventBus();
    const manager = createMockSceneManager(eventBus);

    const generateVoxelHandler = vi.fn();
    eventBus.on('environment:generateVoxel', generateVoxelHandler);

    manager.bootstrapDefaultWalkingSceneIfNeeded();
    expect(generateVoxelHandler).not.toHaveBeenCalled();

    manager.setSplatMesh({ name: 'test-splat' });

    eventBus.emit('environment:splatLoaded', { name: 'test-splat' });
    manager.bootstrapDefaultWalkingSceneIfNeeded();

    expect(generateVoxelHandler).toHaveBeenCalledTimes(1);
  });
});
