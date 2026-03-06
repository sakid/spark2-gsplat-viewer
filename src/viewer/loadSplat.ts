import * as THREE from 'three';
import {
  assertSparkPreviewApi,
  loadSparkModule,
  type SparkModuleLike,
  type SparkRendererLike,
  type SplatMeshLike
} from '../spark/previewAdapter';

export type LoadMode = 'raw-ply' | 'spz';

export interface LoadOptions {
  mode: LoadMode;
  enforcePreviewApi: true;
  scene: THREE.Scene;
  sparkRenderer: SparkRendererLike;
  previousMesh?: SplatMeshLike | null;
  sparkModule?: SparkModuleLike;
  requirePlyConfirm?: (file: File) => Promise<boolean>;
  onStatus?: (message: string) => void;
  useWorker?: boolean;
}

export interface LoadedSplat {
  mesh: SplatMeshLike;
  fileType: 'ply' | 'spz' | 'splat' | 'ksplat';
  numBytes: number;
  loadMs: number;
}

const ALLOWED_EXTENSIONS = new Set(['ply', 'spz', 'splat', 'ksplat']);

interface BufferPoolEntry {
  buffer: Uint8Array;
  size: number;
  inUse: boolean;
}

class BufferPool {
  private pools: Map<number, BufferPoolEntry[]> = new Map();
  private maxPoolSizePerBucket = 3;

  acquire(size: number): Uint8Array {
    const bucket = this.getBucketKey(size);
    const pool = this.pools.get(bucket) ?? [];

    for (let i = 0; i < pool.length; i++) {
      const entry = pool[i];
      if (!entry.inUse && entry.buffer.byteLength >= size) {
        entry.inUse = true;
        return entry.buffer;
      }
    }

    if (pool.length < this.maxPoolSizePerBucket) {
      const buffer = new Uint8Array(size);
      pool.push({ buffer, size, inUse: true });
      this.pools.set(bucket, pool);
      return buffer;
    }

    const buffer = new Uint8Array(size);
    return buffer;
  }

  release(buffer: Uint8Array): void {
    const bucket = this.getBucketKey(buffer.byteLength);
    const pool = this.pools.get(bucket) ?? [];

    for (const entry of pool) {
      if (entry.buffer === buffer) {
        entry.inUse = false;
        return;
      }
    }
  }

  private getBucketKey(size: number): number {
    const MB = 1024 * 1024;
    if (size <= 10 * MB) return 0;
    if (size <= 50 * MB) return 1;
    if (size <= 100 * MB) return 2;
    if (size <= 500 * MB) return 3;
    return 4;
  }

  clear(): void {
    this.pools.clear();
  }
}

const bufferPool = new BufferPool();

interface WorkerMessage {
  id: number;
  mesh?: SplatMeshLike;
  error?: string;
}

let splatWorker: Worker | null = null;
let workerRequestId = 0;
const pendingWorkerRequests = new Map<number, { resolve: (mesh: SplatMeshLike) => void; reject: (err: Error) => void }>();

async function createSplatWorker(): Promise<Worker> {
  if (!splatWorker) {
    const WorkerClass = await import('./splatWorker?worker');
    splatWorker = new WorkerClass.default();
    splatWorker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const { id, mesh, error } = e.data;
      const pending = pendingWorkerRequests.get(id);
      if (pending) {
        if (error) {
          pending.reject(new Error(error));
        } else if (mesh) {
          pending.resolve(mesh);
        }
        pendingWorkerRequests.delete(id);
      }
    };
  }
  return splatWorker;
}

async function loadMeshFromWorker(fileBytes: Uint8Array, fileName: string): Promise<SplatMeshLike> {
  const worker = await createSplatWorker();
  const id = ++workerRequestId;

  return new Promise((resolve, reject) => {
    pendingWorkerRequests.set(id, { resolve, reject });
    worker.postMessage({ fileBytes, fileName, id }, [fileBytes.buffer]);
  });
}

function getExtension(name: string): string {
  const last = name.toLowerCase().split('.').pop();
  return last ?? '';
}

function assertLoadModeAgainstFile(ext: string, mode: LoadMode): void {
  if (mode === 'spz' && ext === 'ply') {
    throw new Error('Raw .ply loading is disabled in SPZ mode. Switch mode to "Raw PLY" to continue.');
  }
}

function maybeDisposeMesh(scene: THREE.Scene, mesh?: SplatMeshLike | null): void {
  if (!mesh) {
    return;
  }

  scene.remove(mesh);
  mesh.dispose?.();
}

function releaseBuffer(buffer: Uint8Array): void {
  if (buffer) {
    bufferPool.release(buffer);
  }
}

export async function loadFromFile(file: File, options: LoadOptions): Promise<LoadedSplat> {
  const ext = getExtension(file.name);

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported extension "${ext}". Supported types: .ply, .spz, .splat, .ksplat`);
  }

  assertLoadModeAgainstFile(ext, options.mode);

  if (ext === 'ply' && options.requirePlyConfirm) {
    const accepted = await options.requirePlyConfirm(file);
    if (!accepted) {
      throw new Error('Raw .ply load canceled by user.');
    }
  }

  const sparkModule = options.sparkModule ?? (await loadSparkModule());
  assertSparkPreviewApi(sparkModule);

  const start = performance.now();
  options.onStatus?.(`Reading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

  const arrayBuffer = await file.arrayBuffer();
  const fileBytes = bufferPool.acquire(arrayBuffer.byteLength);
  fileBytes.set(new Uint8Array(arrayBuffer));
  
  options.onStatus?.('Decoding splats (LoD + source-quality buffers)... this can take time for large files.');

  let mesh: SplatMeshLike;

  if (options.useWorker && typeof Worker !== 'undefined') {
    mesh = await loadMeshFromWorker(fileBytes, file.name);
  } else {
    const meshOptions: Record<string, unknown> = {
      fileBytes,
      fileName: file.name,
      lod: true,
      nonLod: true,
      maxSh: 3
    };

    mesh = new sparkModule.SplatMesh(meshOptions);

    if (mesh.initialized) {
      await mesh.initialized;
    }
  }

  maybeDisposeMesh(options.scene, options.previousMesh ?? null);
  releaseBuffer(fileBytes);
  options.scene.add(mesh);

  const loadMs = performance.now() - start;

  return {
    mesh,
    fileType: ext as LoadedSplat['fileType'],
    numBytes: fileBytes.byteLength,
    loadMs
  };
}
