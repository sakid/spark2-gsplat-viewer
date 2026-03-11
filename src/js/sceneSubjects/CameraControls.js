import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { frameCameraToObject } from '../internal/cameraFrame';

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
    this.navigationMode = 'fly';
    this.orbitSuppressed = false;
    this.collisionEnabled = false;
    this.tempFront = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempMove = new THREE.Vector3();
    this.tempFrom = new THREE.Vector3();
    this.tempTo = new THREE.Vector3();
    this.tempResolved = new THREE.Vector3();
    this.resolveOptions = { collisionEnabled: false, radius: 0.22, height: 1.35, out: this.tempResolved };
    this.selectedObject = null;
    this.selectedFrameObject = null;
    this.preventContextMenu = (event) => {
      event.preventDefault();
    };
  }

  async init(context) {
    this.context = context;
    this.camera = context.camera;
    this.dom = context.renderer.domElement;
    this.orbit = new OrbitControls(this.camera, this.dom);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    if (typeof this.dom?.addEventListener === 'function') {
      this.dom.addEventListener('contextmenu', this.preventContextMenu);
    }

    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;

    this.unsubscribers.push(context.eventBus.on('controls:collision', (enabled) => {
      this.collisionEnabled = Boolean(enabled);
      this.emitPlayerState();
    }));

    this.unsubscribers.push(context.eventBus.on('controls:mode', (mode) => {
      this.mode = mode ?? 'view';
      this.keys.clear();
      this.updateOrbitEnabled();
      if ((mode !== 'view' || this.navigationMode !== 'fly') && this.isPointerLockedToDom()) {
        document.exitPointerLock();
      }
      this.emitPlayerState();
    }));

    this.unsubscribers.push(context.eventBus.on('controls:navigationMode', (mode) => {
      this.navigationMode = mode === 'orbit' ? 'orbit' : 'fly';
      this.keys.clear();
      this.updateOrbitEnabled();
      if (this.navigationMode !== 'fly' && this.isPointerLockedToDom()) {
        document.exitPointerLock();
      }
      this.emitPlayerState();
    }));

    this.unsubscribers.push(context.eventBus.on('controls:orbitSuppress', (suppressed) => {
      this.orbitSuppressed = Boolean(suppressed);
      this.updateOrbitEnabled();
    }));

    this.unsubscribers.push(context.eventBus.on('dom:keydown', (event) => {
      if (this.mode !== 'view' || this.navigationMode !== 'fly') return;
      this.keys.add(event.code);
    }));

    this.unsubscribers.push(context.eventBus.on('dom:keyup', (event) => {
      this.keys.delete(event.code);
    }));

    this.unsubscribers.push(context.eventBus.on('dom:mousedown', (event) => {
      if (this.mode !== 'view' || this.navigationMode !== 'fly') return;
      if (event.target !== this.dom || event.button !== 2) return;
      event.preventDefault?.();
      this.dom.requestPointerLock?.();
    }));

    this.unsubscribers.push(context.eventBus.on('dom:mouseup', (event) => {
      if (this.mode !== 'view' || this.navigationMode !== 'fly') return;
      if (event.button !== 2) return;
      if (this.isPointerLockedToDom()) {
        document.exitPointerLock();
      }
    }));

    this.unsubscribers.push(context.eventBus.on('dom:mousemove', (event) => {
      if (this.mode !== 'view' || this.navigationMode !== 'fly') return;
      if (!this.isPointerLockedToDom()) return;
      this.yaw -= event.movementX * 0.0022;
      this.pitch -= event.movementY * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.52, 1.52);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }));

    this.unsubscribers.push(context.eventBus.on('dom:pointerlockchange', () => {
      if (this.isPointerLockedToDom()) return;
      this.keys.clear();
      this.emitPlayerState();
    }));

    this.unsubscribers.push(context.eventBus.on('selectionChanged', (payload) => {
      this.selectedObject = payload?.object ?? null;
      this.selectedFrameObject = payload?.frameObject
        ?? payload?.object?.userData?.editorFocusTarget
        ?? this.selectedObject;
    }));

    this.unsubscribers.push(context.eventBus.on('selection:focusRequested', () => {
      this.focusSelectedObject();
    }));

    this.emitPlayerState();
  }

  emitPlayerState() {
    if (!this.context?.eventBus || !this.camera) return;
    this.context.eventBus.emit('player:stateChanged', {
      collisionEnabled: this.collisionEnabled,
      isGrounded: this.isGrounded,
      mode: this.mode,
      navigationMode: this.navigationMode,
      pointerLocked: this.isPointerLockedToDom(),
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      }
    });
  }

  updateOrbitEnabled() {
    if (!this.orbit) return;
    const viewOrbit = this.mode === 'view' && this.navigationMode === 'orbit';
    this.orbit.enabled = (this.mode !== 'view' || viewOrbit) && !this.orbitSuppressed;
  }

  isPointerLockedToDom() {
    return typeof document !== 'undefined' && document.pointerLockElement === this.dom;
  }

  focusSelectedObject() {
    const selected = this.selectedObject;
    if (!selected) {
      this.context?.setStatus?.('Select an object to focus.', 'warning');
      return;
    }
    const target = this.selectedFrameObject ?? selected;
    if (target === this.camera || target?.isCamera) {
      this.context?.setStatus?.('Cannot frame active player camera.', 'warning');
      return;
    }

    const center = frameCameraToObject(this.camera, target);
    if (!center) {
      this.context?.setStatus?.('Unable to focus selected object.', 'warning');
      return;
    }

    if (this.orbit?.target?.copy) {
      this.orbit.target.copy(center);
      this.orbit.update?.();
    }

    this.context?.setStatus?.(
      `Focused ${selected.name || selected.type || selected.uuid || 'object'}.`,
      'info'
    );
    this.emitPlayerState();
  }

  update(delta) {
    if (this.orbit.enabled) {
      this.orbit.update();
      return;
    }

    if (this.mode !== 'view') {
      return;
    }

    if (this.navigationMode !== 'fly') {
      return;
    }

    if (!this.isPointerLockedToDom()) {
      return;
    }

    const step = Math.min(Math.max(delta, 0), 0.05);
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
      this.tempMove.normalize().multiplyScalar(MOVE_SPEED * boost * step);
    }

    if (this.collisionEnabled) {
      if (this.keys.has('Space') && this.isGrounded) {
        this.verticalVelocity = JUMP_SPEED;
        this.isGrounded = false;
      }
      this.verticalVelocity += GRAVITY * step;
    } else {
      this.verticalVelocity = (Number(this.keys.has('KeyQ')) - Number(this.keys.has('KeyE'))) * MOVE_SPEED;
    }

    this.tempFrom.copy(this.camera.position);
    this.tempTo.copy(this.tempFrom).add(this.tempMove);
    this.tempTo.y += this.verticalVelocity * step;

    const wasGrounded = this.isGrounded;
    this.resolveOptions.collisionEnabled = this.collisionEnabled;
    const resolved = this.context.resolveCameraMovement(this.tempFrom, this.tempTo, this.resolveOptions);

    const falling = this.tempTo.y < this.tempFrom.y - 1e-5;
    const blockedDownward = resolved.y > this.tempTo.y + 1e-4;
    this.isGrounded = this.collisionEnabled && falling && blockedDownward;
    if (this.isGrounded && this.verticalVelocity < 0) {
      this.verticalVelocity = 0;
    }

    this.camera.position.copy(resolved);
    if (wasGrounded !== this.isGrounded) {
      this.emitPlayerState();
    }
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) {
      unbind();
    }
    if (typeof this.dom?.removeEventListener === 'function') {
      this.dom.removeEventListener('contextmenu', this.preventContextMenu);
    }
    this.orbit.dispose();
  }
}
