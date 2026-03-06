import * as THREE from 'three';

function normalizeKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

export class Animator {
  constructor({ root = null, clips = [], defaultFadeSeconds = 0.15 } = {}) {
    this.root = root ?? null;
    this.clips = Array.isArray(clips) ? clips : [];
    this.defaultFadeSeconds = Math.max(0, Number(defaultFadeSeconds) || 0);

    this.mixer = null;
    this.actions = new Map(); // key -> AnimationAction
    this.activeKey = null;
    this.speed = 1;
  }

  bind({ root, clips }) {
    this.dispose();
    this.root = root ?? null;
    this.clips = Array.isArray(clips) ? clips : [];
    if (!this.root || this.clips.length === 0) return [];

    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of this.clips) {
      const key = normalizeKey(clip?.name) || `clip_${this.actions.size}`;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      this.actions.set(key, action);
    }
    return this.getClipKeys();
  }

  getClipKeys() {
    return [...this.actions.keys()];
  }

  has(key) {
    return this.actions.has(normalizeKey(key));
  }

  play(key, { fadeSeconds = this.defaultFadeSeconds, restart = false } = {}) {
    if (!this.mixer) return false;
    const nextKey = normalizeKey(key);
    const next = this.actions.get(nextKey);
    if (!next) return false;

    const currentKey = this.activeKey;
    const current = currentKey ? this.actions.get(currentKey) : null;
    const fade = Math.max(0, Number(fadeSeconds) || 0);

    if (current && current !== next) {
      if (fade > 0) current.crossFadeTo(next, fade, false);
      else current.stop();
    }

    if (restart || current !== next) next.reset();
    next.setEffectiveTimeScale(this.speed);
    next.play();
    this.activeKey = nextKey;
    return true;
  }

  setSpeed(value) {
    this.speed = Math.max(0, Number(value) || 0);
    const active = this.activeKey ? this.actions.get(this.activeKey) : null;
    if (active) active.setEffectiveTimeScale(this.speed);
  }

  update(delta) {
    if (!this.mixer) return;
    const step = THREE.MathUtils.clamp(Math.max(0, Number(delta) || 0), 1 / 240, 0.25);
    if (this.speed <= 0) return;
    this.mixer.update(step);
  }

  dispose() {
    if (this.mixer) this.mixer.stopAllAction();
    this.actions.clear();
    this.mixer = null;
    this.activeKey = null;
    this.root = null;
    this.clips = [];
    this.speed = 1;
  }
}

