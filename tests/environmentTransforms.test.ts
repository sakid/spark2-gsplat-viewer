import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { EnvironmentTransforms } from '../src/js/internal/environmentTransforms';

describe('environment transforms', () => {
  test('applies global splat flip flags from captured base transform', () => {
    const splat = new THREE.Object3D();
    splat.position.set(1, 2, 3);
    splat.scale.set(2, 3, 4);
    const transforms = new EnvironmentTransforms();
    transforms.captureSplat(splat);
    transforms.setFlag('flipUpDown', true);
    transforms.setFlag('flipLeftRight', true);
    transforms.applySplat(splat);

    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    expect(splat.position.toArray()).toEqual([1, 2, 3]);
    expect(splat.quaternion.angleTo(flip)).toBeLessThan(1e-6);
    expect(splat.scale.toArray()).toEqual([-2, 3, 4]);
  });

  test('combines global and proxy-specific flags for proxy transforms', () => {
    const proxy = new THREE.Object3D();
    proxy.scale.set(1, 2, 3);
    const transforms = new EnvironmentTransforms();
    transforms.captureProxy(proxy);
    transforms.setFlag('flipUpDown', true);
    transforms.setFlag('proxyFlipUpDown', true);
    transforms.setFlag('flipLeftRight', true);
    transforms.setFlag('proxyMirrorX', true);
    transforms.setFlag('proxyMirrorZ', true);
    transforms.applyProxy(proxy);

    expect(proxy.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    expect(proxy.scale.toArray()).toEqual([1, 2, -3]);
  });
});
