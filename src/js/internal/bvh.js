import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

const localSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const worldSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const worldBox = new THREE.Box3();
const inverseMatrix = new THREE.Matrix4();
const worldScale = new THREE.Vector3();
const closestPoint = new THREE.Vector3();

function triangleCount(geometry) {
  const indexed = geometry.index?.count ?? 0;
  const positions = geometry.attributes.position?.count ?? 0;
  return indexed > 0 ? indexed / 3 : positions / 3;
}

// NEW PROXY ANIMATION
export function ensureMeshBoundsTree(mesh, maxTriangles = 1500000) {
  if (!(mesh instanceof THREE.Mesh)) return false;
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return false;
  if (triangleCount(geometry) > maxTriangles) return false;
  if (!geometry.boundsTree) computeBoundsTree.call(geometry);
  return Boolean(geometry.boundsTree);
}

// NEW PROXY ANIMATION
export function disposeMeshBoundsTree(mesh) {
  const geometry = mesh?.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return;
  if (geometry.boundsTree) disposeBoundsTree.call(geometry);
}

// NEW PROXY ANIMATION
export function colliderIntersectsSphere(mesh, center, radius) {
  if (!(mesh instanceof THREE.Mesh)) return false;
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return false;
  mesh.updateMatrixWorld();

  if (geometry.boundsTree) {
    inverseMatrix.copy(mesh.matrixWorld).invert();
    worldScale.setFromMatrixScale(mesh.matrixWorld);
    const minScale = Math.max(1e-6, Math.min(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)));
    localSphere.center.copy(center).applyMatrix4(inverseMatrix);
    localSphere.radius = radius / minScale;
    const radiusSq = localSphere.radius * localSphere.radius;
    let collided = false;

    geometry.boundsTree.shapecast({
      intersectsBounds: (box) => box.intersectsSphere(localSphere),
      intersectsTriangle: (triangle) => {
        triangle.closestPointToPoint(localSphere.center, closestPoint);
        if (closestPoint.distanceToSquared(localSphere.center) > radiusSq) return false;
        collided = true;
        return true;
      }
    });
    return collided;
  }

  if (geometry.computeBoundingBox && !geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox) return false;
  worldBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  worldSphere.center.copy(center);
  worldSphere.radius = radius;
  return worldBox.intersectsSphere(worldSphere);
}
