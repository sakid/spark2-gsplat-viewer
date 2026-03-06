import * as THREE from 'three';
import { getAdaptiveSnapForDistance } from '../viewer/lights';

export function createLightingProbeRig(): THREE.Group {
  const probeRoot = new THREE.Group();
  probeRoot.name = 'lighting-probe-rig';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: '#3f3f46', roughness: 0.95, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.85;
  ground.receiveShadow = true;
  probeRoot.add(ground);

  const matte = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 20),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9, metalness: 0.05 })
  );
  matte.position.set(-0.85, -0.4, 0);
  matte.castShadow = true;
  matte.receiveShadow = true;
  probeRoot.add(matte);

  const glossy = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 20),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.12, metalness: 0.9 })
  );
  glossy.position.set(0.85, -0.4, 0.15);
  glossy.castShadow = true;
  glossy.receiveShadow = true;
  probeRoot.add(glossy);

  return probeRoot;
}

export function adaptiveTranslationSnap(camera: THREE.Camera, object: THREE.Object3D): number {
  const position = new THREE.Vector3();
  object.getWorldPosition(position);
  const distance = camera.position.distanceTo(position);
  return getAdaptiveSnapForDistance(distance);
}

