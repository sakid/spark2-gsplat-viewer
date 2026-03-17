import * as THREE from 'three';
import { Component } from '../core/Component';
import { Locomotion } from '../components/Locomotion';

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickClipKey(keys, patterns) {
  const normalized = keys.map((key) => String(key).toLowerCase());
  for (const pattern of patterns) {
    const index = normalized.findIndex((key) => key.includes(pattern));
    if (index >= 0) return keys[index];
  }
  return keys[0] ?? null;
}

export class WanderBrain extends Component {
  constructor({
    center = new THREE.Vector3(0, 0, 0),
    radius = 2.5,
    minIdleSeconds = 0.6,
    maxIdleSeconds = 2.2
  } = {}) {
    super();
    this.center = center.clone();
    this.radius = Math.max(0, Number(radius) || 0);
    this.minIdleSeconds = Math.max(0, Number(minIdleSeconds) || 0);
    this.maxIdleSeconds = Math.max(this.minIdleSeconds, Number(maxIdleSeconds) || 0);

    this.idleUntil = 0;
    this.clock = 0;
    this.hadTarget = false;
    this.tmpTarget = new THREE.Vector3();

    this.animator = null;
    this.idleKey = null;
    this.walkKey = null;
  }

  async init({ actor, world, context }) {
    await super.init({ actor, world, context });
    this.locomotion = actor.getComponent(Locomotion);
    this.animator = actor.animator ?? null;
    const keys = this.animator?.getClipKeys?.() ?? [];
    this.idleKey = pickClipKey(keys, ['idle', 'stand', 'breath']);
    this.walkKey = pickClipKey(keys, ['walk', 'run', 'jog']);
  }

  setAnimator(animator) {
    this.animator = animator ?? null;
    const keys = this.animator?.getClipKeys?.() ?? [];
    this.idleKey = pickClipKey(keys, ['idle', 'stand', 'breath']);
    this.walkKey = pickClipKey(keys, ['walk', 'run', 'jog']);
  }

  pickNewTarget() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.radius;
    this.tmpTarget.set(
      this.center.x + Math.cos(angle) * r,
      this.center.y,
      this.center.z + Math.sin(angle) * r
    );
    return this.tmpTarget.clone();
  }

  update(delta) {
    const dt = Math.max(0, Number(delta) || 0);
    this.clock += dt;
    if (!this.locomotion) return;

    const dialog = this.world?.dialog ?? null;
    const isSpeaker = Boolean(dialog?.active && dialog?.speakerActor?.id && dialog.speakerActor.id === this.actor?.id);
    if (isSpeaker) {
      this.locomotion.stop();
      if (this.animator && this.idleKey) this.animator.play(this.idleKey);
      return;
    }

    const hasTarget = Boolean(this.locomotion.target);

    if (this.hadTarget && !hasTarget) {
      this.idleUntil = this.clock + randomBetween(this.minIdleSeconds, this.maxIdleSeconds);
    }
    this.hadTarget = hasTarget;

    if (!hasTarget && this.clock < this.idleUntil) {
      this.locomotion.stop();
      if (this.animator && this.idleKey) this.animator.play(this.idleKey);
      return;
    }

    if (!hasTarget && this.clock >= this.idleUntil) {
      const target = this.pickNewTarget();
      this.locomotion.moveTo(target);
    }

    if (this.animator) {
      if (this.locomotion.target && this.walkKey) this.animator.play(this.walkKey);
      else if (this.idleKey) this.animator.play(this.idleKey);
    }
  }
}
