export class DialogStore {
  constructor({ indexUrl = '/assets/dialog/index.json', fetchFn = globalThis.fetch } = {}) {
    this.indexUrl = indexUrl;
    this.fetchFn = fetchFn;
    this.indexLoaded = false;
    this.idToUrl = new Map();
    this.cache = new Map(); // id -> DialogGraph
  }

  async ensureIndexLoaded() {
    if (this.indexLoaded) return;
    if (typeof this.fetchFn !== 'function') throw new Error('DialogStore requires fetch');
    const response = await this.fetchFn(this.indexUrl);
    if (!response.ok) throw new Error(`Dialog index fetch failed: ${response.status}`);
    const json = await response.json();
    const entries = Array.isArray(json?.dialogs) ? json.dialogs : [];
    for (const entry of entries) {
      if (!entry?.id || !entry?.file) continue;
      this.idToUrl.set(String(entry.id), String(entry.file));
    }
    this.indexLoaded = true;
  }

  async getGraph(id) {
    const dialogId = String(id);
    if (this.cache.has(dialogId)) return this.cache.get(dialogId);
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
    return graph;
  }
}

