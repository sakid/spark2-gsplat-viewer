import * as THREE from 'three';

// NEW PROXY ANIMATION
export class ProxyAnimationController {
  constructor() {
    this.mixer = null;
    this.root = null;
    this.clips = [];
    this.actions = new Map();
    this.activeAction = null;
    this.playing = true;
    this.speed = 1;
    this.lastUpdateTime = null;
  }

  nowSeconds() {
    return Date.now() / 1000;
  }

  bind(root, clips = []) {
    this.dispose();
    this.root = root ?? null;
    this.clips = Array.isArray(clips) ? clips : [];
    if (!this.root || this.clips.length === 0) return [];
    this.lastUpdateTime = this.nowSeconds();

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions.clear();
    for (const clip of this.clips) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.actions.set(clip.name || `Clip_${this.actions.size}`, action);
    }
    this.playClip(0);
    return this.getClipNames();
  }

  getClipNames() {
    return this.clips.map((clip, index) => clip.name || `Clip ${index + 1}`);
  }

  playClip(selection = 0) {
    if (!this.mixer || this.clips.length === 0) return false;
    const clip = typeof selection === 'number'
      ? this.clips[Math.max(0, Math.min(this.clips.length - 1, selection))]
      : this.clips.find((item) => item.name === selection);
    if (!clip) return false;
    const key = clip.name || `Clip_${this.clips.indexOf(clip)}`;
    const next = this.actions.get(key) ?? this.mixer.clipAction(clip);
    if (this.activeAction && this.activeAction !== next) this.activeAction.stop();
    next.reset();
    if (Number.isFinite(clip.duration) && clip.duration > 5) {
      next.time = Math.min(clip.duration * 0.1, Math.max(clip.duration - 1e-4, 0));
    }
    next.setEffectiveTimeScale(this.speed);
    if (this.playing) next.play();
    this.activeAction = next;
    return true;
  }

  setPlaying(enabled) {
    this.playing = Boolean(enabled);
    if (!this.activeAction) return;
    this.activeAction.paused = !this.playing;
    if (this.playing) {
      this.lastUpdateTime = this.nowSeconds();
      this.activeAction.play();
    }
  }

  restart() {
    if (!this.activeAction) return;
    this.activeAction.reset().play();
    this.activeAction.paused = !this.playing;
  }

  setSpeed(value) {
    this.speed = Math.max(0, Number(value) || 0);
    if (this.activeAction) this.activeAction.setEffectiveTimeScale(this.speed);
  }

  update(delta) {
    if (!this.mixer) return;
    const now = this.nowSeconds();
    if (this.lastUpdateTime == null) this.lastUpdateTime = now;
    const wallDelta = Math.max(0, now - this.lastUpdateTime);
    this.lastUpdateTime = now;
    if (!this.playing || this.speed <= 0) return;
    const frameDelta = Math.max(0, Number(delta) || 0);
    const step = THREE.MathUtils.clamp(Math.max(frameDelta, wallDelta), 1 / 240, 0.5);
    this.mixer.update(step);
  }

  dispose() {
    if (this.mixer) this.mixer.stopAllAction();
    this.actions.clear();
    this.activeAction = null;
    this.clips = [];
    this.mixer = null;
    this.root = null;
    this.playing = true;
    this.speed = 1;
    this.lastUpdateTime = null;
  }
}
