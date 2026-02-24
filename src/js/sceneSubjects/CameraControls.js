import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const MOVE_SPEED = 5;
const BOOST = 3;
const GRAVITY = -14;
const JUMP_SPEED = 6;

// NEW PROXY ANIMATION
export class CameraControls {
  constructor() {
    this.keys = new Set();
    this.unsubscribers = [];
    this.verticalVelocity = 0;
    this.isGrounded = false;
    this.mode = 'view';
    this.collisionEnabled = true;
    this.tempFront = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempMove = new THREE.Vector3();
    this.tempFrom = new THREE.Vector3();
    this.tempTo = new THREE.Vector3();
    this.tempResolved = new THREE.Vector3();
    this.resolveOptions = { collisionEnabled: true, radius: 0.22, height: 1.35, out: this.tempResolved };
  }

  async init(context) {
    this.context = context;
    this.camera = context.camera;
    this.dom = context.renderer.domElement;
    this.orbit = new OrbitControls(this.camera, this.dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;

    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;

    this.unsubscribers.push(context.eventBus.on('controls:collision', (enabled) => {
      this.collisionEnabled = enabled;
    }));

    this.unsubscribers.push(context.eventBus.on('controls:mode', (mode) => {
      this.mode = mode;
      this.keys.clear();
      this.orbit.enabled = mode !== 'view';
      if (mode !== 'view' && document.pointerLockElement === this.dom) {
        document.exitPointerLock();
      }
    }));

    this.unsubscribers.push(context.eventBus.on('dom:keydown', (event) => {
      if (this.mode !== 'view') return;
      this.keys.add(event.code);
    }));

    this.unsubscribers.push(context.eventBus.on('dom:keyup', (event) => {
      this.keys.delete(event.code);
    }));

    this.unsubscribers.push(context.eventBus.on('dom:mousedown', (event) => {
      if (this.mode !== 'view') return;
      if (event.target !== this.dom || event.button !== 0) return;
      this.dom.requestPointerLock?.();
    }));

    this.unsubscribers.push(context.eventBus.on('dom:mousemove', (event) => {
      if (this.mode !== 'view') return;
      if (document.pointerLockElement !== this.dom) return;
      this.yaw -= event.movementX * 0.0022;
      this.pitch -= event.movementY * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.52, 1.52);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }));
  }

  update(delta) {
    if (this.orbit.enabled) {
      this.orbit.update();
      return;
    }

    if (this.mode !== 'view') {
      return;
    }

    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const side = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? BOOST : 1;

    this.tempFront.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.tempFront.y = 0;
    if (this.tempFront.lengthSq() < 1e-8) {
      this.tempFront.set(0, 0, -1).applyAxisAngle(this.camera.up, this.camera.rotation.y);
      this.tempFront.y = 0;
    }
    this.tempFront.normalize();
    this.tempRight.crossVectors(this.tempFront, this.camera.up).normalize();
    this.tempMove.set(0, 0, 0);
    if (forward) this.tempMove.addScaledVector(this.tempFront, forward);
    if (side) this.tempMove.addScaledVector(this.tempRight, side);

    if (this.tempMove.lengthSq() > 0) {
      this.tempMove.normalize().multiplyScalar(MOVE_SPEED * boost * delta);
    }

    if (this.collisionEnabled) {
      if (this.keys.has('Space') && this.isGrounded) {
        this.verticalVelocity = JUMP_SPEED;
        this.isGrounded = false;
      }
      this.verticalVelocity += GRAVITY * delta;
    } else {
      this.verticalVelocity = (Number(this.keys.has('KeyQ')) - Number(this.keys.has('KeyE'))) * MOVE_SPEED;
    }

    this.tempFrom.copy(this.camera.position);
    this.tempTo.copy(this.tempFrom).add(this.tempMove);
    this.tempTo.y += this.verticalVelocity * delta;

    this.resolveOptions.collisionEnabled = this.collisionEnabled;
    const resolved = this.context.resolveCameraMovement(this.tempFrom, this.tempTo, this.resolveOptions);

    const falling = this.tempTo.y < this.tempFrom.y - 1e-5;
    const blockedDownward = resolved.y > this.tempTo.y + 1e-4;
    this.isGrounded = this.collisionEnabled && falling && blockedDownward;
    if (this.isGrounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }

    this.camera.position.copy(resolved);
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) {
      unbind();
    }
    this.orbit.dispose();
  }
}
