import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { EnvironmentTransforms } from '../src/js/internal/environmentTransforms';

describe('environment transforms', () => {
  test('applies captured splat transform relative to proxy without reparenting', () => {
    const scene = new THREE.Scene();
    const proxy = new THREE.Object3D();
    proxy.position.set(3, -1, 2);
    proxy.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, -0.3));
    proxy.scale.set(1.5, 1.5, 1.5);
    scene.add(proxy);
    proxy.updateMatrixWorld(true);

    const splat = new THREE.Object3D();
    splat.position.set(-2, 4, 1);
    splat.quaternion.setFromEuler(new THREE.Euler(-0.2, 0.6, 0.35));
    splat.scale.set(2, 1.5, 0.8);
    scene.add(splat);
    splat.updateMatrixWorld(true);

    const initialLocal = new THREE.Matrix4()
      .copy(proxy.matrixWorld)
      .invert()
      .multiply(splat.matrixWorld.clone());

    const transforms = new EnvironmentTransforms();
    transforms.captureSplat(splat, proxy);

    proxy.position.set(10, 3, -4);
    proxy.quaternion.setFromEuler(new THREE.Euler(-0.3, 0.4, 0.5));
    proxy.scale.set(0.75, 0.75, 0.75);
    proxy.updateMatrixWorld(true);
    transforms.applySplat(splat, proxy);

    const expectedWorld = new THREE.Matrix4().multiplyMatrices(proxy.matrixWorld, initialLocal);
    const expectedPos = new THREE.Vector3();
    const expectedQuat = new THREE.Quaternion();
    const expectedScale = new THREE.Vector3();
    expectedWorld.decompose(expectedPos, expectedQuat, expectedScale);

    expect(splat.parent).toBe(scene);
    expect(splat.position.distanceTo(expectedPos)).toBeLessThan(1e-6);
    expect(splat.quaternion.angleTo(expectedQuat)).toBeLessThan(1e-6);
    expect(splat.scale.distanceTo(expectedScale)).toBeLessThan(1e-6);
  });

  test('applies splat flip flags in proxy-relative mode', () => {
    const scene = new THREE.Scene();
    const proxy = new THREE.Object3D();
    proxy.position.set(-4, 1, 2);
    proxy.quaternion.setFromEuler(new THREE.Euler(0.25, -0.5, 0.15));
    proxy.scale.set(1.2, 1.2, 1.2);
    scene.add(proxy);
    proxy.updateMatrixWorld(true);

    const splat = new THREE.Object3D();
    splat.position.set(-1, 5, 3);
    splat.quaternion.setFromEuler(new THREE.Euler(0.4, 0.2, -0.1));
    splat.scale.set(1.3, 2.4, 0.7);
    scene.add(splat);
    splat.updateMatrixWorld(true);

    const local = new THREE.Matrix4()
      .copy(proxy.matrixWorld)
      .invert()
      .multiply(splat.matrixWorld.clone());
    const localPos = new THREE.Vector3();
    const localQuat = new THREE.Quaternion();
    const localScale = new THREE.Vector3();
    local.decompose(localPos, localQuat, localScale);

    const transforms = new EnvironmentTransforms();
    transforms.captureSplat(splat, proxy);
    transforms.setFlag('flipUpDown', true);
    transforms.setFlag('flipLeftRight', true);
    transforms.applySplat(splat, proxy);

    const expectedQuat = localQuat.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    );
    const expectedScale = new THREE.Vector3(-Math.abs(localScale.x), Math.abs(localScale.y), Math.abs(localScale.z));
    const expectedLocal = new THREE.Matrix4().compose(localPos, expectedQuat, expectedScale);
    const expectedWorld = new THREE.Matrix4().multiplyMatrices(proxy.matrixWorld, expectedLocal);
    const expectedPosOut = new THREE.Vector3();
    const expectedQuatOut = new THREE.Quaternion();
    const expectedScaleOut = new THREE.Vector3();
    expectedWorld.decompose(expectedPosOut, expectedQuatOut, expectedScaleOut);

    expect(splat.position.distanceTo(expectedPosOut)).toBeLessThan(1e-6);
    expect(splat.quaternion.angleTo(expectedQuatOut)).toBeLessThan(1e-6);
    expect(splat.scale.distanceTo(expectedScaleOut)).toBeLessThan(1e-6);
  });

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

  test('applies proxy auto-alignment scale and quaternion before user toggles', () => {
    const proxy = new THREE.Object3D();
    proxy.scale.set(1, 2, 3);
    const transforms = new EnvironmentTransforms();
    transforms.captureProxy(proxy);
    transforms.setProxyAutoAlignment({
      offset: new THREE.Vector3(4, 5, 6),
      scale: 2,
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5)
    });
    transforms.setFlag('proxyMirrorX', true);
    transforms.applyProxy(proxy);

    expect(proxy.position.toArray()).toEqual([4, 5, 6]);
    expect(proxy.scale.toArray()).toEqual([-2, 4, 6]);
    expect(proxy.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5))).toBeLessThan(1e-6);
  });
});
