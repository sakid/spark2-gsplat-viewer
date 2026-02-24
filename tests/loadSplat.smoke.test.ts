import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import {
  assertSparkPreviewApi,
  type SparkModuleLike,
  type SparkRendererLike,
  type SplatMeshLike
} from '../src/spark/previewAdapter';
import { loadFromFile } from '../src/viewer/loadSplat';

class FakeSparkRenderer extends THREE.Object3D implements SparkRendererLike {
  enableLod = true;
  lodSplatCount = 1_500_000;
  lodSplatScale = 1;
}

class FakeSplatMesh extends THREE.Object3D implements SplatMeshLike {
  initialized: Promise<unknown>;

  constructor() {
    super();
    this.initialized = Promise.resolve(this);
  }

  dispose(): void {
    // no-op
  }
}

class FakeSplatEdit extends THREE.Object3D {
  addSdf(): void { }
  removeSdf(): void { }
}

class FakeSplatEditSdf extends THREE.Object3D {
  type = 'box';
  invert = false;
  opacity = 1;
  color = new THREE.Color();
  displace = new THREE.Vector3();
  radius = 0;
}

class FakeSplatModifier {
  modifier: any;
  constructor(edit: any) {
    this.modifier = edit;
  }
}

const fakeSparkModule: SparkModuleLike = {
  NewSparkRenderer: FakeSparkRenderer as unknown as SparkModuleLike['NewSparkRenderer'],
  SplatMesh: FakeSplatMesh as unknown as SparkModuleLike['SplatMesh'],
  SplatEdit: FakeSplatEdit as unknown as SparkModuleLike['SplatEdit'],
  SplatEditSdf: FakeSplatEditSdf as unknown as SparkModuleLike['SplatEditSdf'],
  SplatModifier: FakeSplatModifier as unknown as SparkModuleLike['SplatModifier'],
  transcodeSpz: async () => ({ fileBytes: new Uint8Array([1, 2, 3]) })
};

describe('preview adapter and loader smoke', () => {
  test('assertSparkPreviewApi accepts compatible module', () => {
    expect(() => assertSparkPreviewApi(fakeSparkModule)).not.toThrow();
  });

  test('loadFromFile adds mesh to scene for small spz input', async () => {
    const scene = new THREE.Scene();
    const sparkRenderer = new FakeSparkRenderer();
    const file = new File([new Uint8Array([1, 2, 3])], 'tiny.spz');

    const loaded = await loadFromFile(file, {
      mode: 'spz',
      enforcePreviewApi: true,
      scene,
      sparkRenderer,
      sparkModule: fakeSparkModule
    });

    expect(loaded.fileType).toBe('spz');
    expect(scene.children.includes(loaded.mesh)).toBe(true);
  });

  test('loadFromFile blocks ply while in spz mode', async () => {
    const scene = new THREE.Scene();
    const sparkRenderer = new FakeSparkRenderer();
    const file = new File([new Uint8Array([1, 2, 3])], 'tiny.ply');

    await expect(
      loadFromFile(file, {
        mode: 'spz',
        enforcePreviewApi: true,
        scene,
        sparkRenderer,
        sparkModule: fakeSparkModule
      })
    ).rejects.toThrow('Raw .ply loading is disabled in SPZ mode');
  });
});
