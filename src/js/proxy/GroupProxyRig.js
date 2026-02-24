import * as THREE from 'three';

// NEW PROXY ANIMATION
export class GroupProxyRig {
  constructor(options = {}) {
    this.root = new THREE.Group();
    this.root.name = options.name ?? 'GroupProxyRig';
    this.pivot = new THREE.Group();
    this.visual = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true, transparent: true, opacity: 0.3 })
    );
    this.root.add(this.pivot);
    this.pivot.add(this.visual);
    this.elapsed = 0;
  }

  bind() {
    return this;
  }

  update(delta) {
    this.elapsed += delta;
    this.pivot.position.y = Math.sin(this.elapsed * 1.2) * 0.04;
    this.pivot.rotation.y = Math.sin(this.elapsed * 0.8) * 0.2;
  }

  getRuntimeState() {
    return {
      root: this.root,
      position: this.root.position.clone(),
      quaternion: this.root.quaternion.clone(),
      scale: this.root.scale.clone(),
      elapsed: this.elapsed
    };
  }

  dispose() {
    this.visual.geometry.dispose();
    this.visual.material.dispose();
    this.root.removeFromParent();
  }
}
