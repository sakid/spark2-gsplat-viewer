import * as THREE from 'three';
import { disposeMeshBoundsTree, ensureMeshBoundsTree } from './bvh';
import { disposeObject3D } from './disposeThree';

function resolveTrackNode(root, trackName) {
  if (!root || typeof trackName !== 'string') return null;
  const propDot = trackName.lastIndexOf('.');
  if (propDot <= 0) return null;
  const binding = trackName.slice(0, propDot);
  const bonePart = binding.split('.bones[')[0];
  const parts = bonePart.split('/').filter(Boolean);
  if (parts.length > 1) {
    let cursor = root;
    for (const name of parts) {
      cursor = cursor?.getObjectByName?.(name) ?? null;
      if (!cursor) break;
    }
    if (cursor) return cursor;
  }
  const last = parts[parts.length - 1] ?? bonePart;
  return root.getObjectByName?.(last) ?? null;
}

function collectAnimatedNodes(root, animations) {
  const nodes = [];
  const scaleNodes = [];
  const seen = new Set();
  const scaleSeen = new Set();
  for (const clip of Array.isArray(animations) ? animations : []) {
    for (const track of clip?.tracks ?? []) {
      const node = resolveTrackNode(root, track?.name);
      if (!node) continue;
      if (!seen.has(node.uuid)) {
        seen.add(node.uuid);
        nodes.push(node);
      }
      if (!String(track?.name ?? '').endsWith('.scale')) continue;
      if (scaleSeen.has(node.uuid)) continue;
      scaleSeen.add(node.uuid);
      scaleNodes.push(node);
    }
  }
  return { nodes, scaleNodes };
}

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
    return { root: gltf.scene ?? gltf.scenes?.[0], animations: gltf.animations ?? [] };
  }
  if (ext === 'obj') {
    const { OBJLoader } = await import('three-stdlib');
    return { root: await new OBJLoader().loadAsync(fileUrl), animations: [] };
  }
  throw new Error(`Unsupported proxy mesh format: ${ext || 'unknown'}`);
}

// NEW PROXY ANIMATION
export async function loadProxyFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const loaded = await loadObject(url, file.name);
    const root = loaded?.root;
    if (!root) throw new Error('Proxy load returned empty scene.');
    const debugMaterial = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      wireframe: true
    });

    const colliders = [];
    const skinnedMeshes = [];
    const morphMeshes = [];
    const { nodes: animatedNodes, scaleNodes: animatedScaleNodes } = collectAnimatedNodes(root, loaded.animations);
    const originalMaterials = new Map();
    const meshes = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshes.push(child);
      originalMaterials.set(child.uuid, child.material);
      if (child.isSkinnedMesh) skinnedMeshes.push(child);
      if (Array.isArray(child.morphTargetInfluences) && child.morphTargetInfluences.length > 0) morphMeshes.push(child);
      if (child.geometry?.computeBoundingBox && !child.geometry.boundingBox) child.geometry.computeBoundingBox();
      ensureMeshBoundsTree(child);
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      colliders.push(child);
    });

    const setDebugVisual = (enabled) => {
      for (const mesh of meshes) {
        if (enabled) mesh.material = debugMaterial;
        else if (originalMaterials.has(mesh.uuid)) mesh.material = originalMaterials.get(mesh.uuid);
      }
    };

    setDebugVisual(false);
    root.visible = true;
    root.name = file.name;
    return {
      root,
      gltfRoot: root,
      animatedRoot: root,
      animations: loaded.animations,
      skinnedMeshes,
      morphMeshes,
      animatedNodes,
      animatedScaleNodes,
      colliders,
      setDebugVisual,
      dispose: () => {
        setDebugVisual(false);
        colliders.forEach((mesh) => disposeMeshBoundsTree(mesh));
        disposeObject3D(root);
        debugMaterial.dispose();
        originalMaterials.clear();
      },
      release: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
