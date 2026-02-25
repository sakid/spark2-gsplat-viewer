import '../css/style.css';
import { createEventBus } from '../utils/eventBus';
import { createStatusReporter } from './internal/status';
import { SceneManager } from './SceneManager';
import { initDockviewEditor } from '../ui/dockview-setup.js';

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
  const canvas = sceneManager.getCanvas();

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
