import * as THREE from 'three';

const SYNTH_INDEX = new THREE.Vector4(0, 0, 0, 0);
const SYNTH_WEIGHT = new THREE.Vector4(1, 0, 0, 0);

// NEW PROXY ANIMATION
export function createSyntheticScaleSkinning({ splatMesh, sparkModule, restMatrix }) {
  if (!splatMesh || !sparkModule?.SplatSkinning || !restMatrix) return null;
  if (splatMesh.covSplats !== true) {
    splatMesh.covSplats = true;
    splatMesh.updateGenerator?.();
  }
  const skinning = new sparkModule.SplatSkinning({
    mesh: splatMesh,
    numBones: 1,
    mode: sparkModule.SplatSkinningMode?.LINEAR_BLEND ?? 'linear_blend'
  });
  splatMesh.forEachSplat?.((index) => skinning.setSplatBones(index, SYNTH_INDEX, SYNTH_WEIGHT));
  skinning.setRestMatrix?.(0, restMatrix);
  return skinning;
}

// NEW PROXY ANIMATION
export function updateSyntheticScaleSkinning({ skinning, matrix }) {
  if (!skinning || !matrix) return;
  skinning.setBoneMatrix?.(0, matrix);
  skinning.updateBones();
}
