import * as THREE from 'three';

function createActorId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `actor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class Actor {
  constructor({ id = null, name = 'Actor', root = null } = {}) {
    this.id = id ?? createActorId();
    this.name = name;
    this.root = root ?? new THREE.Group();
    this.root.name = this.root.name || name;
    this.components = [];
    this.componentByType = new Map();
    this.initialized = false;
  }

  addComponent(component) {
    if (!component) return component;
    this.components.push(component);
    this.componentByType.set(component.constructor, component);
    return component;
  }

  getComponent(ComponentType) {
    return this.componentByType.get(ComponentType) ?? null;
  }

  async init({ world, context }) {
    if (this.initialized) return;
    this.initialized = true;
    for (const component of this.components) {
      if (typeof component?.init === 'function') {
        await component.init({ actor: this, world, context });
      }
    }
  }

  update(delta) {
    for (const component of this.components) component?.update?.(delta);
  }

  dispose() {
    for (const component of [...this.components].reverse()) component?.dispose?.();
    this.components.length = 0;
    this.componentByType.clear();
    this.root?.removeFromParent?.();
  }
}
