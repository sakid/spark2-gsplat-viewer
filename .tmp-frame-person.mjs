import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5173/?autoDefaultScene=0';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  protocolTimeout: 600000,
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
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__?.sceneManager), { timeout: 420000 });

  await page.evaluate(async () => {
    const sm = window.__SPARK2_DEBUG__?.sceneManager;
    if (!sm) return;

    const findActors = () => sm.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];

    if (findActors().length === 0) {
      const resolutionInput = document.getElementById('voxel-resolution');
      if (resolutionInput && 'value' in resolutionInput) {
        resolutionInput.value = '0.2';
        resolutionInput.dispatchEvent?.(new Event('change', { bubbles: true }));
      }
      const environment = sm.findEnvironmentEntity?.()
        ?? sm.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat')
        ?? null;
      if (environment?.proxyKind !== 'voxel') {
        await environment?.generateVoxel?.({ workflow: true });
        sm.syncVoxelEditData?.();
      }
      if (findActors().length === 0) {
        sm.autoSelectActorVoxels?.({ colorThreshold: 0.3, minCount: 20 }, { silent: true });
        await sm.extractSelectedVoxelActor?.();
        sm.syncVoxelEditData?.();
      }
    }
  });

  await page.waitForFunction(() => {
    const sm = window.__SPARK2_DEBUG__?.sceneManager;
    const actors = sm?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
    return actors.length > 0;
  }, { polling: 250, timeout: 420000 });

  await page.evaluate(() => {
    const sm = window.__SPARK2_DEBUG__?.sceneManager;
    const scene = sm?.scene;
    const actors = sm?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
    const actor = actors[actors.length - 1] ?? null;
    if (!sm || !scene || !actor) return;

    sm.eventBus.emit('environment:viewMode', 'splats-only');
    sm.eventBus.emit('environment:showProxy', false);
    sm.eventBus.emit('environment:showProxyBones', false);
    sm.eventBus.emit('quality:improved', true);
    sm.eventBus.emit('quality:maxDetail', true);

    actor.setPoseMode?.('walk');
    actor.setProxyVisible?.(false);

    // Keep only the latest extracted actor visible.
    for (const staleActor of actors.slice(0, -1)) {
      staleActor?.root?.traverse?.((obj) => {
        obj.visible = false;
      });
    }

    const keep = new Set([actor.splatMesh]);

    scene.traverse((obj) => {
      if (!(obj?.isMesh || obj?.isSkinnedMesh || obj?.isInstancedMesh || obj?.isLine || obj?.isLineSegments)) {
        return;
      }
      const className = String(obj?.constructor?.name ?? '');
      const name = String(obj?.name ?? '');
      const isSparkRenderer = /SparkRenderer/i.test(className);
      const isActorSplat = keep.has(obj) || /Splat::Extracted/i.test(name) || /SplatMesh/i.test(className);
      if (!isSparkRenderer && !isActorSplat) {
        obj.visible = false;
      }
    });

    sm.eventBus.emit('selectionChanged', {
      target: 'object',
      uuids: actor.root?.uuid ? [actor.root.uuid] : [],
      object: actor.root ?? null,
      frameObject: actor.splatMesh ?? actor.root ?? null
    });
    sm.eventBus.emit('selection:focusRequested');
    if (sm.selectionOutline) {
      sm.selectionOutline.visible = false;
    }
  });

  await sleep(5000);

  const state = await page.evaluate(() => {
    const sm = window.__SPARK2_DEBUG__?.sceneManager;
    const scene = sm?.scene;
    const actors = sm?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
    const actor = actors[actors.length - 1] ?? null;
    const clip = actor?.externalRuntime?.animator?.getState?.()
      ?? actor?.voxelRuntime?.getAnimationState?.()
      ?? null;

    let visibleRenderables = 0;
    const visibleRenderableNames = [];
    scene?.traverse?.((obj) => {
      if (!obj?.visible) return;
      if (obj?.isMesh || obj?.isSkinnedMesh || obj?.isInstancedMesh || obj?.isLine || obj?.isLineSegments) {
        visibleRenderables += 1;
        visibleRenderableNames.push(`${obj.constructor?.name ?? obj.type}:${obj.name || '(unnamed)'}`);
      }
    });

    return {
      poseMode: actor?.poseMode,
      clipName: clip?.clipName,
      playing: clip?.playing,
      activeVoxels: Number(actor?.voxelData?.activeCount ?? actor?.voxelData?.occupiedKeys?.size ?? 0),
      numSplats: Number(actor?.splatMesh?.numSplats ?? actor?.splatMesh?.num_splats ?? 0),
      splatVisible: Boolean(actor?.splatMesh?.visible),
      visibleRenderables,
      visibleRenderableNames,
      camera: sm?.camera ? { x: sm.camera.position.x, y: sm.camera.position.y, z: sm.camera.position.z } : null
    };
  });

  console.log('FRAME_READY', JSON.stringify(state));
  await sleep(300000);
} finally {
  await browser.close();
}
