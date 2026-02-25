import '../css/style.css';
import { createEventBus } from '../utils/eventBus';
import { createStatusReporter } from './internal/status';
import { SceneManager } from './SceneManager';

// NEW PROXY ANIMATION
async function bootstrap() {
  const container = document.getElementById('scene-container');
  const statusElement = document.getElementById('status');
  if (!(container instanceof HTMLElement)) {
    throw new Error('Missing #scene-container element.');
  }

  const eventBus = createEventBus();
  const statusReporter = createStatusReporter(statusElement);
  statusReporter.setStatus('Initializing SPARK 2.0 proxy-driven engine...', 'info');

  const sceneManager = new SceneManager({ container, eventBus, statusReporter });
  await sceneManager.init();
  const canvas = sceneManager.renderer?.domElement ?? null;
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
    sceneManager.resize();
    eventBus.emit('dom:resize', { width: container.clientWidth, height: container.clientHeight });
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
