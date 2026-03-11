import * as THREE from 'three';
import type { SceneCameraV1 } from '../scene/sceneState';

export function toSceneCamera(camera: THREE.PerspectiveCamera): SceneCameraV1 {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    fov: camera.fov,
    near: camera.near,
    far: camera.far
  };
}

export function applySceneCamera(camera: THREE.PerspectiveCamera, sceneCamera: SceneCameraV1): void {
  camera.position.set(...sceneCamera.position);
  camera.quaternion.set(...sceneCamera.quaternion);
  camera.fov = sceneCamera.fov;
  camera.near = sceneCamera.near;
  camera.far = sceneCamera.far;
  camera.updateProjectionMatrix();
}

