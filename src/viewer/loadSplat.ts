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
}

export interface LoadedSplat {
  mesh: SplatMeshLike;
  fileType: 'ply' | 'spz' | 'splat' | 'ksplat';
  numBytes: number;
  loadMs: number;
}

const ALLOWED_EXTENSIONS = new Set(['ply', 'spz', 'splat', 'ksplat']);

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

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  options.onStatus?.('Decoding splats (LoD + source-quality buffers)... this can take time for large files.');

  const meshOptions: Record<string, unknown> = {
    fileBytes,
    fileName: file.name,
    lod: true,
    nonLod: true,
    maxSh: 3
  };

  const mesh = new sparkModule.SplatMesh(meshOptions);

  if (mesh.initialized) {
    await mesh.initialized;
  }

  maybeDisposeMesh(options.scene, options.previousMesh ?? null);
  options.scene.add(mesh);

  const loadMs = performance.now() - start;

  return {
    mesh,
    fileType: ext as LoadedSplat['fileType'],
    numBytes: fileBytes.byteLength,
    loadMs
  };
}
