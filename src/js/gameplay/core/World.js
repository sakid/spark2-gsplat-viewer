export class World {
  constructor({ context }) {
    this.context = context;
    this.actors = [];
    this.actorById = new Map();
    this.enabled = true;

    this.state = null;
    this.dialog = null;
    this.interactables = new Set();
    this.player = null;
  }

  async addActor(actor) {
    if (!actor) return null;
    this.actors.push(actor);
    if (actor.id) this.actorById.set(actor.id, actor);
    await actor.init({ world: this, context: this.context });
    if (actor.root && this.context?.scene) this.context.scene.add(actor.root);
    return actor;
  }

  removeActor(actor) {
    const index = this.actors.indexOf(actor);
    if (index >= 0) this.actors.splice(index, 1);
    if (actor?.id) this.actorById.delete(actor.id);
    actor?.dispose?.();
  }

  getActorById(id) {
    if (!id) return null;
    return this.actorById.get(id) ?? null;
  }

  update(delta) {
    if (!this.enabled) return;
    for (const actor of this.actors) actor?.update?.(delta);
  }

  dispose() {
    for (const actor of [...this.actors].reverse()) actor?.dispose?.();
    this.actors.length = 0;
    this.actorById.clear();
    this.interactables.clear();
  }
}
