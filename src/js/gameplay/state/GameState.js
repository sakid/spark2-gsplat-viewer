const SAVE_KEY = 'spark-game-save-v1';
const SAVE_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultSnapshot() {
  const createdAt = nowIso();
  return {
    flags: {},
    vars: {},
    quests: {},
    meta: { createdAt, updatedAt: createdAt, version: SAVE_VERSION }
  };
}

export class GameState {
  constructor({ eventBus, storage = globalThis.localStorage } = {}) {
    this.eventBus = eventBus ?? null;
    this.storage = storage ?? null;
    this.snapshot = defaultSnapshot();

    this.saveTimer = null;
    this.saveDelayMs = 250;
    this.unsubscribers = [];
  }

  bindEvents() {
    if (!this.eventBus) return;
    const on = (event, handler) => {
      const dispose = this.eventBus.on?.(event, handler) ?? (() => this.eventBus.off?.(event, handler));
      this.unsubscribers.push(dispose);
    };

    on('game:saveRequested', () => this.saveNow());
    on('game:loadRequested', () => this.load());
    on('game:resetRequested', () => this.reset());
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  emitChanged() {
    if (!this.eventBus) return;
    this.eventBus.emit('game:stateChanged', this.toJSON());
  }

  touch() {
    this.snapshot.meta.updatedAt = nowIso();
  }

  getFlag(key) {
    return Boolean(this.snapshot.flags[String(key)]);
  }

  setFlag(key, value) {
    const k = String(key);
    this.snapshot.flags[k] = Boolean(value);
    this.touch();
    this.emitChanged();
    this.scheduleSave();
  }

  getVar(key) {
    return this.snapshot.vars[String(key)];
  }

  setVar(key, value) {
    const k = String(key);
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`GameState var must be string|number|boolean, got ${typeof value}`);
    }
    this.snapshot.vars[k] = value;
    this.touch();
    this.emitChanged();
    this.scheduleSave();
  }

  incVar(key, by = 1) {
    const k = String(key);
    const delta = Number(by) || 0;
    const current = Number(this.snapshot.vars[k] ?? 0) || 0;
    this.snapshot.vars[k] = current + delta;
    this.touch();
    this.emitChanged();
    this.scheduleSave();
  }

  getQuest(id) {
    return this.snapshot.quests[String(id)] ?? null;
  }

  startQuest(id) {
    const key = String(id);
    this.snapshot.quests[key] = { status: 'active' };
    this.touch();
    this.emitChanged();
    this.scheduleSave();
  }

  setQuestStage(id, stage) {
    const key = String(id);
    const quest = this.snapshot.quests[key] ?? { status: 'active' };
    quest.status = quest.status ?? 'active';
    quest.stage = String(stage);
    this.snapshot.quests[key] = quest;
    this.touch();
    this.emitChanged();
    this.scheduleSave();
  }

  completeQuest(id) {
    const key = String(id);
    const quest = this.snapshot.quests[key] ?? { status: 'active' };
    quest.status = 'completed';
    this.snapshot.quests[key] = quest;
    this.touch();
    this.emitChanged();
    this.scheduleSave();
  }

  reset() {
    this.snapshot = defaultSnapshot();
    this.emitChanged();
    this.scheduleSave();
  }

  toJSON() {
    return cloneJson(this.snapshot);
  }

  fromJSON(raw) {
    const next = raw && typeof raw === 'object' ? raw : null;
    if (!next) throw new Error('Invalid game state JSON');
    const version = Number(next?.meta?.version ?? SAVE_VERSION);
    if (version !== SAVE_VERSION) {
      throw new Error(`Unsupported save version: ${version}`);
    }
    const createdAt = String(next?.meta?.createdAt ?? nowIso());
    const updatedAt = String(next?.meta?.updatedAt ?? createdAt);
    this.snapshot = {
      flags: { ...(next.flags ?? {}) },
      vars: { ...(next.vars ?? {}) },
      quests: { ...(next.quests ?? {}) },
      meta: { version: SAVE_VERSION, createdAt, updatedAt }
    };
    this.emitChanged();
    this.scheduleSave();
  }

  scheduleSave() {
    if (!this.storage) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), this.saveDelayMs);
  }

  saveNow() {
    if (!this.storage) return false;
    try {
      this.touch();
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.snapshot));
      return true;
    } catch (error) {
      console.warn('Failed to save game state.', error);
      return false;
    }
  }

  load() {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      this.fromJSON(parsed);
      return true;
    } catch (error) {
      console.warn('Failed to load game state.', error);
      return false;
    }
  }
}

export const GAME_STATE_STORAGE_KEY = SAVE_KEY;

