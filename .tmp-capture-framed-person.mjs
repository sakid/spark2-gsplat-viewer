import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/';
const TIMEOUT_MS = 420_000;
const OUTPUT_DIR = path.resolve(process.cwd(), 'artifacts');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'person-splat-framed-walk.png');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: 'new',
  protocolTimeout: 600_000,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--disable-dev-shm-usage'
  ]
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  let pageErrors = 0;
  page.on('pageerror', (error) => {
    pageErrors += 1;
    console.log(`PAGEERR: ${error?.message ?? String(error)}`);
  });

  console.log(`CAPTURE: open ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__?.sceneManager), {
    timeout: TIMEOUT_MS,
    polling: 100
  });

  await page.waitForFunction(() => {
    const manager = window.__SPARK2_DEBUG__?.sceneManager;
    const actors = manager?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
    return actors.length > 0;
  }, {
    timeout: TIMEOUT_MS,
    polling: 250
  });

  const state = await page.evaluate(() => {
    const manager = window.__SPARK2_DEBUG__?.sceneManager;
    const actors = manager?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
    const actor = actors[actors.length - 1] ?? null;
    if (!manager || !actor) return { ok: false, error: 'missing manager or actor' };

    manager.eventBus.emit('environment:viewMode', 'splats-only');
    manager.eventBus.emit('environment:showProxy', false);
    manager.eventBus.emit('environment:showProxyBones', false);
    manager.eventBus.emit('quality:improved', true);
    manager.eventBus.emit('quality:maxDetail', true);

    actor.setProxyVisible?.(false);
    actor.setPoseMode?.('walk');

    const bounds = actor.getFocusBoundingBox?.();
    if (!bounds || bounds.isEmpty?.()) {
      return { ok: false, error: 'focus bounds missing or empty' };
    }

    const center = bounds.getCenter(new window.THREE.Vector3());
    const size = bounds.getSize(new window.THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.75);

    const camera = manager.camera;
    const fov = Math.max((camera?.fov ?? 60) * (Math.PI / 180), 0.1);
    const distance = Math.max(radius / Math.tan(fov * 0.5), radius * 1.2, 2.2);
    const direction = new window.THREE.Vector3(0.35, 0.2, 1).normalize();

    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix?.();

    const controls = manager.sceneSubjects?.find?.((subject) => subject?.constructor?.name === 'CameraControls')
      ?? manager.cameraControls
      ?? null;
    if (controls?.orbit?.target?.copy) {
      controls.orbit.target.copy(center);
      controls.orbit.update?.();
    }

    manager.eventBus.emit('selectionChanged', {
      target: 'object',
      uuids: actor.root?.uuid ? [actor.root.uuid] : [],
      object: actor.root ?? null,
      frameObject: actor.focusFrameObject ?? actor.splatMesh ?? actor.root ?? null
    });

    const clip = actor.externalRuntime?.animator?.getState?.()
      ?? actor.voxelRuntime?.getAnimationState?.()
      ?? null;

    return {
      ok: true,
      poseMode: actor.poseMode,
      clipName: String(clip?.clipName ?? ''),
      playing: Boolean(clip?.playing),
      splatVisible: Boolean(actor?.splatMesh?.visible),
      numSplats: Number(actor?.splatMesh?.numSplats ?? actor?.splatMesh?.num_splats ?? 0),
      focusBounds: {
        min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
        max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
      },
      camera: {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        lookAt: { x: center.x, y: center.y, z: center.z }
      }
    };
  });

  assert(state?.ok, `Failed to prepare frame: ${state?.error ?? 'unknown'}`);

  // Give the walk cycle a short settle time before capture.
  await sleep(1800);

  await page.screenshot({
    path: OUTPUT_PATH,
    type: 'png'
  });

  assert(pageErrors === 0, `Encountered ${pageErrors} page errors during capture.`);
  assert(state.splatVisible === true, 'Actor splat is not visible.');
  assert(state.numSplats > 0, `Actor splat appears empty (numSplats=${state.numSplats}).`);

  console.log('CAPTURE_OK');
  console.log(JSON.stringify({ output: OUTPUT_PATH, state }, null, 2));
} finally {
  await browser.close();
}
