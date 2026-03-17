import { resolveCameraMovement as resolveMovement } from '../internal/collisionResolver';

function flattenMapValues(map, target) {
  target.length = 0;
  for (const list of map.values()) target.push(...list);
}

export function replaceColliders(state, owner, colliders) {
  const filtered = colliders.filter(Boolean);
  state.colliderMap.set(owner, filtered);
  flattenMapValues(state.colliderMap, state.colliders);
  for (const mesh of filtered) {
    const geometry = mesh.geometry;
    if (geometry?.computeBoundingBox && !geometry.boundingBox) geometry.computeBoundingBox();
  }
}

export function setDynamicColliders(state, owner, colliders) {
  state.dynamicColliderMap.set(owner, Array.isArray(colliders) ? colliders : []);
  flattenMapValues(state.dynamicColliderMap, state.dynamicColliders);
}

export function clearDynamicColliders(state, owner) {
  state.dynamicColliderMap.delete(owner);
  flattenMapValues(state.dynamicColliderMap, state.dynamicColliders);
}

export function resolveCameraMovement(state, from, to, options) {
  if (!options.collisionEnabled) return to;
  const out = options.out ?? state.tempResolved;
  return resolveMovement({
    from,
    to,
    out,
    colliders: state.colliders,
    dynamicColliders: state.dynamicColliders,
    voxelData: state.voxelCollisionData,
    radius: options.radius,
    height: options.height
  });
}

