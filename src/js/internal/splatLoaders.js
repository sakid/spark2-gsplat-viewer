import { loadFromFile } from '../../viewer/loadSplat';

function maybeDispose(scene, mesh) {
  if (!mesh) return;
  scene.remove(mesh);
  mesh.dispose?.();
}

// NEW PROXY ANIMATION
export async function loadSplatFromFile({ file, scene, sparkRenderer, sparkModule, previousMesh, setStatus }) {
  const loaded = await loadFromFile(file, {
    mode: 'spz',
    enforcePreviewApi: true,
    scene,
    sparkRenderer,
    previousMesh,
    sparkModule,
    onStatus: setStatus
  });
  return loaded.mesh;
}

// NEW PROXY ANIMATION
export async function loadSplatFromUrl({ url, scene, sparkModule, previousMesh }) {
  maybeDispose(scene, previousMesh);
  const mesh = new sparkModule.SplatMesh({ url, lod: true, nonLod: true, maxSh: 3 });
  if (mesh.initialized) {
    await mesh.initialized;
  }
  scene.add(mesh);
  return mesh;
}
