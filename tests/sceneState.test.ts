import { beforeEach, describe, expect, test } from 'vitest';
import {
  SCENE_FILE_SCHEMA,
  SCENE_FILE_VERSION,
  createSceneFile,
  deleteSceneSlot,
  listSceneSlotNames,
  loadSceneSlot,
  parseSceneFileJson,
  saveSceneSlot,
  stringifySceneFile,
  type SceneFileV2
} from '../src/scene/sceneState';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key) ?? null : null;
  }

  key(index: number): string | null {
    const entries = [...this.values.keys()];
    return entries[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function sampleScene(): SceneFileV2 {
  return createSceneFile({
    sceneName: 'Roundtrip',
    splatRef: {
      name: 'sample.spz',
      ext: 'spz',
      loadMode: 'spz'
    },
    camera: {
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      fov: 60,
      near: 0.1,
      far: 5000
    },
    settings: {
      lodSplatCount: 1_500_000,
      lodSplatScale: 1,
      improvedQuality: true,
      sourceQualityMode: false,
      flipUpDown: false,
      flipLeftRight: true,
      proxyFlipUpDown: false,
      proxyMirrorX: false,
      proxyMirrorZ: false,
      proxyUserPosition: [0, 0, 0],
      proxyUserQuaternion: [0, 0, 0, 1],
      proxyUserScale: [1, 1, 1],
      outlinerParents: [],
      selectedOutlinerId: null,
      physicallyCorrectLights: true,
      toneMapping: 'ACESFilmic',
      toneMappingExposure: 1,
      shadowsEnabled: true,
      lightEditMode: false,
      showLightHelpers: true,
      showLightGizmos: true,
      showMovementControls: true,
      showLightingProbes: true,
      collisionEnabled: true,
      showProxyMesh: false,
      voxelEditMode: false
    },
    lights: [
      {
        id: 'ambient-1',
        type: 'ambient',
        name: 'Ambient Light',
        enabled: true,
        color: '#ffffff',
        intensity: 0.5
      },
      {
        id: 'key-1',
        type: 'directional',
        name: 'Key Light',
        enabled: true,
        color: '#ffffff',
        intensity: 0.7,
        position: [5, 8, 2],
        target: [0, 0, 0],
        castShadow: true,
        shadowMapSize: 1024,
        shadowBias: -0.0005,
        shadowNormalBias: 0.02
      }
    ]
  });
}

function sampleV1SceneObject() {
  return {
    schema: 'spark2-scene',
    version: 1,
    savedAt: new Date().toISOString(),
    sceneName: 'Legacy Scene',
    splatRef: {
      name: 'legacy.spz',
      ext: 'spz',
      loadMode: 'spz'
    },
    camera: {
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      fov: 60,
      near: 0.1,
      far: 5000
    },
    settings: {
      lodSplatCount: 900000,
      lodSplatScale: 1,
      improvedQuality: false,
      sourceQualityMode: false,
      flipUpDown: false,
      flipLeftRight: false
    },
    lights: [
      {
        id: 'legacy-dir',
        type: 'directional',
        name: 'Legacy Directional',
        enabled: true,
        color: '#ffffff',
        intensity: 1,
        position: [4, 5, 6]
      }
    ]
  };
}

describe('scene state helpers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage()
    });
  });

  test('round-trips a valid scene schema through JSON', () => {
    const scene = sampleScene();
    const json = stringifySceneFile(scene);
    const parsed = parseSceneFileJson(json);

    expect(parsed.schema).toBe(SCENE_FILE_SCHEMA);
    expect(parsed.version).toBe(SCENE_FILE_VERSION);
    expect(parsed.sceneName).toBe('Roundtrip');
    expect(parsed.settings.physicallyCorrectLights).toBe(true);
    expect(parsed.lights).toHaveLength(2);
  });

  test('rejects malformed schema on parse', () => {
    const scene = sampleScene();
    const invalid = {
      ...scene,
      schema: 'wrong-schema'
    };

    expect(() => parseSceneFileJson(JSON.stringify(invalid))).toThrow('schema must be');
  });

  test('migrates a v1 scene payload to v2', () => {
    const migrated = parseSceneFileJson(JSON.stringify(sampleV1SceneObject()));
    expect(migrated.version).toBe(2);
    expect(migrated.settings.showLightingProbes).toBe(true);
    const directional = migrated.lights.find((light) => light.type === 'directional');
    expect(directional && directional.type === 'directional' ? directional.target : null).toEqual([0, 0, 0]);
  });

  test('saves, loads, lists, and deletes local scene slots', () => {
    const scene = sampleScene();
    saveSceneSlot('studio-a', scene);

    expect(listSceneSlotNames()).toEqual(['studio-a']);

    const loaded = loadSceneSlot('studio-a');
    expect(loaded.sceneName).toBe(scene.sceneName);

    const removed = deleteSceneSlot('studio-a');
    expect(removed).toBe(true);
    expect(listSceneSlotNames()).toEqual([]);
  });
});
