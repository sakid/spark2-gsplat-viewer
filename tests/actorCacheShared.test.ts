import { describe, expect, test } from 'vitest';
import {
  STANDARD_HUMANOID_RIG_PRESET,
  buildActorCacheJobKey,
  normalizeActorCacheManifest
} from '../src/js/internal/actorCacheShared';

describe('actorCacheShared', () => {
  test('builds stable cache keys for identical requests', () => {
    const base = {
      sourceHash: 'abc123',
      selectedKeys: ['1,2,3'],
      extractionKeys: ['1,2,3', '1,2,4'],
      overlapScale: 2,
      maxVoxelRadius: 2,
      rigPreset: STANDARD_HUMANOID_RIG_PRESET,
      sourceTransform: {
        position: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1]
      },
      voxelData: {
        resolution: 0.5,
        origin: { x: 0, y: 1, z: 2 }
      }
    };

    const a = buildActorCacheJobKey(base);
    const b = buildActorCacheJobKey({ ...base, extractionKeys: ['1,2,4', '1,2,3'] });
    const c = buildActorCacheJobKey({ ...base, extractionKeys: ['1,2,3'] });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('normalizes manifest URLs and cached transforms', () => {
    const manifest = normalizeActorCacheManifest({
      version: 1,
      sourceHash: 'source-hash',
      selectionCount: 12,
      actorSplatCount: 34,
      actorSpzUrl: './actor.spz',
      skinIndicesUrl: './skin-indices.bin',
      skinWeightsUrl: './skin-weights.bin',
      rigPreset: STANDARD_HUMANOID_RIG_PRESET,
      alignment: {
        offset: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
        scale: 2
      },
      boneLocalTransforms: [
        {
          index: 4,
          name: 'LeftArm',
          position: [1, 2, 3],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1]
        }
      ]
    }, 'http://127.0.0.1:3210/artifacts/job-1/manifest.json');

    expect(manifest.actorSpzUrl).toBe('http://127.0.0.1:3210/artifacts/job-1/actor.spz');
    expect(manifest.skinIndicesUrl).toBe('http://127.0.0.1:3210/artifacts/job-1/skin-indices.bin');
    expect(manifest.skinWeightsUrl).toBe('http://127.0.0.1:3210/artifacts/job-1/skin-weights.bin');
    expect(manifest.alignment.scale).toBe(2);
    expect(manifest.boneLocalTransforms[0]).toMatchObject({ index: 4, name: 'LeftArm' });
  });
});
