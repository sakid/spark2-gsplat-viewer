// npm install dockview-core tweakpane && npm run dev

import { ensurePrim, stampPrim, extractSplatMeta } from './prim-utils.js';

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

const createEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

export class Outliner {
  constructor({ container, eventBus }) {
    this.container = container;
    this.eventBus = eventBus;
    this.scene = null;
    this.camera = null;
    this.selected = null;
    this.disposers = [];

    this.treeRoot = createEl('div', 'spark-outliner');
    this.container.replaceChildren(this.treeRoot);

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
        this.selected = payload?.object ?? null;
        this.render();
      })
    );

    this.render();
  }

  render() {
    this.treeRoot.replaceChildren();
    if (!this.scene) {
      this.treeRoot.append(createEl('p', 'spark-empty', 'No scene loaded.'));
      return;
    }

    const rootList = createEl('ul', 'spark-tree');
    if (this.camera) {
      rootList.append(this.renderPlayerNode());
    }
    for (const child of this.scene.children || []) {
      rootList.append(this.renderNode(child));
    }

    if (!rootList.children.length) {
      this.treeRoot.append(createEl('p', 'spark-empty', 'Scene is empty.'));
      return;
    }

    this.treeRoot.append(rootList);
  }

  renderPlayerNode() {
    const li = createEl('li', 'spark-tree-item');
    const row = createEl('button', 'spark-node-row');
    row.type = 'button';

    if (this.selected?.uuid === this.camera?.uuid) {
      row.classList.add('selected');
    }

    row.append(createEl('span', 'spark-node-path', '/Player'));
    row.append(createEl('span', 'spark-node-type', 'Player'));

    row.addEventListener('click', () => {
      const payload = {
        uuids: this.camera ? [this.camera.uuid] : [],
        object: this.camera
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

    const li = createEl('li', 'spark-tree-item');
    const wrapper = object.children?.length ? createEl('details', 'spark-node') : createEl('div', 'spark-node leaf');

    if (wrapper.tagName === 'DETAILS') {
      wrapper.open = true;
      const summary = createEl('summary', 'spark-node-summary');
      summary.append(this.createLabelRow(object, prim, meta));
      wrapper.append(summary);
    } else {
      wrapper.append(this.createLabelRow(object, prim, meta));
    }

    if (object.children?.length) {
      const children = createEl('ul', 'spark-tree');
      for (const child of object.children) {
        children.append(this.renderNode(child));
      }
      wrapper.append(children);
    }

    li.append(wrapper);
    return li;
  }

  createLabelRow(object, prim, meta) {
    const row = createEl('button', 'spark-node-row');
    row.type = 'button';
    if (this.selected?.uuid === object.uuid) {
      row.classList.add('selected');
    }

    const title = createEl('span', 'spark-node-path', prim.path || '/');
    const badge = createEl('span', 'spark-node-type', prim.type || 'Xform');
    row.append(title, badge);

    if (meta.isSplatMesh) {
      const lodText = `LoD ${meta.lodEnabled == null ? 'n/a' : meta.lodEnabled ? 'on' : 'off'} · count ${meta.lodSplatCount ?? 'n/a'}`;
      row.append(createEl('span', 'spark-node-lod', lodText));
    }

    row.addEventListener('click', () => {
      this.eventBus.emit('selectionChanged', {
        uuids: [object.uuid],
        object
      });
    });

    return row;
  }

  dispose() {
    for (const dispose of this.disposers.splice(0)) dispose();
    this.container.replaceChildren();
  }
}
