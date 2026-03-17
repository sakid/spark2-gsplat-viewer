import * as THREE from 'three';
import { Component } from '../core/Component';

export class Locomotion extends Component {
  constructor({ speed = 0.8, turnSpeed = 8 } = {}) {
    super();
    this.speed = Math.max(0, Number(speed) || 0);
    this.turnSpeed = Math.max(0, Number(turnSpeed) || 0);

    this.target = null; // THREE.Vector3
    this.arriveRadius = 0.2;
    this.velocity = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.tmpForward = new THREE.Vector3(0, 0, 1);
    this.tmpQuat = new THREE.Quaternion();
  }

  moveTo(target, { speed = this.speed, arriveRadius = this.arriveRadius } = {}) {
    this.target = target ? target.clone?.() ?? new THREE.Vector3(target.x, target.y, target.z) : null;
    this.speed = Math.max(0, Number(speed) || 0);
    this.arriveRadius = Math.max(0, Number(arriveRadius) || 0);
  }

  stop() {
    this.target = null;
    this.velocity.set(0, 0, 0);
  }

  get isMoving() {
    return this.velocity.lengthSq() > 1e-6;
  }

  update(delta) {
    const root = this.actor?.root;
    if (!root) return;
    const dt = Math.max(0, Number(delta) || 0);
    if (!this.target || dt <= 0) {
      this.velocity.multiplyScalar(0.85);
      if (this.velocity.lengthSq() < 1e-6) this.velocity.set(0, 0, 0);
      return;
    }

    this.tmp.copy(this.target);
    this.tmp.y = root.position.y;
    const toTarget = this.tmp.sub(root.position);
    const dist = toTarget.length();
    if (dist <= this.arriveRadius) {
      this.stop();
      return;
    }

    toTarget.multiplyScalar(1 / Math.max(dist, 1e-6));
    this.velocity.copy(toTarget).multiplyScalar(this.speed);
    root.position.addScaledVector(this.velocity, dt);

    if (this.turnSpeed > 0 && this.velocity.lengthSq() > 1e-6) {
      const dir = this.tmp.copy(this.velocity).normalize();
      const desiredYaw = Math.atan2(dir.x, dir.z);
      this.tmpQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, desiredYaw);
      root.quaternion.slerp(this.tmpQuat, THREE.MathUtils.clamp(this.turnSpeed * dt, 0, 1));
    }
  }
}

