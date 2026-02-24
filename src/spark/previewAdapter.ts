import * as THREE from 'three';

export interface SparkRendererLike extends THREE.Object3D {
  enableLod: boolean;
  lodSplatCount: number;
  lodSplatScale: number;
  dispose?: () => void;
}

export interface SplatEditSdfLike extends THREE.Object3D {
  type: string;
  invert: boolean;
  opacity: number;
  color: THREE.Color;
  displace: THREE.Vector3;
  radius: number;
}

export interface SplatEditLike extends THREE.Object3D {
  addSdf: (sdf: SplatEditSdfLike) => void;
  removeSdf: (sdf: SplatEditSdfLike) => void;
}

export interface SplatModifierLike {
  modifier: SplatEditLike;
}

export interface SplatMeshLike extends THREE.Object3D {
  initialized?: Promise<unknown>;
  enableLod?: boolean;
  enableLoD?: boolean;
  objectModifier?: SplatModifierLike;
  worldModifier?: SplatModifierLike;
  recolor?: THREE.Color;
  opacity?: number;
  getBoundingBox?: (centersOnly?: boolean) => THREE.Box3;
  forEachSplat?: (
    callback: (
      index: number,
      center: THREE.Vector3,
      scales: THREE.Vector3,
      quaternion: THREE.Quaternion,
      opacity: number,
      color: THREE.Color
    ) => void
  ) => void;
  dispose?: () => void;
}

export interface SparkModuleLike {
  NewSparkRenderer: new (options: { renderer: THREE.WebGLRenderer }) => SparkRendererLike;
  SplatMesh: new (options: Record<string, unknown>) => SplatMeshLike;
  SplatEdit: new () => SplatEditLike;
  SplatEditSdf: new (options: {
    type?: string;
    invert?: boolean;
    opacity?: number;
    color?: THREE.Color;
    displace?: THREE.Vector3;
    radius?: number;
  }) => SplatEditSdfLike;
  SplatModifier: new (edit: SplatEditLike) => SplatModifierLike;
  transcodeSpz: (input: unknown) => Promise<{ fileBytes: Uint8Array | ArrayBuffer }>;
}

const REQUIRED_EXPORTS = ['NewSparkRenderer', 'SplatMesh', 'transcodeSpz', 'SplatEdit', 'SplatEditSdf', 'SplatModifier'] as const;

function failApiContract(missing: string[]): never {
  throw new Error(
    [
      'Strict Spark 2 preview API check failed.',
      'Missing preview symbols:',
      `- ${missing.join('\n- ')}`,
      'Provide a valid Spark 2 preview artifact at vendor/spark-preview.tgz.'
    ].join('\n')
  );
}

export function assertSparkPreviewApi(sparkModule: unknown): asserts sparkModule is SparkModuleLike {
  if (!sparkModule || typeof sparkModule !== 'object') {
    failApiContract(['module object']);
  }

  const moduleObject = sparkModule as Record<string, unknown>;
  const missing: string[] = [];

  for (const symbol of REQUIRED_EXPORTS) {
    if (!(symbol in moduleObject) || moduleObject[symbol] == null) {
      missing.push(symbol);
    }
  }

  if (missing.length > 0) {
    failApiContract(missing);
  }

  if (typeof moduleObject.NewSparkRenderer !== 'function') {
    missing.push('NewSparkRenderer constructor');
  }
  if (typeof moduleObject.SplatMesh !== 'function') {
    missing.push('SplatMesh constructor');
  }
  if (typeof moduleObject.transcodeSpz !== 'function') {
    missing.push('transcodeSpz function');
  }
  if (typeof moduleObject.SplatEdit !== 'function') {
    missing.push('SplatEdit constructor');
  }
  if (typeof moduleObject.SplatEditSdf !== 'function') {
    missing.push('SplatEditSdf constructor');
  }
  if (typeof moduleObject.SplatModifier !== 'function') {
    missing.push('SplatModifier constructor');
  }

  if (missing.length > 0) {
    failApiContract(missing);
  }
}

export async function loadSparkModule(): Promise<SparkModuleLike> {
  let moduleObject: unknown;

  try {
    moduleObject = await import('@sparkjsdev/spark');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        'Failed to import @sparkjsdev/spark preview artifact.',
        'Expected pinned file dependency: @sparkjsdev/spark -> file:vendor/spark-preview.tgz',
        `Original error: ${detail}`
      ].join('\n')
    );
  }

  assertSparkPreviewApi(moduleObject);
  return moduleObject;
}

export function createSparkRenderer(
  renderer: THREE.WebGLRenderer,
  sparkModule: SparkModuleLike
): SparkRendererLike {
  const sparkRenderer = new sparkModule.NewSparkRenderer({ renderer });

  const requiredInstanceFields: Array<keyof SparkRendererLike> = ['enableLod', 'lodSplatCount', 'lodSplatScale'];
  const missing: string[] = [];

  for (const field of requiredInstanceFields) {
    if (!(field in sparkRenderer)) {
      missing.push(`SparkRenderer.${String(field)}`);
    }
  }

  if (missing.length > 0) {
    failApiContract(missing);
  }

  sparkRenderer.enableLod = true;
  return sparkRenderer;
}
