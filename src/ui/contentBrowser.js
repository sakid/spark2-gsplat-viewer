const PROJECT_MANIFEST_URL = '/assets/asset-manifest.json';

const DEFAULT_PROJECT_ASSETS = [
  {
    id: 'project-splat-folder-default',
    name: 'Model.spz (Folder Default)',
    url: '/@fs/Users/alyoshakidoguchi/Downloads/Model.spz',
    kind: 'splat',
    source: 'project'
  },
  { id: 'project-splat-sean', name: 'Sean_Sheep.spz', url: '/assets/splats/Sean_Sheep.spz', kind: 'splat', source: 'project' },
  {
    id: 'project-proxy-sean',
    name: 'sean_proxy_animated.glb',
    url: '/assets/proxies/sean_proxy_animated.glb',
    kind: 'proxy',
    source: 'project'
  }
];

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function inferAssetKind(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'spz' || ext === 'ply' || ext === 'splat' || ext === 'ksplat') return 'splat';
  if (ext === 'glb' || ext === 'gltf' || ext === 'obj') return 'proxy';
  return 'unknown';
}

function normalizeProjectManifest(input) {
  if (!Array.isArray(input)) return DEFAULT_PROJECT_ASSETS;
  const assets = input
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.url === 'string')
    .map((entry, index) => {
      const name = typeof entry.name === 'string' ? entry.name : entry.url.split('/').pop() || `asset-${index}`;
      const kind = entry.kind === 'proxy' || entry.kind === 'splat' ? entry.kind : inferAssetKind(name);
      return {
        id: `project-${index}-${name}`,
        name,
        url: entry.url,
        kind,
        source: 'project'
      };
    });
  return assets.length ? assets : DEFAULT_PROJECT_ASSETS;
}

export class ContentBrowser {
  constructor({ container, eventBus }) {
    this.container = container;
    this.eventBus = eventBus;
    this.projectAssets = [...DEFAULT_PROJECT_ASSETS];
    this.sessionAssets = [];
    this.search = '';
    this.disposers = [];

    this.root = createEl('div', 'spark-content-browser');
    this.toolbar = createEl('div', 'spark-content-toolbar');
    this.searchInput = createEl('input', 'spark-content-search');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Filter assets...';
    this.searchInput.addEventListener('input', () => {
      this.search = String(this.searchInput.value || '').trim().toLowerCase();
      this.render();
    });
    this.refreshButton = createEl('button', 'spark-content-action', 'Refresh');
    this.refreshButton.type = 'button';
    this.refreshButton.addEventListener('click', () => {
      this.loadProjectAssets();
    });
    this.toolbar.append(this.searchInput, this.refreshButton);

    this.listRoot = createEl('div', 'spark-content-list');
    this.root.append(this.toolbar, this.listRoot);
    this.container.replaceChildren(this.root);

    this.disposers.push(
      eventUnsub(eventBus, 'asset:sessionImported', (payload) => this.addSessionAsset(payload))
    );

    this.loadProjectAssets();
    this.render();
  }

  async loadProjectAssets() {
    try {
      const response = await fetch(PROJECT_MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      this.projectAssets = normalizeProjectManifest(manifest?.assets ?? manifest);
      this.render();
    } catch {
      this.projectAssets = [...DEFAULT_PROJECT_ASSETS];
      this.render();
    }
  }

  addSessionAsset(payload) {
    const file = payload?.file;
    if (!(file instanceof File)) return;
    const kind = payload?.kind === 'proxy' || payload?.kind === 'splat' ? payload.kind : inferAssetKind(file.name);
    const id = `session-${file.name}-${file.size}-${file.lastModified}`;
    const existing = this.sessionAssets.find((asset) => asset.id === id);
    if (existing) return;
    this.sessionAssets.unshift({
      id,
      name: file.name,
      kind,
      source: 'session',
      file
    });
    if (this.sessionAssets.length > 50) {
      this.sessionAssets.splice(50);
    }
    this.render();
  }

  getFilteredAssets(assets) {
    const query = this.search;
    if (!query) return assets;
    return assets.filter((asset) => {
      const name = String(asset.name || '').toLowerCase();
      const kind = String(asset.kind || '').toLowerCase();
      return name.includes(query) || kind.includes(query);
    });
  }

  renderSection(title, assets, emptyText) {
    const section = createEl('section', 'spark-content-section');
    section.append(createEl('h3', 'spark-content-heading', title));
    if (!assets.length) {
      section.append(createEl('p', 'spark-empty', emptyText));
      return section;
    }

    const list = createEl('ul', 'spark-content-items');
    for (const asset of assets) {
      const row = createEl('li', 'spark-content-item');
      const info = createEl('div', 'spark-content-item-info');
      info.append(createEl('span', 'spark-content-name', asset.name));
      info.append(createEl('span', 'spark-content-kind', `${asset.kind} · ${asset.source}`));
      const action = createEl('button', 'spark-content-load', asset.kind === 'proxy' ? 'Load Proxy' : 'Load Splat');
      action.type = 'button';
      action.disabled = asset.kind !== 'proxy' && asset.kind !== 'splat';
      action.addEventListener('click', () => this.loadAsset(asset));
      row.append(info, action);
      list.append(row);
    }
    section.append(list);
    return section;
  }

  async resolveAssetFile(asset) {
    if (asset.file instanceof File) return asset.file;
    if (typeof asset.url !== 'string') return null;
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${asset.url} (${response.status})`);
    }
    const blob = await response.blob();
    const urlPath = String(asset.url).split('?')[0];
    const urlName = urlPath.split('/').pop();
    const fileName = urlName || asset.name || 'asset.bin';
    return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  }

  async loadAsset(asset) {
    try {
      const file = await this.resolveAssetFile(asset);
      if (!(file instanceof File)) return;
      this.eventBus.emit('asset:sessionImported', { file, kind: asset.kind });
      if (asset.kind === 'proxy') {
        this.eventBus.emit('environment:proxyFile', file);
      } else if (asset.kind === 'splat') {
        this.eventBus.emit('environment:loadFile', file);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.eventBus.emit('status:message', { kind: 'error', text: message });
    }
  }

  render() {
    this.listRoot.replaceChildren();
    const projectAssets = this.getFilteredAssets(this.projectAssets);
    const sessionAssets = this.getFilteredAssets(this.sessionAssets);
    this.listRoot.append(
      this.renderSection('Project Assets', projectAssets, 'No project assets available.'),
      this.renderSection('Session Imports', sessionAssets, 'No session assets imported yet.')
    );
  }

  dispose() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.container.replaceChildren();
  }
}
