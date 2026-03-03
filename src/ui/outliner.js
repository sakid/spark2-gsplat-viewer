// npm install dockview-core tweakpane && npm run dev

import { ensurePrim, stampPrim, extractSplatMeta } from './prim-utils.js';

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));
const WORLD_SELECTION_KEY = 'world:settings';
const PLAYER_SELECTION_KEY = 'player:camera';

const createEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

function normalizeSelection(payload) {
  const uuids = Array.isArray(payload?.uuids)
    ? payload.uuids.filter((value) => typeof value === 'string')
    : [];
  const objectUuid = payload?.object?.uuid;
  if (typeof objectUuid === 'string' && !uuids.includes(objectUuid)) {
    uuids.unshift(objectUuid);
  }
  return uuids;
}

export class Outliner {
  constructor({ container, eventBus }) {
    this.container = container;
    this.eventBus = eventBus;
    this.scene = null;
    this.camera = null;
    this.selectedKeys = new Set();
    this.lastSelectedKey = null;
    this.searchQuery = '';
    this.draggedId = null;
    this.disposers = [];

    this.root = createEl('div', 'spark-outliner-root');
    this.toolbar = this.buildToolbar();
    this.treeRoot = createEl('div', 'spark-outliner');
    this.root.append(this.toolbar, this.treeRoot);
    this.container.replaceChildren(this.root);

    this.disposers.push(
      eventUnsub(eventBus, 'sceneLoaded', (payload) => {
        this.scene = payload?.scene ?? this.scene;
        this.camera = payload?.camera ?? this.camera;
        this.render();
      }),
      eventUnsub(eventBus, 'hierarchyChanged', () => this.render()),
      eventUnsub(eventBus, 'objectAdded', (payload) => {
        const object = payload?.object;
        if (!this.scene && object) this.scene = object.parent?.isScene ? object.parent : this.scene;
        this.render();
      }),
      eventUnsub(eventBus, 'objectRemoved', () => this.render()),
      eventUnsub(eventBus, 'selectionChanged', (payload) => {
        if (payload?.target === 'world') {
          this.selectedKeys = new Set([WORLD_SELECTION_KEY]);
          this.lastSelectedKey = WORLD_SELECTION_KEY;
          this.render();
          return;
        }
        if (payload?.target === 'player' || payload?.object?.isCamera) {
          this.selectedKeys = new Set([PLAYER_SELECTION_KEY]);
          this.lastSelectedKey = PLAYER_SELECTION_KEY;
          this.render();
          return;
        }
        const uuids = normalizeSelection(payload);
        this.selectedKeys = new Set(uuids);
        this.lastSelectedKey = uuids[0] ?? null;
        this.render();
      })
    );

    this.render();
  }

  buildToolbar() {
    const toolbar = createEl('div', 'spark-outliner-toolbar');

    this.searchInput = createEl('input');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Filter outliner...';
    this.searchInput.className = 'spark-outliner-search';
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = String(this.searchInput.value || '').trim().toLowerCase();
      this.render();
    });

    this.addFolderButton = createEl('button', 'spark-outliner-action', 'New Folder');
    this.addFolderButton.type = 'button';
    this.addFolderButton.addEventListener('click', () => {
      const parentId = this.lastSelectedKey && !this.lastSelectedKey.startsWith('world:') && !this.lastSelectedKey.startsWith('player:')
        ? this.lastSelectedKey
        : null;
      this.eventBus.emit('hierarchy:createFolderRequested', {
        parentId,
        name: 'Folder'
      });
    });

    this.focusButton = createEl('button', 'spark-outliner-action', 'Focus');
    this.focusButton.type = 'button';
    this.focusButton.addEventListener('click', () => {
      this.eventBus.emit('hierarchy:focusRequested');
    });

    toolbar.append(this.searchInput, this.addFolderButton, this.focusButton);
    return toolbar;
  }

  render() {
    this.treeRoot.replaceChildren();
    if (!this.scene) {
      this.treeRoot.append(createEl('p', 'spark-empty', 'No scene loaded.'));
      return;
    }

    const rootList = createEl('ul', 'spark-tree');
    rootList.append(this.renderWorldNode());
    if (this.camera) {
      rootList.append(this.renderPlayerNode());
    }
    for (const child of this.scene.children || []) {
      const node = this.renderNode(child);
      if (node) rootList.append(node);
    }

    if (!rootList.children.length) {
      this.treeRoot.append(createEl('p', 'spark-empty', 'Scene is empty.'));
      return;
    }

    this.treeRoot.append(rootList);
  }

  renderWorldNode() {
    const li = createEl('li', 'spark-tree-item');
    const row = createEl('button', 'spark-node-row');
    row.type = 'button';

    if (this.selectedKeys.has(WORLD_SELECTION_KEY)) {
      row.classList.add('selected');
    }

    row.append(createEl('span', 'spark-node-path', '/World'));
    row.append(createEl('span', 'spark-node-type', 'LevelSettings'));

    row.addEventListener('click', () => {
      this.selectedKeys = new Set([WORLD_SELECTION_KEY]);
      this.lastSelectedKey = WORLD_SELECTION_KEY;
      this.eventBus.emit('selectionChanged', {
        target: 'world',
        label: 'World / Level Settings',
        uuids: [],
        object: null
      });
    });

    li.append(row);
    return li;
  }

  renderPlayerNode() {
    const li = createEl('li', 'spark-tree-item');
    const row = createEl('button', 'spark-node-row');
    row.type = 'button';

    if (this.selectedKeys.has(PLAYER_SELECTION_KEY)) {
      row.classList.add('selected');
    }

    row.append(createEl('span', 'spark-node-path', '/Player'));
    row.append(createEl('span', 'spark-node-type', 'Player'));

    row.addEventListener('click', () => {
      this.selectedKeys = new Set([PLAYER_SELECTION_KEY]);
      this.lastSelectedKey = PLAYER_SELECTION_KEY;
      const payload = {
        target: 'player',
        uuids: this.camera ? [this.camera.uuid] : [],
        object: this.camera ?? null
      };
      this.eventBus.emit('selectionChanged', payload);
      this.eventBus.emit('player:selected', payload);
    });

    li.append(row);
    return li;
  }

  renderNode(object) {
    stampPrim(object);
    const prim = ensurePrim(object);
    const meta = extractSplatMeta(object);

    const children = [];
    for (const child of object.children || []) {
      const childNode = this.renderNode(child);
      if (childNode) children.push(childNode);
    }

    const query = this.searchQuery;
    const typeLabel = object.userData?.editorFolder ? 'Folder' : (prim.type || object.type || 'Xform');
    const label = object.name || prim.path || object.uuid;
    const matchesSelf = query.length === 0
      || label.toLowerCase().includes(query)
      || typeLabel.toLowerCase().includes(query);
    if (!matchesSelf && children.length === 0) {
      return null;
    }

    const li = createEl('li', 'spark-tree-item');
    const wrapper = createEl('details', 'spark-node');
    wrapper.open = true;

    const summary = createEl('summary', 'spark-node-summary');
    summary.append(this.createLabelRow(object, prim, typeLabel, meta));
    wrapper.append(summary);

    if (children.length > 0) {
      const childList = createEl('ul', 'spark-tree');
      for (const child of children) childList.append(child);
      wrapper.append(childList);
    } else {
      wrapper.classList.add('leaf');
    }

    li.append(wrapper);
    return li;
  }

  createLabelRow(object, prim, typeLabel, meta) {
    const row = createEl('div', 'spark-node-row spark-node-row-advanced');
    row.draggable = true;
    if (row.dataset && typeof row.dataset === 'object') {
      row.dataset.uuid = object.uuid;
    } else {
      row.__sparkUuid = object.uuid;
    }
    if (this.selectedKeys.has(object.uuid)) {
      row.classList.add('selected');
    }

    const visibility = createEl('input', 'spark-node-toggle');
    visibility.type = 'checkbox';
    visibility.checked = object.visible !== false;
    visibility.title = 'Visibility';
    visibility.addEventListener('change', (event) => {
      event.stopPropagation();
      this.eventBus.emit('hierarchy:visibilityRequested', {
        uuid: object.uuid,
        visible: visibility.checked
      });
    });

    const locked = createEl('input', 'spark-node-toggle');
    locked.type = 'checkbox';
    locked.checked = Boolean(object.userData?.editorLocked);
    locked.title = 'Lock transform';
    locked.addEventListener('change', (event) => {
      event.stopPropagation();
      this.eventBus.emit('hierarchy:lockRequested', {
        uuid: object.uuid,
        locked: locked.checked
      });
    });

    const labelButton = createEl('button', 'spark-node-label');
    labelButton.type = 'button';
    labelButton.append(createEl('span', 'spark-node-path', object.name || prim.path || '/'));
    labelButton.append(createEl('span', 'spark-node-type', typeLabel));

    if (meta.isSplatMesh) {
      const lodText = `LoD ${meta.lodEnabled == null ? 'n/a' : meta.lodEnabled ? 'on' : 'off'} · count ${meta.lodSplatCount ?? 'n/a'}`;
      labelButton.append(createEl('span', 'spark-node-lod', lodText));
    }

    labelButton.addEventListener('click', (event) => {
      this.handleObjectSelectionClick(event, object);
    });

    row.addEventListener('dragstart', (event) => {
      this.draggedId = object.uuid;
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', object.uuid);
      }
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList?.remove?.('drag-over');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList?.remove?.('drag-over');
      const childId = this.draggedId || event?.dataTransfer?.getData?.('text/plain') || null;
      this.draggedId = null;
      if (!childId || childId === object.uuid) return;
      this.eventBus.emit('hierarchy:reparentRequested', {
        childId,
        parentId: object.uuid
      });
    });
    row.addEventListener('dragend', () => {
      this.draggedId = null;
      row.classList?.remove?.('drag-over');
    });

    row.append(visibility, locked, labelButton);
    return row;
  }

  handleObjectSelectionClick(event, object) {
    const additive = Boolean(event?.metaKey || event?.ctrlKey);
    const extend = Boolean(event?.shiftKey);

    const next = new Set(this.selectedKeys);
    if (extend || additive) {
      if (next.has(object.uuid) && additive) next.delete(object.uuid);
      else next.add(object.uuid);
    } else {
      next.clear();
      next.add(object.uuid);
    }

    if (next.size === 0) {
      next.add(object.uuid);
    }

    this.selectedKeys = next;
    const uuids = [...next];
    this.lastSelectedKey = object.uuid;
    this.eventBus.emit('selectionChanged', {
      target: 'object',
      uuids,
      object
    });
    this.render();
  }

  selectionKeyFromPayload(payload) {
    const target = payload?.target;
    if (target === 'world') return WORLD_SELECTION_KEY;
    if (target === 'player') return PLAYER_SELECTION_KEY;

    const object = payload?.object ?? null;
    if (object?.isCamera) return PLAYER_SELECTION_KEY;

    return object?.uuid ?? payload?.uuids?.[0] ?? null;
  }

  dispose() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.container.replaceChildren();
  }
}
