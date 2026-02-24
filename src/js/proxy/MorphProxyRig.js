import * as THREE from 'three';

// NEW PROXY ANIMATION
export class MorphProxyRig {
  constructor(options = {}) {
    const geometry = new THREE.SphereGeometry(0.22, 24, 16);
    const morphPositions = new Float32Array(geometry.attributes.position.array.length);
    for (let i = 0; i < morphPositions.length; i += 3) {
      morphPositions[i + 0] = geometry.attributes.position.array[i + 0] * 1.2;
      morphPositions[i + 1] = geometry.attributes.position.array[i + 1] * 0.8;
      morphPositions[i + 2] = geometry.attributes.position.array[i + 2] * 1.05;
    }
    geometry.morphAttributes.position = [new THREE.BufferAttribute(morphPositions, 3)];

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xf97316, wireframe: true, transparent: true, opacity: 0.35 })
    );
    this.mesh.name = options.name ?? 'MorphProxyRig';
    this.mesh.morphTargetInfluences = [0];
    this.elapsed = 0;
  }

  bind() {
    return this;
  }

  update(delta) {
    this.elapsed += delta;
    if (this.mesh.morphTargetInfluences) {
      this.mesh.morphTargetInfluences[0] = 0.5 + 0.5 * Math.sin(this.elapsed * 2.5);
    }
    this.mesh.rotation.y += delta * 0.7;
  }

  getRuntimeState() {
    return {
      root: this.mesh,
      morph: this.mesh.morphTargetInfluences?.[0] ?? 0,
      elapsed: this.elapsed
    };
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
