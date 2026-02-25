import { createExportableVoxelMesh, exportObjectAsGlb } from '../../export/gltfExport';

function sanitizeBaseName(name) {
  return String(name || 'voxel_proxy').replace(/\.[^.]+$/, '');
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const entry of material) entry?.dispose?.();
    return;
  }
  material?.dispose?.();
}

// NEW PROXY ANIMATION
export async function exportVoxelProxyGlb({ voxelData, baseName, setStatus }) {
  if (!voxelData) {
    setStatus?.('Generate a voxel proxy first.', 'warning');
    return;
  }
  let exportMesh = null;
  try {
    exportMesh = createExportableVoxelMesh(voxelData);
    const name = `${sanitizeBaseName(baseName)}.voxel_proxy`;
    await exportObjectAsGlb(exportMesh, name);
    const activeCount = Number(exportMesh?.userData?.activeVoxelCount || 0);
    setStatus?.(`Exported voxel proxy .glb (${activeCount.toLocaleString()} active voxels).`, 'success');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setStatus?.(`Voxel proxy export failed: ${detail}`, 'error');
  } finally {
    if (!exportMesh) return;
    exportMesh.traverse((child) => {
      if (!child?.isMesh) return;
      child.geometry?.dispose?.();
      disposeMaterial(child.material);
    });
  }
}
