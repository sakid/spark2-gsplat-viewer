export class Component {
  constructor() {
    this.actor = null;
    this.world = null;
    this.context = null;
  }

  async init({ actor, world, context }) {
    this.actor = actor;
    this.world = world;
    this.context = context;
  }

  update(_delta) {}

  dispose() {}
}

