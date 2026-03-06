import { describe, expect, test, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

function createMockCamera(fov = 60) {
  return {
    fov,
    near: 0.1,
    far: 1000,
    aspect: 16 / 9,
    position: new THREE.Vector3(),
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn()
  };
}

function createMockSplatMesh(bounds) {
  return {
    getBoundingBox: vi.fn((world) => bounds ? bounds.clone() : null),
    boundingBox: bounds ? bounds.clone() : null,
    getWorldPosition: (target) => target.set(0, 0, 0)
  };
}

function createVoxelData(occupiedKeys, resolution = 1, origin = { x: 0, y: 0, z: 0 }) {
  return {
    occupiedKeys: new Set(occupiedKeys),
    resolution,
    origin
  };
}

describe('cameraFrame', () => {
  describe('frameCameraToSplat', () => {
    test('returns null for null camera', () => {
      const { frameCameraToSplat } = require('../src/js/internal/cameraFrame.js');
      const result = frameCameraToSplat(null, { getBoundingBox: () => new THREE.Box3() });
      expect(result).toBeNull();
    });

    test('returns null for null splatMesh', () => {
      const { frameCameraToSplat } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const result = frameCameraToSplat(camera, null);
      expect(result).toBeNull();
    });

    test('frames splat mesh with valid bounding box', () => {
      const { frameCameraToSplat } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const bounds = new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(1, 1, 1)
      );
      const splatMesh = createMockSplatMesh(bounds);

      const result = frameCameraToSplat(camera, splatMesh);

      expect(result).not.toBeNull();
      expect(result.center).toBeDefined();
      expect(result.radius).toBeGreaterThan(0);
      expect(result.distance).toBeGreaterThan(0);
      expect(camera.lookAt).toHaveBeenCalled();
    });

    test('uses voxel bounds when provided', () => {
      const { frameCameraToSplat } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const splatBounds = new THREE.Box3(
        new THREE.Vector3(-10, -10, -10),
        new THREE.Vector3(10, 10, 10)
      );
      const splatMesh = createMockSplatMesh(splatBounds);

      const voxelBounds = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5)
      );

      const result = frameCameraToSplat(camera, splatMesh, { voxelBounds });

      expect(result).not.toBeNull();
      expect(result.radius).toBeLessThan(15);
    });
  });

  describe('frameCameraToVoxelData', () => {
    test('returns null for null camera', () => {
      const { frameCameraToVoxelData } = require('../src/js/internal/cameraFrame.js');
      const voxelData = createVoxelData(['0,0,0', '1,0,0']);
      const result = frameCameraToVoxelData(null, voxelData);
      expect(result).toBeNull();
    });

    test('returns null for null voxelData', () => {
      const { frameCameraToVoxelData } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const result = frameCameraToVoxelData(camera, null);
      expect(result).toBeNull();
    });

    test('returns null for empty occupiedKeys', () => {
      const { frameCameraToVoxelData } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const voxelData = createVoxelData([]);
      const result = frameCameraToVoxelData(camera, voxelData);
      expect(result).toBeNull();
    });

    test('frames single voxel correctly', () => {
      const { frameCameraToVoxelData } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const voxelData = createVoxelData(['0,0,0']);

      const result = frameCameraToVoxelData(camera, voxelData);

      expect(result).not.toBeNull();
      expect(result.center.x).toBeCloseTo(0.5);
      expect(result.center.y).toBeCloseTo(0.5);
      expect(result.center.z).toBeCloseTo(0.5);
      expect(result.radius).toBeGreaterThan(0);
    });

    test('frames multiple voxels correctly', () => {
      const { frameCameraToVoxelData } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const voxelData = createVoxelData([
        '0,0,0', '1,0,0', '0,1,0', '1,1,0',
        '0,0,1', '1,0,1', '0,1,1', '1,1,1'
      ]);

      const result = frameCameraToVoxelData(camera, voxelData);

      expect(result).not.toBeNull();
      expect(result.center.x).toBeCloseTo(1);
      expect(result.center.y).toBeCloseTo(1);
      expect(result.center.z).toBeCloseTo(1);
    });

    test('applies resolution and origin offset', () => {
      const { frameCameraToVoxelData } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const voxelData = createVoxelData(['0,0,0', '1,0,0'], 0.5, { x: 10, y: 20, z: 30 });

      const result = frameCameraToVoxelData(camera, voxelData);

      expect(result).not.toBeNull();
      expect(result.center.x).toBeCloseTo(10.5);
      expect(result.center.y).toBeCloseTo(20.25);
      expect(result.center.z).toBeCloseTo(30.25);
    });
  });

  describe('frameCameraToObject', () => {
    test('handles object with getFocusBoundingBox method', () => {
      const { frameCameraToObject } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const focusBounds = new THREE.Box3(
        new THREE.Vector3(-1, -1, -1),
        new THREE.Vector3(1, 1, 1)
      );
      const object = {
        getFocusBoundingBox: () => focusBounds.clone(),
        updateMatrixWorld: vi.fn()
      };

      const result = frameCameraToObject(camera, object);

      expect(result).not.toBeNull();
      expect(camera.lookAt).toHaveBeenCalled();
    });

    test('falls back to setFromObject when no getFocusBoundingBox', () => {
      const { frameCameraToObject } = require('../src/js/internal/cameraFrame.js');
      const camera = createMockCamera();
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshBasicMaterial();
      const object = new THREE.Mesh(geometry, material);
      object.updateMatrixWorld(true);

      const result = frameCameraToObject(camera, object);

      expect(result).not.toBeNull();
    });
  });
});
