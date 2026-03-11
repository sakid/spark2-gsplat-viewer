import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/';
const TIMEOUT_MS = 420_000;
const MIN_ACTOR_VOXELS = 90;
const MIN_SLENDERNESS = 1.2;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  console.log('SMOKE: starting default actor extraction smoke');
  console.log(`SMOKE: url=${URL}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
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

    let pageErrors = 0;
    page.on('pageerror', (error) => {
      pageErrors += 1;
      console.log(`PAGEERR: ${error?.message ?? String(error)}`);
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__), {
      polling: 100,
      timeout: TIMEOUT_MS
    });

    const waitStart = Date.now();
    let state = null;

    while (true) {
      state = await page.evaluate(() => {
        const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
        const statusNode = document.querySelector('[role="status"]');

        const actors = sceneManager?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
        const actor = actors[actors.length - 1] ?? null;
        const animationState = actor?.voxelRuntime?.getAnimationState?.() ?? null;
        const voxelData = actor?.voxelData ?? null;

        let metrics = null;
        if (voxelData?.occupiedKeys?.size) {
          const resolution = Math.max(1e-6, Number(voxelData.resolution) || 1);
          const parseKey = (key) => {
            const [xRaw, yRaw, zRaw] = String(key).split(',');
            return [Number(xRaw) || 0, Number(yRaw) || 0, Number(zRaw) || 0];
          };
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let minZ = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          let maxZ = Number.NEGATIVE_INFINITY;

          for (const key of voxelData.occupiedKeys) {
            const [x, y, z] = parseKey(key);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x + 1);
            maxY = Math.max(maxY, y + 1);
            maxZ = Math.max(maxZ, z + 1);
          }

          const width = (maxX - minX) * resolution;
          const height = (maxY - minY) * resolution;
          const depth = (maxZ - minZ) * resolution;
          const footprint = Math.max(width, depth, resolution);
          metrics = {
            activeCount: Number(voxelData.activeCount ?? voxelData.occupiedKeys.size ?? 0),
            width,
            height,
            depth,
            slenderness: height / footprint
          };
        }

        const environment = sceneManager?.findEnvironmentEntity?.()
          ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');

        return {
          statusText: String(statusNode?.textContent ?? '').trim(),
          actor: {
            count: actors.length,
            created: Boolean(actor),
            clipIndex: Number(animationState?.clipIndex ?? -1),
            clipName: String(animationState?.clipName ?? ''),
            playing: Boolean(animationState?.playing),
            metrics
          },
          environment: {
            hasSplat: Boolean(environment?.splatMesh),
            visible: environment?.splatMesh ? Boolean(environment.splatMesh.visible) : null
          }
        };
      });

      const ready = Boolean(state?.actor?.created)
        && Boolean(state?.actor?.playing)
        && Number(state?.actor?.metrics?.activeCount ?? 0) > 0;
      if (ready) break;

      const elapsed = Date.now() - waitStart;
      if (elapsed > TIMEOUT_MS) {
        throw new Error(`Timed out waiting for default actor extraction. state=${pretty(state)}`);
      }
      if (Math.floor(elapsed / 10_000) !== Math.floor((elapsed - 1000) / 10_000)) {
        console.log(
          `SMOKE: waiting... t=${Math.round(elapsed / 1000)}s actorCount=${state?.actor?.count ?? 0} status="${state?.statusText ?? ''}"`
        );
      }
      await sleep(1_000);
    }

    assert(pageErrors === 0, `Encountered ${pageErrors} browser page errors.`);
    assert(Boolean(state.actor.created), 'Default boot did not create a VoxelSplatActor.');
    assert(Boolean(state.actor.playing), 'Default extracted actor is not playing.');
    assert(
      state.actor.clipIndex === 1 || state.actor.clipName.toLowerCase().includes('walk'),
      `Expected walk clip, got index=${state.actor.clipIndex} name=${state.actor.clipName}.`
    );
    assert(
      Number(state.actor.metrics?.activeCount ?? 0) >= MIN_ACTOR_VOXELS,
      `Actor voxel count too low: ${state.actor.metrics?.activeCount ?? 0}.`
    );
    assert(
      Number(state.actor.metrics?.slenderness ?? 0) >= MIN_SLENDERNESS,
      `Actor slenderness too low (${state.actor.metrics?.slenderness ?? 'n/a'}). Likely extracted background slab.`
    );
    assert(
      state.environment.visible === false,
      `Expected environment splat hidden after extraction, got visible=${state.environment.visible}.`
    );

    console.log('DEFAULT_ACTOR_SMOKE_OK');
    console.log(pretty({ state }));
  } finally {
    await browser.close();
  }
}

await main();
