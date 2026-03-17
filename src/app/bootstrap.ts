import * as THREE from 'three';
import type { SparkModuleLike } from '../spark/previewAdapter';

export function createNoSparkModule(): SparkModuleLike {
  const moduleObject = {
    NewSparkRenderer: class DummySparkRenderer extends THREE.Object3D {
      enableLod = true;
      lodSplatCount = 0;
      lodSplatScale = 1;
      dispose() {}
    },
    SplatMesh: class DummySplatMesh extends THREE.Object3D {},
    SplatEdit: class DummySplatEdit extends THREE.Object3D {
      addSdf() {}
      removeSdf() {}
    },
    SplatEditSdf: class DummySplatEditSdf extends THREE.Object3D {
      invert = false;
      opacity = 1;
      color = new THREE.Color(0xffffff);
      displace = new THREE.Vector3();
      radius = 0;
      constructor(_options = {}) {
        super();
      }
    },
    SplatModifier: class DummySplatModifier {
      modifier: unknown;
      constructor(modifier: unknown) {
        this.modifier = modifier;
      }
    },
    transcodeSpz: async () => ({ fileBytes: new Uint8Array() })
  };

  return moduleObject as unknown as SparkModuleLike;
}

