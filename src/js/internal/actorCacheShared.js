export const ACTOR_CACHE_SERVER_ORIGIN = 'http://127.0.0.1:3210';
export const ACTOR_CACHE_SERVER_TIMEOUT_MS = 120_000;
export const ACTOR_CACHE_MANIFEST_VERSION = 2;
export const STANDARD_HUMANOID_RIG_PRESET = 'xbot-v1';
export const STANDARD_HUMANOID_RIG_FILE_NAME = 'xbot_humanoid.glb';
export const STANDARD_HUMANOID_RIG_URL = `/assets/proxies/${STANDARD_HUMANOID_RIG_FILE_NAME}`;
export const DEFAULT_ACTOR_CACHE_REQUEST = Object.freeze({
  overlapScale: 2.0,
  maxVoxelRadius: 2,
  selectionExpansionRadius: 1,
  selectionExpansionMaxScale: 2.5,
  rigPreset: STANDARD_HUMANOID_RIG_PRESET
});

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeVector3(value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) ? value : fallback;
  return [
    toFiniteNumber(source[0], fallback[0]),
    toFiniteNumber(source[1], fallback[1]),
    toFiniteNumber(source[2], fallback[2])
  ];
}

function normalizeQuaternion(value, fallback = [0, 0, 0, 1]) {
  const source = Array.isArray(value) ? value : fallback;
  return [
    toFiniteNumber(source[0], fallback[0]),
    toFiniteNumber(source[1], fallback[1]),
    toFiniteNumber(source[2], fallback[2]),
    toFiniteNumber(source[3], fallback[3])
  ];
}

export function normalizeActorCacheTransform(value = {}) {
  return {
    position: normalizeVector3(value.position, [0, 0, 0]),
    quaternion: normalizeQuaternion(value.quaternion, [0, 0, 0, 1]),
    scale: normalizeVector3(value.scale, [1, 1, 1])
  };
}

export function normalizeActorCacheAlignment(value = {}) {
  return {
    offset: normalizeVector3(value.offset, [0, 0, 0]),
    quaternion: normalizeQuaternion(value.quaternion, [0, 0, 0, 1]),
    scale: Math.max(1e-6, toFiniteNumber(value.scale, 1))
  };
}

export function normalizeBoneLocalTransforms(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => ({
    index: Math.max(0, Math.floor(toFiniteNumber(entry?.index, index))),
    name: typeof entry?.name === 'string' ? entry.name : '',
    position: normalizeVector3(entry?.position, [0, 0, 0]),
    quaternion: normalizeQuaternion(entry?.quaternion, [0, 0, 0, 1]),
    scale: normalizeVector3(entry?.scale, [1, 1, 1])
  }));
}

export function normalizeActorCacheManifest(raw, baseUrl = ACTOR_CACHE_SERVER_ORIGIN) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Actor cache manifest must be an object.');
  }

  const manifest = raw;
  const version = Math.max(1, Math.floor(toFiniteNumber(manifest.version, ACTOR_CACHE_MANIFEST_VERSION)));
  const sourceHash = typeof manifest.sourceHash === 'string' ? manifest.sourceHash : '';
  const selectionCount = Math.max(0, Math.floor(toFiniteNumber(manifest.selectionCount, 0)));
  const actorSplatCount = Math.max(0, Math.floor(toFiniteNumber(manifest.actorSplatCount, 0)));
  const actorSpzRaw = typeof manifest.actorSpzUrl === 'string' ? manifest.actorSpzUrl : '';
  const skinIndicesRaw = typeof manifest.skinIndicesUrl === 'string' ? manifest.skinIndicesUrl : '';
  const skinWeightsRaw = typeof manifest.skinWeightsUrl === 'string' ? manifest.skinWeightsUrl : '';
  const rigPreset = typeof manifest.rigPreset === 'string' ? manifest.rigPreset : STANDARD_HUMANOID_RIG_PRESET;
  const defaultClip = typeof manifest.defaultClip === 'string' ? manifest.defaultClip : 'walk';

  if (!sourceHash) throw new Error('Actor cache manifest is missing sourceHash.');
  if (!actorSpzRaw) throw new Error('Actor cache manifest is missing actorSpzUrl.');
  if (!skinIndicesRaw) throw new Error('Actor cache manifest is missing skinIndicesUrl.');
  if (!skinWeightsRaw) throw new Error('Actor cache manifest is missing skinWeightsUrl.');

  return {
    version,
    sourceHash,
    selectionCount,
    actorSplatCount,
    actorSpzUrl: new URL(actorSpzRaw, baseUrl).href,
    skinIndicesUrl: new URL(skinIndicesRaw, baseUrl).href,
    skinWeightsUrl: new URL(skinWeightsRaw, baseUrl).href,
    rigPreset,
    defaultClip,
    sourceTransform: normalizeActorCacheTransform(manifest.sourceTransform),
    alignment: normalizeActorCacheAlignment(manifest.alignment),
    boneLocalTransforms: normalizeBoneLocalTransforms(manifest.boneLocalTransforms),
    overlap: {
      overlapScale: Math.max(0, toFiniteNumber(manifest.overlap?.overlapScale, DEFAULT_ACTOR_CACHE_REQUEST.overlapScale)),
      maxVoxelRadius: Math.max(0, Math.floor(toFiniteNumber(manifest.overlap?.maxVoxelRadius, DEFAULT_ACTOR_CACHE_REQUEST.maxVoxelRadius)))
    }
  };
}

export function buildActorCacheJobKey({
  sourceHash,
  selectedKeys,
  extractionKeys,
  overlapScale = DEFAULT_ACTOR_CACHE_REQUEST.overlapScale,
  maxVoxelRadius = DEFAULT_ACTOR_CACHE_REQUEST.maxVoxelRadius,
  rigPreset = DEFAULT_ACTOR_CACHE_REQUEST.rigPreset,
  sourceTransform,
  voxelData
} = {}) {
  const keys = Array.isArray(extractionKeys) ? [...extractionKeys].map((key) => String(key)).sort() : [];
  const selected = Array.isArray(selectedKeys) ? [...selectedKeys].map((key) => String(key)).sort() : [];
  const transform = normalizeActorCacheTransform(sourceTransform);
  const normalizedVoxel = {
    origin: {
      x: toFiniteNumber(voxelData?.origin?.x, 0),
      y: toFiniteNumber(voxelData?.origin?.y, 0),
      z: toFiniteNumber(voxelData?.origin?.z, 0)
    },
    resolution: Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1))
  };
  return JSON.stringify({
    version: ACTOR_CACHE_MANIFEST_VERSION,
    sourceHash: String(sourceHash ?? ''),
    selectedKeys: selected,
    extractionKeys: keys,
    overlapScale: Math.max(0, toFiniteNumber(overlapScale, DEFAULT_ACTOR_CACHE_REQUEST.overlapScale)),
    maxVoxelRadius: Math.max(0, Math.floor(toFiniteNumber(maxVoxelRadius, DEFAULT_ACTOR_CACHE_REQUEST.maxVoxelRadius))),
    rigPreset: String(rigPreset || DEFAULT_ACTOR_CACHE_REQUEST.rigPreset),
    sourceTransform: transform,
    voxelData: normalizedVoxel
  });
}
