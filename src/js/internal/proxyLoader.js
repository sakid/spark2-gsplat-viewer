import * as THREE from 'three';
import { disposeMeshBoundsTree, ensureMeshBoundsTree } from './bvh';
import { disposeMaterial, disposeObject3D } from './disposeThree';

async function loadObject(fileUrl, fileName) {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (ext === 'glb' || ext === 'gltf') {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three-stdlib'),
      import('meshoptimizer')
    ]);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(fileUrl);
    return gltf.scene ?? gltf.scenes?.[0];
  }
  if (ext === 'obj') {
    const { OBJLoader } = await import('three-stdlib');
    return await new OBJLoader().loadAsync(fileUrl);
  }
  throw new Error(`Unsupported proxy mesh format: ${ext || 'unknown'}`);
}

// NEW PROXY ANIMATION
export async function loadProxyFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const root = await loadObject(url, file.name);
    if (!root) throw new Error('Proxy load returned empty scene.');
    const material = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.2,
      depthWrite: false
    });

    const colliders = [];
    const originalMaterials = new Set();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) child.material.forEach((m) => originalMaterials.add(m));
      else if (child.material) originalMaterials.add(child.material);
      if (child.geometry?.computeBoundingBox && !child.geometry.boundingBox) child.geometry.computeBoundingBox();
      ensureMeshBoundsTree(child);
      child.material = material;
      child.castShadow = false;
      child.receiveShadow = false;
      colliders.push(child);
    });

    root.visible = false;
    root.name = file.name;
    return {
      root,
      colliders,
      dispose: () => {
        colliders.forEach((mesh) => disposeMeshBoundsTree(mesh));
        disposeObject3D(root);
        disposeMaterial([...originalMaterials]);
      },
      release: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
