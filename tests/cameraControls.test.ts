import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { createEventBus } from '../src/utils/eventBus';

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => {
  class OrbitControlsMock {
    enabled = false;
    enableDamping = false;
    target = new THREE.Vector3();

    update(): void {}

    dispose(): void {}
  }

  return { OrbitControls: OrbitControlsMock };
});

import { CameraControls } from '../src/js/sceneSubjects/CameraControls';

describe('CameraControls', () => {
  test('starts with collisions disabled by default', () => {
    const controls = new CameraControls();
    expect(controls.collisionEnabled).toBe(false);
    expect(controls.resolveOptions.collisionEnabled).toBe(false);
  });

  test('emits player state after init and when collision state changes', async () => {
    const eventBus = createEventBus();
    const events: Array<any> = [];
    eventBus.on('player:stateChanged', (payload) => events.push(payload));

    const controls = new CameraControls();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(1, 2, 3);

    await controls.init({
      eventBus,
      camera,
      renderer: { domElement: {} },
      resolveCameraMovement: (_from: THREE.Vector3, to: THREE.Vector3) => to
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.at(-1)?.collisionEnabled).toBe(false);

    eventBus.emit('controls:collision', 1);
    expect(controls.collisionEnabled).toBe(true);
    expect(events.at(-1)?.collisionEnabled).toBe(true);

    eventBus.emit('controls:collision', 0);
    expect(controls.collisionEnabled).toBe(false);
    expect(events.at(-1)?.collisionEnabled).toBe(false);

    controls.dispose();
  });

  test('focus request frames selected non-camera object', async () => {
    const eventBus = createEventBus();
    const setStatus = vi.fn();
    const controls = new CameraControls();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 10, 10);

    await controls.init({
      eventBus,
      camera,
      renderer: { domElement: {} },
      setStatus,
      resolveCameraMovement: (_from: THREE.Vector3, to: THREE.Vector3) => to
    });

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(0, 0, 0);
    mesh.updateMatrixWorld(true);

    const before = camera.position.clone();
    eventBus.emit('selectionChanged', { uuids: [mesh.uuid], object: mesh });
    eventBus.emit('selection:focusRequested');

    expect(camera.position.equals(before)).toBe(false);
    expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/^Focused /), 'info');

    mesh.geometry.dispose();
    mesh.material.dispose();
    controls.dispose();
  });

  test('focus request with selected camera is a safe no-op', async () => {
    const eventBus = createEventBus();
    const setStatus = vi.fn();
    const controls = new CameraControls();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(2, 2, 2);

    await controls.init({
      eventBus,
      camera,
      renderer: { domElement: {} },
      setStatus,
      resolveCameraMovement: (_from: THREE.Vector3, to: THREE.Vector3) => to
    });

    const before = camera.position.clone();
    eventBus.emit('selectionChanged', { uuids: [camera.uuid], object: camera });
    eventBus.emit('selection:focusRequested');

    expect(camera.position.equals(before)).toBe(true);
    expect(setStatus).toHaveBeenCalledWith('Cannot frame active player camera.', 'warning');
    controls.dispose();
  });
});
