import * as THREE from 'three';

function normalizeFocusPayload(interactable) {
  if (!interactable) return { interactable: null };
  return {
    interactable: {
      id: interactable.actor?.id ?? interactable.actor?.root?.uuid ?? null,
      prompt: interactable.prompt ?? 'Talk',
      speakerName: interactable.speakerName ?? interactable.actor?.name ?? null,
      dialogId: interactable.dialogId ?? null
    }
  };
}

export class Interactor {
  constructor({ world, eventBus, camera }) {
    this.world = world;
    this.eventBus = eventBus;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.tmpOrigin = new THREE.Vector3();
    this.tmpDir = new THREE.Vector3();
    this.throttleSeconds = 0.1;
    this.cooldown = 0;
    this.focused = null;
  }

  update(delta) {
    const dt = Math.max(0, Number(delta) || 0);
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = this.throttleSeconds;
    this.computeFocus();
  }

  computeFocus() {
    if (!this.camera || !this.world?.interactables) return;
    this.camera.getWorldPosition(this.tmpOrigin);
    this.camera.getWorldDirection(this.tmpDir);
    this.raycaster.set(this.tmpOrigin, this.tmpDir);
    this.raycaster.far = 100;

    let best = null;
    let bestScore = Infinity;

    for (const interactable of this.world.interactables) {
      if (!interactable?.actor?.root) continue;
      const range = Math.max(0, Number(interactable.range) || 0);
      if (!Number.isFinite(range) || range <= 0) continue;

      const worldObject = interactable.getWorldObject?.() ?? interactable.actor.root;
      if (!worldObject) continue;

      const pos = new THREE.Vector3();
      worldObject.getWorldPosition(pos);
      const dist = pos.distanceTo(this.tmpOrigin);
      if (dist > range) continue;

      let score = dist;
      if (interactable.raycast) {
        const hits = this.raycaster.intersectObject(worldObject, true);
        if (!hits.length) continue;
        score = hits[0].distance;
        if (score > range) continue;
      }

      if (score < bestScore) {
        bestScore = score;
        best = interactable;
      }
    }

    if (best === this.focused) return;
    this.focused = best;
    this.eventBus.emit('interaction:focusChanged', normalizeFocusPayload(best));
  }

  tryInteract() {
    const interactable = this.focused;
    if (!interactable) return false;
    interactable.onInteract?.({ world: this.world, actor: interactable.actor });
    return true;
  }
}

