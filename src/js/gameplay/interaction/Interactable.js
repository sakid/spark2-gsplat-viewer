import { Component } from '../core/Component';

export class Interactable extends Component {
  constructor({
    prompt = 'Talk',
    range = 2.0,
    raycast = true,
    dialogId = null,
    speakerName = null,
    onInteract = null
  } = {}) {
    super();
    this.prompt = String(prompt || 'Talk');
    this.range = Math.max(0, Number(range) || 0);
    this.raycast = raycast !== false;
    this.dialogId = dialogId ? String(dialogId) : null;
    this.speakerName = speakerName ? String(speakerName) : null;
    this.customOnInteract = typeof onInteract === 'function' ? onInteract : null;
  }

  getWorldObject() {
    return this.actor?.root ?? null;
  }

  async init({ actor, world, context }) {
    await super.init({ actor, world, context });
    world?.interactables?.add?.(this);
  }

  onInteract({ world, actor }) {
    if (this.customOnInteract) return this.customOnInteract({ world, actor, interactable: this });
    if (this.dialogId && world?.context?.eventBus) {
      world.context.eventBus.emit('dialog:startRequested', {
        id: this.dialogId,
        speakerActorId: actor?.id ?? null
      });
    }
  }

  dispose() {
    this.world?.interactables?.delete?.(this);
  }
}
