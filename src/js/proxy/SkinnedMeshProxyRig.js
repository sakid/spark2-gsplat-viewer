import * as THREE from 'three';

// NEW PROXY ANIMATION
export class SkinnedMeshProxyRig {
  constructor(options = {}) {
    this.root = new THREE.Group();
    this.root.name = options.name ?? 'SkinnedMeshProxyRig';

    const geometry = new THREE.PlaneGeometry(1.4, 0.5, 10, 1);
    geometry.rotateY(Math.PI / 2);
    this.#applySkinAttributes(geometry);

    const material = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      wireframe: true,
      transparent: true,
      opacity: 0.32
    });

    this.bones = this.#createBones();
    this.mesh = new THREE.SkinnedMesh(geometry, material);
    this.mesh.name = 'ButterflyProxySkinnedMesh';
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.root.add(this.mesh);
    this.elapsed = 0;
  }

  #createBones() {
    const root = new THREE.Bone();
    const left = new THREE.Bone();
    const right = new THREE.Bone();
    root.position.set(0, 0, 0);
    left.position.set(0.22, 0, 0);
    right.position.set(-0.22, 0, 0);
    root.add(left, right);
    return [root, left, right];
  }

  #applySkinAttributes(geometry) {
    const position = geometry.attributes.position;
    const skinIndices = [];
    const skinWeights = [];

    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const t = THREE.MathUtils.clamp((y + 0.25) / 0.5, 0, 1);
      const rootWeight = 1 - t;
      const wingWeight = t;
      const x = position.getX(i);
      const wingBone = x >= 0 ? 1 : 2;
      skinIndices.push(0, wingBone, 0, 0);
      skinWeights.push(rootWeight, wingWeight, 0, 0);
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  }

  bind() {
    return this;
  }

  update(delta) {
    this.elapsed += delta;
    const flap = Math.sin(this.elapsed * 8.0) * 0.75;
    this.bones[1].rotation.z = flap;
    this.bones[2].rotation.z = -flap;
    this.mesh.updateMatrixWorld(true);
  }

  getRuntimeState() {
    return {
      root: this.root,
      bones: this.bones,
      elapsed: this.elapsed
    };
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.root.removeFromParent();
  }
}
