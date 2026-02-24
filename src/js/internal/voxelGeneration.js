import { generateVoxelMesh } from '../../viewer/voxelizer';
import { readVoxelUiConfig } from './voxelUi';

const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function meshLodKey(mesh) {
  if (!mesh || typeof mesh !== 'object') return null;
  if ('enableLod' in mesh) return 'enableLod';
  if ('enableLoD' in mesh) return 'enableLoD';
  return null;
}

function forceSourceDetail(mesh) {
  const key = meshLodKey(mesh);
  if (!key) return () => {};
  const previous = mesh[key];
  mesh[key] = false;
  return () => {
    mesh[key] = previous;
  };
}

function forceStableRendererLod(sparkRenderer) {
  if (!sparkRenderer) return () => {};
  const previous = {
    enableLod: sparkRenderer.enableLod,
    lodSplatCount: sparkRenderer.lodSplatCount,
    lodSplatScale: sparkRenderer.lodSplatScale
  };
  sparkRenderer.enableLod = true;
  sparkRenderer.lodSplatCount = Math.max(Number(previous.lodSplatCount) || 0, 12000000);
  sparkRenderer.lodSplatScale = Math.min(Number(previous.lodSplatScale) || 1, 0.15);
  return () => {
    sparkRenderer.enableLod = previous.enableLod;
    sparkRenderer.lodSplatCount = previous.lodSplatCount;
    sparkRenderer.lodSplatScale = previous.lodSplatScale;
  };
}

function densityCandidates(value) {
  const base = Math.max(1, Math.floor(Number(value) || 1));
  const half = Math.max(1, Math.floor(base * 0.5));
  return [...new Set([base, half, 1])];
}

function minOpacityCandidates() {
  return [0.1, 0.05, 0.02, 0.0];
}

// NEW PROXY ANIMATION
export async function generateStableVoxelData({ splatMesh, sparkRenderer, setStatus }) {
  const config = readVoxelUiConfig();
  const restoreMesh = forceSourceDetail(splatMesh);
  const restoreRenderer = forceStableRendererLod(sparkRenderer);
  try {
    await waitFrame();
    await waitFrame();
    for (const minOpacity of minOpacityCandidates()) {
      for (const densityThreshold of densityCandidates(config.densityThreshold)) {
        const data = await generateVoxelMesh(splatMesh, { ...config, densityThreshold, minOpacity });
        if (!data) continue;
        if (data.activeCount < 200 && (densityThreshold > 1 || minOpacity > 0)) {
          setStatus?.('Voxel output too sparse; relaxing density/opacity filters.', 'info');
          continue;
        }
        if (densityThreshold !== config.densityThreshold || minOpacity !== 0.1) {
          setStatus?.(`Voxel generation auto-adjusted (density=${densityThreshold}, minOpacity=${minOpacity}).`, 'info');
        }
        return data;
      }
    }
    return null;
  } finally {
    restoreMesh();
    restoreRenderer();
    await waitFrame();
  }
}
