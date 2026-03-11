import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';
import { ExternalProxyRuntime } from '../src/js/internal/externalProxyRuntime';

describe('external proxy runtime visibility', () => {
  test('keeps container visible for attached splat when proxy mesh is hidden', () => {
    const runtime = new ExternalProxyRuntime({
      context: {},
      owner: 'test-owner'
    });
    const container = new THREE.Group();
    const proxyRoot = new THREE.Group();
    const splatMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const setDebugVisual = vi.fn();

    container.add(proxyRoot);
    container.add(splatMesh);
    runtime.container = container;
    runtime.asset = {
      root: proxyRoot,
      setDebugVisual
    };
    runtime.deformTarget = splatMesh;
    runtime.meshVisible = false;
    runtime.bonesVisible = false;

    runtime.updateVisibility();

    expect(proxyRoot.visible).toBe(false);
    expect(container.visible).toBe(true);
    expect(setDebugVisual).toHaveBeenCalledWith(false);
  });

  test('hides container when nothing visual is enabled', () => {
    const runtime = new ExternalProxyRuntime({
      context: {},
      owner: 'test-owner'
    });
    const container = new THREE.Group();
    const proxyRoot = new THREE.Group();
    const setDebugVisual = vi.fn();

    container.add(proxyRoot);
    runtime.container = container;
    runtime.asset = {
      root: proxyRoot,
      setDebugVisual
    };
    runtime.deformTarget = null;
    runtime.meshVisible = false;
    runtime.bonesVisible = false;

    runtime.updateVisibility();

    expect(proxyRoot.visible).toBe(false);
    expect(container.visible).toBe(false);
    expect(setDebugVisual).toHaveBeenCalledWith(false);
  });
});
