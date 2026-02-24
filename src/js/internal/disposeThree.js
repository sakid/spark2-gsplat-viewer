import * as THREE from 'three';

function disposeTexture(texture) {
  if (!texture || !(texture instanceof THREE.Texture)) {
    return;
  }
  texture.dispose();
}

// NEW PROXY ANIMATION
export function disposeMaterial(material) {
  if (!material) {
    return;
  }

  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) {
    if (!entry) continue;
    for (const key of Object.keys(entry)) {
      disposeTexture(entry[key]);
    }
    entry.dispose?.();
  }
}

// NEW PROXY ANIMATION
export function disposeObject3D(root) {
  if (!root) {
    return;
  }

  const geometries = new Set();
  const materials = new Set();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.geometry) geometries.add(child.geometry);
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else if (mat) materials.add(mat);
  });

  for (const geometry of geometries) {
    geometry.dispose?.();
  }
  disposeMaterial([...materials]);
}
