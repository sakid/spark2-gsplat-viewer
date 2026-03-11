import '@sparkjsdev/spark';
import type { SplatMeshLike } from '../spark/previewAdapter';

interface SplatWorkerInput {
  fileBytes: Uint8Array;
  fileName: string;
  id: number;
}

interface SplatWorkerOutput {
  id: number;
  mesh?: SplatMeshLike;
  error?: string;
}

let sparkModule: typeof import('@sparkjsdev/spark') | null = null;

const initSparkModule = async (): Promise<typeof import('@sparkjsdev/spark')> => {
  if (!sparkModule) {
    sparkModule = await import('@sparkjsdev/spark');
  }
  return sparkModule;
};

self.onmessage = async (e: MessageEvent<SplatWorkerInput>): Promise<void> => {
  const { fileBytes, fileName, id } = e.data;

  try {
    const module = await initSparkModule();

    const meshOptions: Record<string, unknown> = {
      fileBytes,
      fileName,
      lod: true,
      nonLod: true,
      maxSh: 3
    };

    const mesh = new module.SplatMesh(meshOptions) as SplatMeshLike;

    if (mesh.initialized) {
      await mesh.initialized;
    }

    const output: SplatWorkerOutput = { id, mesh };
    self.postMessage(output);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const output: SplatWorkerOutput = { id, error: errorMessage };
    self.postMessage(output);
  }
};

export default {} as typeof self;
