import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { SpzReader, SpzWriter } from '@sparkjsdev/spark';
import {
  ACTOR_CACHE_MANIFEST_VERSION,
  ACTOR_CACHE_SUBSET_FORMAT,
  ACTOR_CACHE_SUBSET_FORMAT_VERSION,
  ACTOR_CACHE_SERVER_ORIGIN,
  DEFAULT_ACTOR_CACHE_REQUEST,
  STANDARD_HUMANOID_RIG_PRESET,
  buildActorCacheJobKey,
  normalizeActorCacheTransform
} from '../../src/js/internal/actorCacheShared.js';
import {
  applyAlignment,
  serializeAlignment,
  serializeBoneLocalTransforms
} from '../../src/js/internal/standardHumanoidRig.js';
import {
  composeTransformMatrix,
  createVoxelOverlapSelector,
  normalizeVoxelOrigin,
  resolveWorldScaleMax
} from '../../src/js/internal/splatSelection.js';
import { computeProxyAlignment } from '../../src/js/internal/proxyAlign.js';
import { fitHumanoidRigToVoxelData } from '../../src/js/internal/voxelPoseFitter.js';
import { loadProxyFromFile } from '../../src/js/internal/proxyLoader.js';
import { computeSplatBoneBindingArrays } from '../../src/js/proxy/skinBinding.js';
import {
  selectPrimaryActorSplatCandidateIndices
} from '../../src/js/internal/splatActorSelection.js';
import { summarizeSplatCandidates } from '../../src/js/internal/splatDiagnostics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const cacheRoot = path.join(os.homedir(), '.spark2', 'actor-cache');
const serverOrigin = ACTOR_CACHE_SERVER_ORIGIN;
const serverUrl = new URL(serverOrigin);

export const ACTOR_CACHE_SERVER_PORT = Number(serverUrl.port || 3210);
export const ACTOR_CACHE_SERVER_HOST = serverUrl.hostname || '127.0.0.1';
export const ACTOR_CACHE_DIR = cacheRoot;

const tempCenter = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempWorldCenter = new THREE.Vector3();

function installProgressEventPolyfill() {
  if (typeof globalThis.ProgressEvent === 'function') return;
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.lengthComputable = Boolean(init.lengthComputable);
      this.loaded = Number(init.loaded) || 0;
      this.total = Number(init.total) || 0;
    }
  };
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function buildHashHex(value) {
  const hash = createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
}

function hashKey(x, y, z) {
  return `${x},${y},${z}`;
}

function estimateSupportScore({
  extractionKeys,
  centerKey,
  centerWorld,
  scale,
  origin,
  resolution,
  worldScaleMax,
  overlapScale,
  maxVoxelRadius
}) {
  if (extractionKeys.has(centerKey)) return 1;

  const maxScale = Math.max(
    0,
    toFiniteNumber(scale?.x, 0),
    toFiniteNumber(scale?.y, 0),
    toFiniteNumber(scale?.z, 0)
  );
  const radiusWorld = Math.max(
    0,
    Math.min(maxVoxelRadius * resolution, maxScale * worldScaleMax * overlapScale)
  );
  if (radiusWorld <= 1e-6) return 0;

  const minKeyX = Math.floor((centerWorld.x - radiusWorld - origin.x) / resolution);
  const minKeyY = Math.floor((centerWorld.y - radiusWorld - origin.y) / resolution);
  const minKeyZ = Math.floor((centerWorld.z - radiusWorld - origin.z) / resolution);
  const maxKeyX = Math.floor((centerWorld.x + radiusWorld - origin.x) / resolution);
  const maxKeyY = Math.floor((centerWorld.y + radiusWorld - origin.y) / resolution);
  const maxKeyZ = Math.floor((centerWorld.z + radiusWorld - origin.z) / resolution);

  let overlapHits = 0;
  let overlapTotal = 0;
  for (let x = minKeyX; x <= maxKeyX; x += 1) {
    for (let y = minKeyY; y <= maxKeyY; y += 1) {
      for (let z = minKeyZ; z <= maxKeyZ; z += 1) {
        overlapTotal += 1;
        if (extractionKeys.has(hashKey(x, y, z))) {
          overlapHits += 1;
        }
      }
    }
  }

  if (overlapTotal < 1) return 0;
  return overlapHits / overlapTotal;
}

function responseJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(payload));
}

function sourceNameFromUrl(sourceUrl = '') {
  const chunk = String(sourceUrl).split('?')[0].split('/').pop() || '';
  return decodeURIComponent(chunk) || 'actor-source.spz';
}

function normalizeActorCacheRequest(raw = {}) {
  const overlap = raw?.overlap ?? {};
  const voxelData = raw?.voxelData ?? {};
  const selectedKeys = asStringList(raw?.selectedKeys);
  const extractionKeys = asStringList(raw?.extractionKeys);
  return {
    sourceUrl: typeof raw?.sourceUrl === 'string' ? raw.sourceUrl : '',
    sourceName: typeof raw?.sourceName === 'string' ? raw.sourceName : '',
    selectedKeys,
    extractionKeys: extractionKeys.length ? extractionKeys : selectedKeys,
    selectionCount: Math.max(0, Math.floor(toFiniteNumber(raw?.selectionCount, selectedKeys.length || extractionKeys.length))),
    voxelData: {
      resolution: Math.max(1e-6, toFiniteNumber(voxelData?.resolution, 1)),
      origin: normalizeVoxelOrigin(voxelData?.origin)
    },
    sourceTransform: normalizeActorCacheTransform(raw?.sourceTransform ?? {}),
    overlap: {
      overlapScale: Math.max(0, toFiniteNumber(overlap?.overlapScale, DEFAULT_ACTOR_CACHE_REQUEST.overlapScale)),
      maxVoxelRadius: Math.max(0, Math.floor(toFiniteNumber(overlap?.maxVoxelRadius, DEFAULT_ACTOR_CACHE_REQUEST.maxVoxelRadius)))
    },
    rigPreset: typeof raw?.rigPreset === 'string' ? raw.rigPreset : STANDARD_HUMANOID_RIG_PRESET,
    defaultClip: typeof raw?.defaultClip === 'string' ? raw.defaultClip : 'walk'
  };
}

async function readRequestPayload(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
      continue;
    }
    if (value != null) headers.set(key, value);
  }

  const request = new Request(`http://${req.headers.host || `${ACTOR_CACHE_SERVER_HOST}:${ACTOR_CACHE_SERVER_PORT}`}${req.url || '/'}`, {
    method: req.method || 'GET',
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req),
    duplex: req.method === 'GET' || req.method === 'HEAD' ? undefined : 'half'
  });

  const contentType = request.headers.get('content-type') || '';
  if (/multipart\/form-data/i.test(contentType)) {
    const formData = await request.formData();
    const rawRequest = JSON.parse(String(formData.get('request') || '{}'));
    const uploadedFile = formData.get('sourceFile');
    return {
      rawRequest,
      uploadedFile: uploadedFile instanceof File ? uploadedFile : null
    };
  }

  const rawRequest = await request.json().catch(() => ({}));
  return { rawRequest, uploadedFile: null };
}

async function resolveSourceBytes(request, uploadedFile) {
  if (uploadedFile instanceof File) {
    const arrayBuffer = await uploadedFile.arrayBuffer();
    return {
      bytes: new Uint8Array(arrayBuffer),
      sourceName: uploadedFile.name || request.sourceName || 'actor-source.spz',
      sourceRef: uploadedFile.name || request.sourceName || 'uploaded-file'
    };
  }

  const sourceUrl = String(request.sourceUrl || '');
  if (!sourceUrl) {
    throw new Error('Actor cache request is missing sourceUrl or uploaded sourceFile.');
  }

  let bytes;
  if (/^https?:\/\//i.test(sourceUrl)) {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to fetch source asset: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    let filePath = sourceUrl;
    if (filePath.startsWith('/@fs/')) {
      filePath = decodeURIComponent(filePath.slice(4));
    } else if (filePath.startsWith('file://')) {
      filePath = fileURLToPath(filePath);
    } else if (filePath.startsWith('/assets/')) {
      filePath = path.join(repoRoot, 'public', filePath.slice(1));
    }
    bytes = new Uint8Array(await fs.readFile(filePath));
  }

  return {
    bytes,
    sourceName: request.sourceName || sourceNameFromUrl(sourceUrl),
    sourceRef: sourceUrl
  };
}

function findAlignmentAnchorNode(bones) {
  const list = Array.isArray(bones) ? bones : [];
  if (!list.length) return null;
  const preferred = [/hips/i, /pelvis/i, /root/i, /spine/i];
  for (const pattern of preferred) {
    const match = list.find((bone) => pattern.test(bone?.name || ''));
    if (match) return match;
  }
  return list[0] ?? null;
}

function createBoundsProbe(localBounds, worldMatrix) {
  return {
    matrixWorld: worldMatrix.clone(),
    updateMatrixWorld() {},
    getBoundingBox() {
      return localBounds.clone();
    }
  };
}

async function loadStandardHumanoidAsset() {
  installProgressEventPolyfill();
  const rigPath = path.join(repoRoot, 'public', 'assets', 'proxies', 'xbot_humanoid.glb');
  const rigBytes = await fs.readFile(rigPath);
  const rigFile = new File([rigBytes], 'xbot_humanoid.glb', { type: 'model/gltf-binary' });
  return loadProxyFromFile(rigFile);
}

async function collectSelectionPass({ sourceBytes, request, job }) {
  const reader = new SpzReader({ fileBytes: sourceBytes });
  await reader.parseHeader();
  const selectedFlags = new Uint8Array(reader.numSplats);
  const alphas = new Float32Array(reader.numSplats);
  const centers = new Float32Array(reader.numSplats * 3);
  const scales = new Float32Array(reader.numSplats * 3);
  const coreKeys = new Set(request.selectedKeys);
  const overlapKeys = new Set(request.extractionKeys);
  const sourceTransform = composeTransformMatrix(request.sourceTransform ?? {});
  const worldScaleMax = resolveWorldScaleMax(sourceTransform);
  const resolution = request.voxelData.resolution;
  const origin = request.voxelData.origin;
  const selector = createVoxelOverlapSelector({
    selectedKeys: overlapKeys,
    voxelData: request.voxelData,
    worldMatrix: sourceTransform,
    overlapScale: request.overlap.overlapScale,
    maxVoxelRadius: request.overlap.maxVoxelRadius
  });

  job.status = 'running';
  job.stage = 'select-splats';
  job.progress = 0.25;

  await reader.parseSplats(
    (index, x, y, z) => {
      const offset = index * 3;
      centers[offset] = x;
      centers[offset + 1] = y;
      centers[offset + 2] = z;
    },
    (index, alpha) => {
      alphas[index] = alpha;
    },
    undefined,
    (index, scaleX, scaleY, scaleZ) => {
      const offset = index * 3;
      scales[offset] = scaleX;
      scales[offset + 1] = scaleY;
      scales[offset + 2] = scaleZ;
      tempCenter.set(centers[offset], centers[offset + 1], centers[offset + 2]);
      tempScale.set(scaleX, scaleY, scaleZ);
      if (!selector(tempCenter, tempScale)) return;
      selectedFlags[index] = 1;
    }
  );

  const selectedCandidates = [];
  for (let index = 0; index < selectedFlags.length; index += 1) {
    if (selectedFlags[index] !== 1) continue;
    const offset = index * 3;
    tempWorldCenter
      .set(centers[offset], centers[offset + 1], centers[offset + 2])
      .applyMatrix4(sourceTransform);
    const centerKey = hashKey(
      Math.floor((tempWorldCenter.x - origin.x) / resolution),
      Math.floor((tempWorldCenter.y - origin.y) / resolution),
      Math.floor((tempWorldCenter.z - origin.z) / resolution)
    );
    tempScale.set(scales[offset], scales[offset + 1], scales[offset + 2]);
    selectedCandidates.push({
      index,
      worldCenter: [tempWorldCenter.x, tempWorldCenter.y, tempWorldCenter.z],
      opacity: Math.max(0, toFiniteNumber(alphas[index], 0)),
      centerInCore: coreKeys.has(centerKey),
      centerInExtraction: overlapKeys.has(centerKey),
      supportScore: estimateSupportScore({
        extractionKeys: overlapKeys,
        centerKey,
        centerWorld: tempWorldCenter,
        scale: tempScale,
        origin,
        resolution,
        worldScaleMax,
        overlapScale: request.overlap.overlapScale,
        maxVoxelRadius: request.overlap.maxVoxelRadius
      })
    });
  }

  const refinedFlags = new Uint8Array(reader.numSplats);
  const localBounds = new THREE.Box3().makeEmpty();
  let selectedCount = 0;
  let retainedCandidates = selectedCandidates;
  if (selectedCandidates.length >= 128) {
    const refined = selectPrimaryActorSplatCandidateIndices(selectedCandidates, request.voxelData, {
      coreSelectedKeys: coreKeys,
      extractionKeys: overlapKeys
    });
    if (refined.selectedIndices.length > 0) {
      const keep = new Set(refined.selectedIndices);
      retainedCandidates = selectedCandidates.filter((entry) => keep.has(entry.index));
    }
  }

  for (const candidate of retainedCandidates) {
    if (refinedFlags[candidate.index] === 1) continue;
    refinedFlags[candidate.index] = 1;
    selectedCount += 1;
    const offset = candidate.index * 3;
    tempCenter.set(centers[offset], centers[offset + 1], centers[offset + 2]);
    const radius = 1e-3;
    localBounds.expandByPoint(tempCenter.clone().addScalar(radius));
    localBounds.expandByPoint(tempCenter.clone().addScalar(-radius));
  }

  if (selectedCount < 1) {
    retainedCandidates = selectedCandidates;
    for (let index = 0; index < selectedFlags.length; index += 1) {
      if (selectedFlags[index] !== 1 || refinedFlags[index] === 1) continue;
      refinedFlags[index] = 1;
      selectedCount += 1;
      const offset = index * 3;
      tempCenter.set(centers[offset], centers[offset + 1], centers[offset + 2]);
      const radius = 1e-3;
      localBounds.expandByPoint(tempCenter.clone().addScalar(radius));
      localBounds.expandByPoint(tempCenter.clone().addScalar(-radius));
    }
  }

  return {
    header: {
      numSplats: reader.numSplats,
      shDegree: reader.shDegree,
      fractionalBits: reader.fractionalBits,
      flagAntiAlias: reader.flagAntiAlias
    },
    selectedFlags: refinedFlags,
    centers,
    localBounds,
    selectedCount,
    sourceTransform,
    selectionStats: summarizeSplatCandidates(retainedCandidates, request.voxelData, {
      extra: {
        subsetMethod: 'scored-cells',
        retainedCount: selectedCount
      }
    })
  };
}

async function writeSubsetPass({ sourceBytes, selection, artifactDir, request, job }) {
  const reader = new SpzReader({ fileBytes: sourceBytes });
  await reader.parseHeader();
  const writer = new SpzWriter({
    numSplats: selection.selectedCount,
    shDegree: selection.header.shDegree,
    fractionalBits: selection.header.fractionalBits,
    flagAntiAlias: selection.header.flagAntiAlias
  });
  const sourceIndexToTarget = new Int32Array(selection.header.numSplats);
  sourceIndexToTarget.fill(-1);
  const worldCenters = new Float32Array(selection.selectedCount * 3);

  let cursor = 0;
  for (let index = 0; index < selection.selectedFlags.length; index += 1) {
    if (selection.selectedFlags[index] !== 1) continue;
    sourceIndexToTarget[index] = cursor;
    const sourceOffset = index * 3;
    const targetOffset = cursor * 3;
    tempWorldCenter
      .set(selection.centers[sourceOffset], selection.centers[sourceOffset + 1], selection.centers[sourceOffset + 2])
      .applyMatrix4(selection.sourceTransform);
    worldCenters[targetOffset] = tempWorldCenter.x;
    worldCenters[targetOffset + 1] = tempWorldCenter.y;
    worldCenters[targetOffset + 2] = tempWorldCenter.z;
    cursor += 1;
  }

  job.stage = 'write-subset';
  job.progress = 0.52;

  await reader.parseSplats(
    (index, x, y, z) => {
      const target = sourceIndexToTarget[index];
      if (target >= 0) writer.setCenter(target, x, y, z);
    },
    (index, alpha) => {
      const target = sourceIndexToTarget[index];
      if (target >= 0) writer.setAlpha(target, alpha);
    },
    (index, r, g, b) => {
      const target = sourceIndexToTarget[index];
      if (target >= 0) writer.setRgb(target, r, g, b);
    },
    (index, scaleX, scaleY, scaleZ) => {
      const target = sourceIndexToTarget[index];
      if (target >= 0) writer.setScale(target, scaleX, scaleY, scaleZ);
    },
    (index, quatX, quatY, quatZ, quatW) => {
      const target = sourceIndexToTarget[index];
      if (target >= 0) writer.setQuat(target, quatX, quatY, quatZ, quatW);
    },
    (index, sh1, sh2, sh3) => {
      const target = sourceIndexToTarget[index];
      if (target >= 0) writer.setSh(target, sh1, sh2, sh3);
    }
  );

  const actorSpzBytes = await writer.finalize();
  await fs.writeFile(path.join(artifactDir, 'actor.spz'), actorSpzBytes);
  return { worldCenters };
}

async function fitRigAndBindings({ selection, worldCenters, request, artifactDir, sourceHash, job }) {
  job.stage = 'fit-rig';
  job.progress = 0.74;

  const asset = await loadStandardHumanoidAsset();
  try {
    const root = asset.gltfRoot ?? asset.root;
    const bones = asset.skinnedMeshes?.[0]?.skeleton?.bones ?? [];
    const proxyProbe = createBoundsProbe(selection.localBounds, selection.sourceTransform);
    const alignment = computeProxyAlignment(proxyProbe, root, {
      profile: 'character',
      preferUpright: true,
      anchorNode: findAlignmentAnchorNode(bones),
      anchorBlend: 0.85
    });
    applyAlignment(root, serializeAlignment(alignment));
    fitHumanoidRigToVoxelData({
      voxelData: {
        occupiedKeys: new Set(request.extractionKeys),
        resolution: request.voxelData.resolution,
        origin: request.voxelData.origin
      },
      bones,
      stiffness: 0.92
    });
    root.updateMatrixWorld(true);

    const bindingArrays = computeSplatBoneBindingArrays(worldCenters, bones);
    await fs.writeFile(path.join(artifactDir, 'skin-indices.bin'), Buffer.from(bindingArrays.indices.buffer));
    await fs.writeFile(path.join(artifactDir, 'skin-weights.bin'), Buffer.from(bindingArrays.weights.buffer));

    const manifest = {
      version: ACTOR_CACHE_MANIFEST_VERSION,
      sourceHash,
      selectionCount: request.selectionCount,
      actorSplatCount: selection.selectedCount,
      actorSpzUrl: `/artifacts/${selection.jobId}/actor.spz`,
      skinIndicesUrl: `/artifacts/${selection.jobId}/skin-indices.bin`,
      skinWeightsUrl: `/artifacts/${selection.jobId}/skin-weights.bin`,
      rigPreset: request.rigPreset,
      defaultClip: request.defaultClip,
      subsetFormat: ACTOR_CACHE_SUBSET_FORMAT,
      subsetFormatVersion: ACTOR_CACHE_SUBSET_FORMAT_VERSION,
      subsetMethod: selection.selectionStats?.subsetMethod ?? "unknown",
      selectionStats: selection.selectionStats ?? null,
      sourceTransform: request.sourceTransform,
      alignment: serializeAlignment(alignment),
      boneLocalTransforms: serializeBoneLocalTransforms(bones),
      overlap: {
        overlapScale: request.overlap.overlapScale,
        maxVoxelRadius: request.overlap.maxVoxelRadius
      }
    };

    job.stage = 'write-manifest';
    job.progress = 0.92;
    await fs.writeFile(path.join(artifactDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  } finally {
    asset.dispose?.();
    asset.release?.();
  }
}

export async function bakeActorCacheJob({ request, uploadedFile = null, job, prepared = null }) {
  const preparedJob = prepared ?? await prepareActorCacheJob({ request, uploadedFile });
  const normalized = preparedJob.request;
  const source = preparedJob.source;
  const sourceHash = preparedJob.sourceHash;
  const stableJobId = preparedJob.jobId;
  const artifactDir = preparedJob.artifactDir;

  job.status = 'running';
  job.stage = 'resolve-source';
  job.progress = 0.08;

  job.jobId = stableJobId;
  job.artifactDir = artifactDir;
  job.sourceHash = sourceHash;
  job.request = normalized;

  const manifestPath = path.join(artifactDir, 'manifest.json');
  try {
    await fs.access(manifestPath);
    job.status = 'done';
    job.stage = 'cached';
    job.progress = 1;
    job.manifestUrl = `/artifacts/${stableJobId}/manifest.json`;
    return { jobId: stableJobId, manifestUrl: job.manifestUrl, cached: true };
  } catch {
    // Cache miss; continue.
  }

  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });

  const selection = await collectSelectionPass({ sourceBytes: source.bytes, request: normalized, job });
  if (selection.selectedCount < 1) {
    throw new Error('Actor cache preprocessing selected zero splats.');
  }
  selection.jobId = stableJobId;
  const { worldCenters } = await writeSubsetPass({
    sourceBytes: source.bytes,
    selection,
    artifactDir,
    request: normalized,
    job
  });
  await fitRigAndBindings({
    selection,
    worldCenters,
    request: normalized,
    artifactDir,
    sourceHash,
    job
  });

  job.status = 'done';
  job.stage = 'done';
  job.progress = 1;
  job.manifestUrl = `/artifacts/${stableJobId}/manifest.json`;
  return { jobId: stableJobId, manifestUrl: job.manifestUrl, cached: false };
}

export async function prepareActorCacheJob({ request, uploadedFile = null }) {
  const normalized = normalizeActorCacheRequest(request);
  if (!normalized.extractionKeys.length) {
    throw new Error('Actor cache request is missing extractionKeys.');
  }
  if (normalized.rigPreset !== STANDARD_HUMANOID_RIG_PRESET) {
    throw new Error(`Unsupported rig preset: ${normalized.rigPreset}`);
  }

  const source = await resolveSourceBytes(normalized, uploadedFile);
  const sourceHash = buildHashHex(source.bytes);
  const keyPayload = buildActorCacheJobKey({
    sourceHash,
    selectedKeys: normalized.selectedKeys,
    extractionKeys: normalized.extractionKeys,
    overlapScale: normalized.overlap.overlapScale,
    maxVoxelRadius: normalized.overlap.maxVoxelRadius,
    rigPreset: normalized.rigPreset,
    sourceTransform: normalized.sourceTransform,
    voxelData: normalized.voxelData
  });
  const jobId = buildHashHex(keyPayload);
  const artifactDir = path.join(cacheRoot, jobId);
  return {
    jobId,
    artifactDir,
    request: normalized,
    source,
    sourceHash
  };
}

function inferContentType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.bin')) return 'application/octet-stream';
  if (filePath.endsWith('.spz')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function createJobSnapshot(job, jobId) {
  return {
    jobId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    error: job.error || null,
    manifestUrl: job.manifestUrl || null,
    sourceHash: job.sourceHash || null,
    cached: job.stage === 'cached'
  };
}

export function startActorCacheServer({ host = ACTOR_CACHE_SERVER_HOST, port = ACTOR_CACHE_SERVER_PORT } = {}) {
  const jobs = new Map();

  const server = http.createServer(async (req, res) => {
    if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
      responseJson(res, 204, {});
      return;
    }

    const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);

    try {
      if (req.method === 'POST' && requestUrl.pathname === '/jobs') {
        const { rawRequest, uploadedFile } = await readRequestPayload(req);
        try {
          const prepared = await prepareActorCacheJob({ request: rawRequest, uploadedFile });
          const manifestPath = path.join(prepared.artifactDir, 'manifest.json');
          try {
            await fs.access(manifestPath);
            const cachedJob = jobs.get(prepared.jobId) ?? {
              jobId: prepared.jobId,
              status: 'done',
              stage: 'cached',
              progress: 1,
              error: null,
              manifestUrl: `/artifacts/${prepared.jobId}/manifest.json`,
              artifactDir: prepared.artifactDir,
              sourceHash: prepared.sourceHash,
              request: prepared.request
            };
            jobs.set(prepared.jobId, cachedJob);
            responseJson(res, 200, createJobSnapshot(cachedJob, prepared.jobId));
            return;
          } catch {
            // Cache miss; submit background work.
          }

          const existingJob = jobs.get(prepared.jobId);
          if (existingJob) {
            if (existingJob.status === 'error') {
              jobs.delete(prepared.jobId);
            } else {
              responseJson(res, 202, createJobSnapshot(existingJob, prepared.jobId));
              return;
            }
          }

          const job = {
            jobId: prepared.jobId,
            status: 'queued',
            stage: 'queued',
            progress: 0.01,
            error: null,
            manifestUrl: null,
            artifactDir: prepared.artifactDir,
            sourceHash: prepared.sourceHash,
            request: prepared.request
          };
          jobs.set(prepared.jobId, job);
          responseJson(res, 202, createJobSnapshot(job, prepared.jobId));

          void bakeActorCacheJob({ request: prepared.request, job, prepared }).catch((error) => {
            job.status = 'error';
            job.stage = 'error';
            job.progress = 1;
            job.error = error instanceof Error ? error.message : String(error);
          });
          return;
        } catch (error) {
          responseJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
          return;
        }
      }

      if (req.method === 'GET' && /^\/jobs\//.test(requestUrl.pathname)) {
        const jobId = decodeURIComponent(requestUrl.pathname.slice('/jobs/'.length));
        const job = jobs.get(jobId);
        if (job) {
          responseJson(res, 200, createJobSnapshot(job, jobId));
          return;
        }
        const manifestPath = path.join(cacheRoot, jobId, 'manifest.json');
        try {
          await fs.access(manifestPath);
          responseJson(res, 200, {
            jobId,
            status: 'done',
            stage: 'cached',
            progress: 1,
            error: null,
            manifestUrl: `/artifacts/${jobId}/manifest.json`,
            sourceHash: null,
            cached: true
          });
          return;
        } catch {
          responseJson(res, 404, { error: `Unknown actor cache job: ${jobId}` });
          return;
        }
      }

      if (req.method === 'GET' && /^\/artifacts\//.test(requestUrl.pathname)) {
        const parts = requestUrl.pathname.split('/').filter(Boolean);
        const jobId = parts[1] || '';
        const fileName = parts.slice(2).join('/');
        if (!jobId || !fileName) {
          responseJson(res, 404, { error: 'Artifact not found.' });
          return;
        }
        const artifactPath = path.join(cacheRoot, jobId, fileName);
        const bytes = await fs.readFile(artifactPath);
        res.writeHead(200, {
          'content-type': inferContentType(artifactPath),
          'access-control-allow-origin': '*'
        });
        res.end(bytes);
        return;
      }

      responseJson(res, 404, { error: `Unknown route: ${requestUrl.pathname}` });
    } catch (error) {
      responseJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
