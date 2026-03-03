import * as THREE from 'three';
import { Actor } from '../core/Actor';
import { Locomotion } from '../components/Locomotion';
import { Interactable } from '../interaction/Interactable';
import { WanderBrain } from '../npc/WanderBrain';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeBounds(object3d) {
  if (!object3d) return null;
  const box = new THREE.Box3().setFromObject(object3d);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x) || box.isEmpty()) return null;
  return box;
}

function normalizeVector3(value, fallback = new THREE.Vector3()) {
  if (value?.isVector3) return value.clone();
  if (value && typeof value === 'object') {
    return new THREE.Vector3(
      Number(value.x) || 0,
      Number(value.y) || 0,
      Number(value.z) || 0
    );
  }
  return fallback.clone();
}

export class SplatCharacterActor extends Actor {
  constructor({
    name = 'SplatCharacter',
    url,
    desiredHeight = 1.2,
    position = new THREE.Vector3(),
    wander = null,
    interactable = null
  } = {}) {
    super({ name });
    this.url = String(url || '');
    this.desiredHeight = Math.max(0.01, Number(desiredHeight) || 1.2);
    this.root.position.copy(normalizeVector3(position));
    this.baseModelOffsetY = 0;
    this.movementBlend = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.movementSpeed = 0;
    this.splatMesh = null;
    this.modelRoot = null;

    if (wander && typeof wander === 'object') {
      const locomotion = new Locomotion({
        speed: Math.max(0, Number(wander.speed) || 1.1),
        turnSpeed: Math.max(0, Number(wander.turnSpeed) || 10)
      });
      this.addComponent(locomotion);
      this.addComponent(new WanderBrain({
        center: normalizeVector3(wander.center, this.root.position),
        radius: Math.max(0, Number(wander.radius) || 2),
        minIdleSeconds: Math.max(0, Number(wander.minIdleSeconds) || 0.5),
        maxIdleSeconds: Math.max(0, Number(wander.maxIdleSeconds) || 1.8)
      }));
    }

    if (interactable && typeof interactable === 'object') {
      this.addComponent(new Interactable({
        prompt: interactable.prompt ?? 'talk',
        range: Math.max(0.25, Number(interactable.range) || 2.25),
        raycast: interactable.raycast !== false,
        dialogId: interactable.dialogId ?? null,
        speakerName: interactable.speakerName ?? name,
        onInteract: typeof interactable.onInteract === 'function' ? interactable.onInteract : null
      }));
    }
  }

  async init({ world, context }) {
    if (this.initialized) return;
    if (!this.url) throw new Error(`${this.name} requires a splat URL.`);
    if (!context?.sparkModule?.SplatMesh) throw new Error('Spark module SplatMesh is unavailable.');

    this.splatMesh = new context.sparkModule.SplatMesh({
      url: this.url,
      lod: true,
      nonLod: true,
      maxSh: 3
    });
    if (this.splatMesh.initialized) {
      await this.splatMesh.initialized;
    }
    this.splatMesh.name = `${this.name}::SplatMesh`;
    this.splatMesh.frustumCulled = false;

    this.modelRoot = new THREE.Group();
    this.modelRoot.name = `${this.name}::Model`;
    this.modelRoot.add(this.splatMesh);
    this.root.add(this.modelRoot);

    const bounds = computeBounds(this.modelRoot);
    if (bounds) {
      const height = Math.max(1e-4, bounds.max.y - bounds.min.y);
      const scale = this.desiredHeight / height;
      if (Number.isFinite(scale) && scale > 0) {
        this.root.scale.setScalar(scale);
      }
      this.root.updateMatrixWorld(true);
      const postBounds = computeBounds(this.modelRoot);
      if (postBounds) {
        this.modelRoot.position.y += -postBounds.min.y;
      }
    }
    this.baseModelOffsetY = this.modelRoot.position.y;

    await super.init({ world, context });
  }

  setMovementBlend(value) {
    this.movementBlend = clamp(Number(value) || 0, 0, 1);
  }

  update(delta) {
    super.update(delta);
    const locomotion = this.getComponent(Locomotion);
    if (locomotion) {
      const current = locomotion.velocity.length();
      const reference = Math.max(0.001, Number(locomotion.speed) || 1);
      this.movementSpeed = current;
      this.setMovementBlend(current / reference);
    }
    if (!this.modelRoot) return;

    const dt = Math.max(0, Number(delta) || 0);
    this.walkPhase += dt * (1.6 + this.movementBlend * 8.4);
    const blend = this.movementBlend;
    const bob = Math.abs(Math.sin(this.walkPhase)) * (0.015 + blend * 0.06);
    const sway = Math.sin(this.walkPhase * 2) * (0.015 + blend * 0.09);
    const pitch = Math.cos(this.walkPhase * 2) * (0.01 + blend * 0.055);
    this.modelRoot.position.y = this.baseModelOffsetY + bob;
    this.modelRoot.rotation.z = sway;
    this.modelRoot.rotation.x = pitch;
  }

  dispose() {
    super.dispose();
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
    this.modelRoot = null;
  }
}
