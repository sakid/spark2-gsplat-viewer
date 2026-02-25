import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { computeProxyAlignment } from '../src/js/internal/proxyAlign';

function worldBounds(object: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  object.updateMatrixWorld(true);
  bounds.setFromObject(object);
  return bounds;
}

describe('proxy alignment', () => {
  test('returns scale and offset that match proxy bounds to splat bounds', () => {
    const splat = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 8));
    splat.position.set(12, 2, -6);

    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
    proxy.position.set(-3, -8, 1);

    const alignment = computeProxyAlignment(splat, proxy);

    proxy.quaternion.multiply(alignment.quaternion);
    proxy.scale.multiplyScalar(alignment.scale);
    proxy.position.add(alignment.offset);

    const splatBounds = worldBounds(splat);
    const proxyBounds = worldBounds(proxy);
    const splatCenter = splatBounds.getCenter(new THREE.Vector3());
    const proxyCenter = proxyBounds.getCenter(new THREE.Vector3());
    const splatSize = splatBounds.getSize(new THREE.Vector3());
    const proxySize = proxyBounds.getSize(new THREE.Vector3());

    expect(alignment.scale).toBeCloseTo(2, 3);
    expect(proxyCenter.x).toBeCloseTo(splatCenter.x, 3);
    expect(proxyCenter.z).toBeCloseTo(splatCenter.z, 3);
    expect(proxyBounds.min.y).toBeCloseTo(splatBounds.min.y, 3);
    expect(proxySize.distanceTo(splatSize)).toBeLessThan(1e-3);
  });

  test('can correct axis mismatch by choosing a rotation candidate', () => {
    const splat = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 8));
    splat.position.set(5, 1.5, 3);

    const proxy = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 4));
    proxy.position.set(-2, -1, -4);

    const alignment = computeProxyAlignment(splat, proxy);
    proxy.quaternion.multiply(alignment.quaternion);
    proxy.scale.multiplyScalar(alignment.scale);
    proxy.position.add(alignment.offset);

    const splatBounds = worldBounds(splat);
    const proxyBounds = worldBounds(proxy);
    const splatSize = splatBounds.getSize(new THREE.Vector3());
    const proxySize = proxyBounds.getSize(new THREE.Vector3());

    expect(proxySize.distanceTo(splatSize)).toBeLessThan(1e-3);
    expect(proxyBounds.min.y).toBeCloseTo(splatBounds.min.y, 3);
    expect(proxyBounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(splatBounds.getCenter(new THREE.Vector3()).x, 3);
    expect(proxyBounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(splatBounds.getCenter(new THREE.Vector3()).z, 3);
  });

  test('uses anchor node to improve center alignment for character rigs', () => {
    const splat = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3));
    splat.position.set(15, 3, -4);

    const proxy = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3));
    body.position.set(2.5, 0, 0);
    proxy.add(body);

    const hips = new THREE.Object3D();
    hips.position.set(0, 0, 0);
    proxy.add(hips);

    proxy.position.set(-10, 0, 10);

    const alignment = computeProxyAlignment(splat, proxy, {
      profile: 'character',
      anchorNode: hips,
      anchorBlend: 1,
      preferUpright: true
    });

    proxy.quaternion.multiply(alignment.quaternion);
    proxy.scale.multiplyScalar(alignment.scale);
    proxy.position.add(alignment.offset);
    proxy.updateMatrixWorld(true);

    const splatCenter = worldBounds(splat).getCenter(new THREE.Vector3());
    const hipsWorld = hips.getWorldPosition(new THREE.Vector3());

    expect(hipsWorld.x).toBeCloseTo(splatCenter.x, 3);
    expect(hipsWorld.z).toBeCloseTo(splatCenter.z, 3);
  });

  test('preferUpright penalizes tilted solutions', () => {
    const splat = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    proxy.rotation.x = Math.PI * 0.5;
    proxy.updateMatrixWorld(true);

    const alignment = computeProxyAlignment(splat, proxy, {
      profile: 'character',
      preferUpright: true
    });

    const finalQuat = proxy.quaternion.clone().multiply(alignment.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(finalQuat).normalize();
    expect(Math.abs(up.y)).toBeGreaterThan(0.9);
  });
});
