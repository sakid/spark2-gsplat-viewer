import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/';
const TIMEOUT_MS = 420_000;
const OUTPUT_DIR = path.resolve(process.cwd(), 'artifacts');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'person-splat-framed-walk.png');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

console.log(`SHOT: url=${URL}`);
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

  console.log('SHOT: opening app');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__?.sceneManager), {
    polling: 100,
    timeout: TIMEOUT_MS
  });

  console.log('SHOT: ensuring extracted actor exists');
  await page.evaluate(async () => {
    const manager = window.__SPARK2_DEBUG__?.sceneManager;
    if (!manager) return;

    const findActor = () => {
      const actors = manager.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
      return actors[actors.length - 1] ?? null;
    };

    if (findActor()) return;

    const environment = manager.findEnvironmentEntity?.()
      ?? manager.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat')
      ?? null;
    if (!environment) return;

    if (environment.proxyKind !== 'voxel') {
      await environment.generateVoxel?.({ workflow: true });
      manager.syncVoxelEditData?.();
    }

    if (!findActor()) {
      manager.autoSelectActorVoxels?.(undefined, { silent: true });
      await manager.extractSelectedVoxelActor?.();
      manager.syncVoxelEditData?.();
    }
  });

  console.log('SHOT: waiting for actor state');
  const waitStart = Date.now();
  let readyState = null;
  while (true) {
    readyState = await page.evaluate(() => {
      const manager = window.__SPARK2_DEBUG__?.sceneManager;
      const statusNode = document.querySelector('[role="status"]');
      const actors = manager?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
      const actor = actors[actors.length - 1] ?? null;
      return {
        actorCount: actors.length,
        hasActor: Boolean(actor),
        statusText: String(statusNode?.textContent ?? '').trim()
      };
    });

    if (readyState.hasActor) break;

    const elapsed = Date.now() - waitStart;
    if (elapsed > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for extracted actor. state=${JSON.stringify(readyState)}`);
    }

    if (elapsed % 10_000 < 1000) {
      console.log(`SHOT: waiting t=${Math.round(elapsed / 1000)}s actorCount=${readyState.actorCount} status="${readyState.statusText}"`);
    }
    await sleep(1000);
  }

  console.log('SHOT: framing and capturing splat-only walk frame');
  const result = await page.evaluate(async () => {
    const manager = window.__SPARK2_DEBUG__?.sceneManager;
    const actors = manager?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
    const actor = actors[actors.length - 1] ?? null;
    if (!manager || !actor) {
      return { ok: false, error: 'missing scene manager or actor' };
    }

    manager.eventBus.emit('environment:viewMode', 'splats-only');
    manager.eventBus.emit('environment:showProxy', false);
    manager.eventBus.emit('environment:showProxyBones', false);
    manager.eventBus.emit('quality:improved', true);
    manager.eventBus.emit('quality:maxDetail', true);

    actor.setProxyVisible?.(false);
    actor.setPoseMode?.('walk');

    manager.eventBus.emit('selectionChanged', {
      target: 'object',
      uuids: actor.root?.uuid ? [actor.root.uuid] : [],
      object: actor.root ?? null,
      frameObject: actor.focusFrameObject ?? actor.splatMesh ?? actor.root ?? null
    });
    manager.eventBus.emit('selection:focusRequested');

    const bounds = actor.getFocusBoundingBox?.();
    if (bounds && !bounds.isEmpty?.()) {
      const center = manager.camera.position.clone();
      const size = manager.camera.position.clone();
      bounds.getCenter(center);
      bounds.getSize(size);
      const radius = Math.max(size.length() * 0.5, 0.8);
      const fovRad = Math.max((manager.camera?.fov ?? 60) * (Math.PI / 180), 0.1);
      const distance = Math.max(radius / Math.tan(fovRad * 0.5), radius * 1.2, 2.4);
      const dir = manager.camera.position.clone().set(0.35, 0.2, 1).normalize();

      manager.camera.position.copy(center).addScaledVector(dir, distance);
      manager.camera.lookAt(center);
      manager.camera.updateProjectionMatrix?.();
    }

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const clip = actor?.externalRuntime?.animator?.getState?.()
      ?? actor?.voxelRuntime?.getAnimationState?.()
      ?? null;

    const canvas = manager.renderer?.domElement ?? document.querySelector('canvas');
    let imageDataUrl = null;
    let imageError = null;
    try {
      imageDataUrl = canvas?.toDataURL?.('image/png') ?? null;
    } catch (error) {
      imageError = String(error instanceof Error ? error.message : error);
    }

    return {
      ok: true,
      poseMode: actor.poseMode,
      clipName: String(clip?.clipName ?? ''),
      playing: Boolean(clip?.playing),
      splatVisible: Boolean(actor?.splatMesh?.visible),
      numSplats: Number(actor?.splatMesh?.numSplats ?? actor?.splatMesh?.num_splats ?? 0),
      bounds: bounds
        ? {
            min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
            max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
          }
        : null,
      imageDataUrl,
      imageError
    };
  });

  assert(result?.ok, `Framing failed: ${result?.error ?? 'unknown'}`);
  assert(result.splatVisible, 'Actor splat is not visible.');
  assert(result.numSplats > 0, `Actor has no splats (numSplats=${result.numSplats}).`);
  assert(!result.imageError, `Canvas capture failed: ${result.imageError}`);
  assert(typeof result.imageDataUrl === 'string' && result.imageDataUrl.startsWith('data:image/png;base64,'), 'Missing image data URL.');

  const base64 = result.imageDataUrl.slice('data:image/png;base64,'.length);
  await fs.promises.writeFile(OUTPUT_PATH, Buffer.from(base64, 'base64'));

  assert(pageErrors === 0, `Encountered ${pageErrors} page errors.`);

  console.log('SHOT_OK');
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, readyState, state: result }, null, 2));
} finally {
  await browser.close();
}
