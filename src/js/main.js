import '../css/style.css';
import { createEventBus } from '../utils/eventBus';
import { createStatusReporter } from './internal/status';
import { SceneManager } from './SceneManager';
import { initDockviewEditor } from '../ui/dockview-setup.js';
import {
  triggerSceneDownload,
  loadSceneFileFromUpload,
  saveSceneSlot,
  loadSceneSlot,
  deleteSceneSlot
} from './internal/sceneStateBridge.js';

const findInRoot = (root, id) => {
  if (root && typeof root.querySelector === 'function') {
    return root.querySelector(`#${id}`) ?? null;
  }
  return document.getElementById(id);
};

// NEW PROXY ANIMATION
async function bootstrap() {
  const app = document.getElementById('app');
  if (!(app instanceof HTMLElement)) {
    throw new Error('Missing #app element.');
  }

  const bootstrapContainer = document.createElement('div');
  bootstrapContainer.id = 'scene-container';
  bootstrapContainer.style.width = '100%';
  bootstrapContainer.style.height = '100%';

  const bootstrapStatus = document.createElement('p');
  bootstrapStatus.role = 'status';

  app.replaceChildren(bootstrapContainer, bootstrapStatus);

  const eventBus = createEventBus();
  const statusReporter = createStatusReporter(bootstrapStatus);
  statusReporter.setStatus('Initializing SPARK 2.0 proxy-driven engine...', 'info');

  const sceneManager = new SceneManager({ container: bootstrapContainer, eventBus, statusReporter });
  await sceneManager.init();
  const disposeEditor = initDockviewEditor(sceneManager, eventBus);
  statusReporter.resync();
  const canvas = sceneManager.getCanvas();

  const syncSlotOptions = (root = null, preferred = null) => {
    const select = findInRoot(root, 'scene-slot-select');
    if (!(select instanceof HTMLSelectElement)) return;

    const previous = preferred ?? select.value;
    const names = sceneManager.listSlotNames();
    select.replaceChildren();

    if (names.length === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No saved slots';
      select.append(empty);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    for (const name of names) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.append(option);
    }

    if (previous && names.includes(previous)) select.value = previous;
  };

  const sceneEventDisposers = [];
  const onEvent = (event, handler) => {
    const dispose = eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));
    sceneEventDisposers.push(dispose);
  };

  onEvent('ui:controlsReady', (payload) => {
    const root = payload?.root ?? null;
    syncSlotOptions(root);
    statusReporter.resync(root);
  });
  onEvent('scene:slotsRefreshRequested', (payload) => syncSlotOptions(payload?.root ?? null));

  onEvent('scene:saveFileRequested', (payload) => {
    try {
      const snapshot = sceneManager.buildSceneSnapshot();
      triggerSceneDownload(snapshot, payload?.sceneName || snapshot.sceneName);
      statusReporter.setStatus(`Saved scene file "${snapshot.sceneName}".`, 'success');
    } catch (error) {
      statusReporter.setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });

  onEvent('scene:openFileRequested', async (payload) => {
    try {
      if (!payload?.file) {
        const input = findInRoot(payload?.root ?? null, 'load-scene-file-input');
        if (input instanceof HTMLInputElement) {
          input.click();
          return;
        }
        throw new Error('Scene file input is unavailable.');
      }

      const sceneFile = await loadSceneFileFromUpload(payload.file);
      sceneManager.applySceneSnapshot(sceneFile);
      statusReporter.setStatus(`Loaded scene "${sceneFile.sceneName}".`, 'success');
    } catch (error) {
      statusReporter.setStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });

  onEvent('scene:saveSlotRequested', (payload) => {
    try {
      const slotName = payload?.slotName?.trim();
      if (!slotName) throw new Error('Enter a scene slot name.');
      const snapshot = sceneManager.buildSceneSnapshot();
      saveSceneSlot(slotName, snapshot);
      syncSlotOptions(payload?.root ?? null, slotName);
      statusReporter.setStatus(`Saved slot "${slotName}".`, 'success');
    } catch (error) {
      statusReporter.setStatus(`Save slot failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });

  onEvent('scene:loadSlotRequested', (payload) => {
    try {
      const slotName = payload?.slotName?.trim();
      if (!slotName) throw new Error('Select a scene slot to load.');
      const sceneFile = loadSceneSlot(slotName);
      sceneManager.applySceneSnapshot(sceneFile);
      syncSlotOptions(payload?.root ?? null, slotName);
      statusReporter.setStatus(`Loaded slot "${slotName}".`, 'success');
    } catch (error) {
      statusReporter.setStatus(`Load slot failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });

  onEvent('scene:deleteSlotRequested', (payload) => {
    try {
      const slotName = payload?.slotName?.trim();
      if (!slotName) throw new Error('Select a scene slot to delete.');
      const deleted = deleteSceneSlot(slotName);
      if (!deleted) throw new Error(`Scene slot "${slotName}" does not exist.`);
      syncSlotOptions(payload?.root ?? null);
      statusReporter.setStatus(`Deleted slot "${slotName}".`, 'success');
    } catch (error) {
      statusReporter.setStatus(`Delete slot failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });

  onEvent('status:message', (payload) => {
    const text = payload?.text;
    if (!text) return;
    const kind = payload?.kind === 'error' ? 'error' : payload?.kind === 'warning' ? 'warning' : 'info';
    statusReporter.setStatus(String(text), kind);
  });

  syncSlotOptions();

  if (import.meta.env.DEV) {
    window.__SPARK2_DEBUG__ = { sceneManager, eventBus };
  }

  const relayDom = (eventName, target = window, options) => {
    const handler = (event) => eventBus.emit(`dom:${eventName}`, event);
    target.addEventListener(eventName, handler, options);
    return () => target.removeEventListener(eventName, handler);
  };

  const relayMouseMove = () => {
    const handler = (event) => {
      if (canvas && document.pointerLockElement !== canvas) return;
      eventBus.emit('dom:mousemove', event);
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  };

  const disposers = [
    relayDom('keydown'),
    relayDom('keyup'),
    relayMouseMove(),
    relayDom('mousedown'),
    relayDom('mouseup'),
    relayDom('click'),
    relayDom('wheel', window, { passive: true }),
    relayDom('pointerlockchange', document)
  ];

  const onResize = () => {
    const canvasParent = sceneManager.getCanvas()?.parentElement;
    if (canvasParent instanceof HTMLElement) {
      const width = Math.max(canvasParent.clientWidth, 1);
      const height = Math.max(canvasParent.clientHeight, 1);
      sceneManager.onResize(width, height);
      eventBus.emit('dom:resize', { width, height });
      return;
    }

    sceneManager.resize();
    eventBus.emit('dom:resize', { width: bootstrapContainer.clientWidth, height: bootstrapContainer.clientHeight });
  };
  window.addEventListener('resize', onResize);
  disposers.push(() => window.removeEventListener('resize', onResize));

  let lastTime = performance.now();
  const frame = (now) => {
    const delta = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    sceneManager.update(delta);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    for (const dispose of sceneEventDisposers) dispose();
    for (const dispose of disposers) dispose();
    disposeEditor?.();
    sceneManager.dispose();
    if (import.meta.env.DEV && window.__SPARK2_DEBUG__) {
      delete window.__SPARK2_DEBUG__;
    }
  });
}

bootstrap().catch((error) => {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = `Startup failed: ${error.message}`;
    status.className = 'error';
  }
  console.error(error);
});
