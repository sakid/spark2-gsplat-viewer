// NEW PROXY ANIMATION
export function readVoxelUiConfig() {
  const resolutionInput = document.getElementById('voxel-resolution');
  const densityInput = document.getElementById('voxel-density');
  const resolution = Number(resolutionInput?.value ?? 0.5);
  const density = Number(densityInput?.value ?? 2);
  return {
    resolution: Number.isFinite(resolution) && resolution > 0 ? resolution : 0.5,
    densityThreshold: Number.isFinite(density) && density > 0 ? density : 2
  };
}
