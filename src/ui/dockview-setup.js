// npm install dockview-core tweakpane && npm run dev
/*
Test in 30 seconds:
1) npm run dev
2) Confirm 6 tabs: Viewport, Hierarchy, Inspector, Content, Controls, Console
3) Resize Viewport panel and verify renderer resizes correctly
4) Toggle controls (e.g. collision/lights) and verify existing behavior still responds
*/

import { createDockview } from 'dockview-core';
import 'dockview-core/dist/styles/dockview.css';
import { Outliner } from './outliner.js';
import { Inspector } from './inspector.js';
import { ContentBrowser } from './contentBrowser.js';
import { DialogPanel } from './dialog.js';
import { createEditorChrome } from './editorChrome.js';
import { LEGACY_CONTROLS_HTML } from './templates/legacyControlsHtml.js';

const LAYOUT_STORAGE_KEY = 'spark-editor-layout-v1';

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

const createConsolePanel = (element, eventBus) => {
  const root = document.createElement('div');
  root.className = 'spark-console';
  const list = document.createElement('ul');
  list.className = 'spark-console-list';
  root.append(list);
  element.append(root);

  const selectionLabel = (payload) => {
    if (payload?.target === 'world') return payload?.label || 'World / Level Settings';
    if (payload?.target === 'player') return payload?.object?.name || 'Player';
    return payload?.object?.name || payload?.object?.uuid || 'none';
  };

  const push = (message) => {
    const row = document.createElement('li');
    row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    list.prepend(row);
    while (list.children.length > 100) {
      list.removeChild(list.lastElementChild);
    }
  };

  const disposers = [
    eventUnsub(eventBus, 'sceneLoaded', () => push('Scene loaded')),
    eventUnsub(eventBus, 'objectAdded', (payload) => push(`Object added: ${payload?.object?.name || payload?.object?.uuid || 'unknown'}`)),
    eventUnsub(eventBus, 'objectRemoved', (payload) => push(`Object removed: ${payload?.object?.name || payload?.object?.uuid || 'unknown'}`)),
    eventUnsub(eventBus, 'selectionChanged', (payload) => push(`Selection changed: ${selectionLabel(payload)}`))
  ];

  return () => {
    for (const dispose of disposers) dispose();
    element.replaceChildren();
  };
};

const createDefaultLayout = (dockviewApi) => {
  dockviewApi.clear();
  const viewport = dockviewApi.addPanel({ id: 'viewport', component: 'viewport', title: 'Viewport' });
  const hierarchy = dockviewApi.addPanel({
    id: 'hierarchy',
    component: 'hierarchy',
    title: 'Hierarchy',
    position: { direction: 'left', referencePanel: viewport }
  });
  const inspector = dockviewApi.addPanel({
    id: 'inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { direction: 'right', referencePanel: viewport }
  });
  const content = dockviewApi.addPanel({
    id: 'content',
    component: 'content',
    title: 'Content Browser',
    position: { direction: 'below', referencePanel: hierarchy }
  });
  dockviewApi.addPanel({
    id: 'controls',
    component: 'controls',
    title: 'Controls',
    position: { direction: 'below', referencePanel: inspector }
  });
  dockviewApi.addPanel({
    id: 'dialog',
    component: 'dialog',
    title: 'Dialog',
    position: { direction: 'below', referencePanel: content }
  });
  dockviewApi.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { direction: 'below', referencePanel: hierarchy }
  });
};

const tryRestoreLayout = (dockviewApi) => {
  const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    dockviewApi.fromJSON(parsed);
    return true;
  } catch (error) {
    console.warn('Failed to restore Dockview layout, falling back to defaults.', error);
    return false;
  }
};

export function initDockviewEditor(sceneManager, eventBus) {
  const app = document.getElementById('app');
  if (!(app instanceof HTMLElement)) {
    throw new Error('Missing #app root element.');
  }

  app.replaceChildren();

  const shell = document.createElement('div');
  shell.id = 'spark-shell';
  app.append(shell);

  const chrome = createEditorChrome(eventBus);
  shell.append(chrome.element);

  const dockRoot = document.createElement('div');
  dockRoot.id = 'dockview-root';
  dockRoot.className = 'dv-theme-abyss';
  shell.append(dockRoot);

  const dockviewApi = createDockview(dockRoot, {
    createComponent(options) {
      const element = document.createElement('div');
      element.className = `spark-panel spark-panel-${options.name}`;
      let dispose = () => {};

      return {
        element,
        init({ api }) {
          if (options.name === 'viewport') {
            const canvas = sceneManager.claimCanvasForDockview();
            if (canvas) {
              canvas.id = 'scene-canvas';
              element.append(canvas);
            }
            const runResize = () => {
              sceneManager.onResize(element.clientWidth, element.clientHeight);
            };
            const resizeDispose = api.onDidDimensionsChange?.(() => runResize());
            requestAnimationFrame(runResize);
            dispose = () => {
              resizeDispose?.dispose?.();
            };
            return;
          }

          if (options.name === 'controls') {
            element.innerHTML = LEGACY_CONTROLS_HTML;
            eventBus.emit('ui:controlsReady', { root: element });
            dispose = () => {
              eventBus.emit('ui:controlsDisposed', { root: element });
              element.replaceChildren();
            };
            return;
          }

          if (options.name === 'hierarchy') {
            const outliner = new Outliner({ container: element, eventBus });
            outliner.scene = sceneManager.getScene?.() ?? null;
            outliner.camera = sceneManager.getCamera?.() ?? null;
            outliner.render();
            dispose = () => outliner.dispose();
            return;
          }

          if (options.name === 'inspector') {
            const inspector = new Inspector({ container: element, eventBus });
            dispose = () => inspector.dispose();
            return;
          }

          if (options.name === 'console') {
            dispose = createConsolePanel(element, eventBus);
            return;
          }

          if (options.name === 'dialog') {
            const dialog = new DialogPanel({ container: element, eventBus });
            dispose = () => dialog.dispose();
            return;
          }

          if (options.name === 'content') {
            const browser = new ContentBrowser({ container: element, eventBus });
            dispose = () => browser.dispose();
          }
        },
        dispose() {
          dispose();
        }
      };
    }
  });

  const restored = tryRestoreLayout(dockviewApi);
  if (!restored) {
    createDefaultLayout(dockviewApi);
  }

  const saveLayout = () => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(dockviewApi.toJSON()));
    } catch (error) {
      console.warn('Failed to persist Dockview layout.', error);
    }
  };

  const layoutDispose = dockviewApi.onDidLayoutChange?.(() => saveLayout());
  window.addEventListener('beforeunload', saveLayout, { once: true });

  return () => {
    layoutDispose?.dispose?.();
    dockviewApi.dispose();
    chrome.dispose();
  };
}
