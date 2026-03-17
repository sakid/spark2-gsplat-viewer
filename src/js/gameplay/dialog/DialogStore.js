import { BUILTIN_DIALOG_GRAPHS } from './builtinGraphs';

function cloneGraph(graph) {
  return JSON.parse(JSON.stringify(graph));
}

export class DialogStore {
  constructor({ indexUrl = '/assets/dialog/index.json', fetchFn = globalThis.fetch } = {}) {
    this.indexUrl = indexUrl;
    this.fetchFn = fetchFn;
    this.indexLoaded = false;
    this.idToUrl = new Map();
    this.cache = new Map(); // id -> DialogGraph
    this.builtinById = new Map(Object.entries(BUILTIN_DIALOG_GRAPHS ?? {}));
  }

  async ensureIndexLoaded() {
    if (this.indexLoaded) return;
    if (typeof this.fetchFn === 'function') {
      try {
        const response = await this.fetchFn(this.indexUrl);
        if (response.ok) {
          const json = await response.json();
          const entries = Array.isArray(json?.dialogs) ? json.dialogs : [];
          for (const entry of entries) {
            if (!entry?.id || !entry?.file) continue;
            this.idToUrl.set(String(entry.id), String(entry.file));
          }
        }
      } catch (error) {
        console.warn('Dialog index fetch failed; falling back to built-in dialog graphs.', error);
      }
    }
    this.indexLoaded = true;
  }

  async getGraph(id) {
    const dialogId = String(id);
    if (this.cache.has(dialogId)) return cloneGraph(this.cache.get(dialogId));
    if (this.builtinById.has(dialogId)) {
      const graph = cloneGraph(this.builtinById.get(dialogId));
      this.cache.set(dialogId, graph);
      return cloneGraph(graph);
    }
    await this.ensureIndexLoaded();
    const url = this.idToUrl.get(dialogId);
    if (!url) throw new Error(`Unknown dialog id: ${dialogId}`);
    const response = await this.fetchFn(url);
    if (!response.ok) throw new Error(`Dialog fetch failed: ${response.status}`);
    const graph = await response.json();
    if (!graph?.id || !graph?.start || !graph?.nodes) {
      throw new Error(`Invalid dialog graph: ${dialogId}`);
    }
    this.cache.set(dialogId, graph);
    return cloneGraph(graph);
  }
}
