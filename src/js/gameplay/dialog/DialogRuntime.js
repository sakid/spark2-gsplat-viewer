import { evalCondition } from './conditions';

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function renderTemplate(text, state) {
  const raw = String(text ?? '');
  return raw.replace(/\{\{\s*(var|flag)\.([a-zA-Z0-9_.:-]+)\s*\}\}/g, (_match, kind, key) => {
    if (kind === 'var') {
      const value = state.getVar(key);
      return value == null ? '' : String(value);
    }
    if (kind === 'flag') {
      return state.getFlag(key) ? 'true' : 'false';
    }
    return '';
  });
}

function pickClipKey(keys, hint) {
  const hintKey = normalizeKey(hint);
  if (!hintKey) return null;
  const normalized = keys.map((k) => normalizeKey(k));
  const index = normalized.findIndex((k) => k.includes(hintKey));
  if (index >= 0) return keys[index];
  return null;
}

export class DialogRuntime {
  constructor({ eventBus, state, store, world }) {
    this.eventBus = eventBus;
    this.state = state;
    this.store = store;
    this.world = world;

    this.active = false;
    this.graph = null;
    this.graphId = null;
    this.nodeId = null;
    this.previousMode = 'view';
    this.speakerActor = null;
    this.history = [];
    this.renderedText = '';
    this.choices = [];
  }

  getSnapshot() {
    return {
      active: this.active,
      graphId: this.graphId,
      nodeId: this.nodeId,
      speaker: this.speakerActor?.name ?? null,
      speakerActorId: this.speakerActor?.id ?? null,
      renderedText: this.renderedText,
      choices: this.choices.map((choice, index) => ({ index, text: choice.text })),
      history: [...this.history]
    };
  }

  emit(event) {
    this.eventBus?.emit?.(event, this.getSnapshot());
  }

  setControlsMode(mode) {
    this.eventBus?.emit?.('controls:mode', mode);
  }

  isActive() {
    return this.active;
  }

  async startDialog(id, { speakerActor = null } = {}) {
    if (!this.eventBus || !this.state || !this.store) throw new Error('DialogRuntime is not initialized');
    if (this.active) {
      this.endDialog();
    }
    const graphId = String(id);
    this.graph = await this.store.getGraph(graphId);
    this.graphId = graphId;
    this.nodeId = this.graph.start;
    this.speakerActor = speakerActor ?? null;
    this.history = [];

    this.eventBus.emit?.('dialog:starting');
    this.setControlsMode('dialog');

    this.active = true;
    this.emit('dialog:started');
    this.enterNode(this.nodeId);
    return true;
  }

  close() {
    if (!this.active) return;
    this.endDialog();
  }

  advance() {
    if (!this.active || !this.graph) return false;
    const node = this.graph.nodes?.[this.nodeId] ?? null;
    if (!node) return this.endDialog();

    if (node.type === 'line') {
      if (node.next) return this.enterNode(node.next);
      return this.endDialog();
    }

    if (node.type === 'choice') {
      // If there are no visible choices, treat as end.
      if (!this.choices.length) return this.endDialog();
      return false;
    }

    if (node.type === 'end') {
      return this.endDialog();
    }

    if (node.type === 'goto') {
      return this.enterNode(this.nodeId);
    }

    return false;
  }

  choose(index) {
    if (!this.active || !this.graph) return false;
    const node = this.graph.nodes?.[this.nodeId] ?? null;
    if (!node || node.type !== 'choice') return false;
    const choice = this.choices[Number(index)];
    if (!choice) return false;
    this.applyCommands(choice.commands);
    return this.enterNode(choice.next);
  }

  update(_delta) {}

  enterNode(nodeId) {
    if (!this.graph) return false;
    let cursor = String(nodeId);
    const visited = new Set();
    let steps = 0;

    while (steps < 32) {
      steps += 1;
      if (visited.has(cursor)) throw new Error(`Dialog loop detected at node "${cursor}"`);
      visited.add(cursor);

      const node = this.graph.nodes?.[cursor] ?? null;
      if (!node) throw new Error(`Missing dialog node "${cursor}"`);

      this.nodeId = cursor;
      this.history.push({ nodeId: cursor, type: node.type });

      if (node.commands) this.applyCommands(node.commands);

      if (node.type === 'goto') {
        const ok = node.condition ? evalCondition(node.condition, this.state) : true;
        cursor = ok ? String(node.target) : String(node.elseTarget ?? node.target);
        continue;
      }

      if (node.type === 'end') {
        this.renderedText = '';
        this.choices = [];
        this.emit('dialog:updated');
        return this.endDialog();
      }

      if (node.type === 'line') {
        this.renderedText = renderTemplate(node.text, this.state);
        this.choices = [];
        this.emit('dialog:updated');
        return true;
      }

      if (node.type === 'choice') {
        const nodeText = node.text ? renderTemplate(node.text, this.state) : '';
        this.renderedText = nodeText;
        const choices = Array.isArray(node.choices) ? node.choices : [];
        this.choices = choices
          .filter((choice) => evalCondition(choice?.condition, this.state))
          .map((choice) => ({
            text: renderTemplate(choice.text, this.state),
            next: choice.next,
            commands: choice.commands ?? []
          }));
        this.emit('dialog:updated');
        return true;
      }

      throw new Error(`Unsupported dialog node type: ${node.type}`);
    }

    throw new Error('Dialog exceeded max transition steps');
  }

  applyCommands(commands) {
    const list = Array.isArray(commands) ? commands : [];
    for (const command of list) {
      const op = command?.op;
      if (op === 'setFlag') this.state.setFlag(command.key, Boolean(command.value));
      else if (op === 'setVar') this.state.setVar(command.key, command.value);
      else if (op === 'incVar') this.state.incVar(command.key, command.by);
      else if (op === 'startQuest') this.state.startQuest(command.id);
      else if (op === 'setQuestStage') this.state.setQuestStage(command.id, command.stage);
      else if (op === 'completeQuest') this.state.completeQuest(command.id);
      else if (op === 'playAnim') this.playAnim(command);
      else if (op === 'endDialog') this.endDialog();
    }
  }

  playAnim(command) {
    const target = command?.target ?? 'speaker';
    if (target !== 'speaker') return;
    const actor = this.speakerActor;
    const animator = actor?.animator ?? null;
    const clipHint = command?.clip ?? '';
    const fadeSeconds = command?.fadeSeconds;
    const keys = animator?.getClipKeys?.() ?? [];
    const clipKey = animator?.has?.(clipHint)
      ? clipHint
      : pickClipKey(keys, clipHint);
    if (!clipKey) return;
    const fade = fadeSeconds == null ? undefined : Math.max(0, Number(fadeSeconds) || 0);
    animator.play?.(clipKey, { fadeSeconds: fade });
  }

  endDialog() {
    if (!this.active) return false;
    this.active = false;
    this.graph = null;
    this.graphId = null;
    this.nodeId = null;
    this.renderedText = '';
    this.choices = [];
    this.emit('dialog:ended');
    const restore = this.previousMode && this.previousMode !== 'dialog' ? this.previousMode : 'view';
    this.setControlsMode(restore);
    this.previousMode = 'view';
    this.speakerActor = null;
    this.history = [];
    return true;
  }

  setPreviousMode(mode) {
    this.previousMode = mode ?? 'view';
  }
}
