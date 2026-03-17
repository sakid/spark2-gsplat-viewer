import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/?skipBootProxy=1&autoDefaultScene=0';
const TIMEOUT_MS = 420_000;

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

async function waitForDefaultEnvironment(page) {
  const start = Date.now();
  while (true) {
    const state = await page.evaluate(() => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      const environment = sceneManager?.findEnvironmentEntity?.()
        ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
      return {
        hasSplat: Boolean(environment?.splatMesh),
        sourceUrl: environment?.splatSource?.url ?? ''
      };
    });
    if (state.hasSplat && /Model\.spz/i.test(state.sourceUrl)) return state;
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for default environment. state=${pretty(state)}`);
    }
    await sleep(1000);
  }
}

async function main() {
  console.log('SMOKE: starting voxel segmentation smoke');
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

    console.log('SMOKE: opening app');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    console.log('SMOKE: waiting for debug runtime');
    await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__?.sceneManager?.sparkModule), { polling: 100, timeout: TIMEOUT_MS });
    const envState = await waitForDefaultEnvironment(page);
    console.log(`SMOKE: default environment ready source=${envState.sourceUrl}`);

    console.log('SMOKE: generating voxel proxy');
    await page.evaluate(async () => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      const environment = sceneManager?.findEnvironmentEntity?.()
        ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
      if (!environment) {
        throw new Error('Missing environment splat.');
      }
      await environment.generateVoxel({ workflow: true });
    });

    const waitStart = Date.now();
    let ready = false;
    while (!ready) {
      const state = await page.evaluate(() => {
        const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
        const environment = sceneManager?.findEnvironmentEntity?.()
          ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
        return {
          proxyKind: environment?.proxyKind ?? 'unknown',
          activeCount: Number(environment?.voxelData?.activeCount ?? 0)
        };
      });

      ready = state.proxyKind === 'voxel' && state.activeCount > 0;
      if (ready) {
        console.log(`SMOKE: voxel workflow ready (activeCount=${state.activeCount})`);
        break;
      }

      const elapsed = Date.now() - waitStart;
      if (elapsed > TIMEOUT_MS) {
        throw new Error(`Timed out waiting for voxel workflow readiness. state=${pretty(state)}`);
      }
      await sleep(1000);
    }

    await sleep(2000);
    console.log('SMOKE: collecting alignment + segmentation candidate');

    const pre = await page.evaluate(() => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      const environment = sceneManager?.findEnvironmentEntity?.()
        ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
      if (!sceneManager || !environment?.voxelData || !environment?.splatMesh) {
        throw new Error('Missing environment splat or voxel data.');
      }

      const voxelData = environment.voxelData;
      const resolution = Math.max(1e-6, Number(voxelData.resolution) || 1);
      const origin = voxelData.origin ?? { x: 0, y: 0, z: 0 };
      const occupied = new Set(Array.from(voxelData.occupiedKeys ?? []));

      const parseKey = (key) => {
        const [xRaw, yRaw, zRaw] = String(key).split(',');
        return [Number(xRaw) || 0, Number(yRaw) || 0, Number(zRaw) || 0];
      };
      const hashKey = (x, y, z) => `${x},${y},${z}`;

      const gridBounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        minZ: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        maxZ: Number.NEGATIVE_INFINITY
      };
      for (const key of occupied) {
        const [x, y, z] = parseKey(key);
        gridBounds.minX = Math.min(gridBounds.minX, x);
        gridBounds.minY = Math.min(gridBounds.minY, y);
        gridBounds.minZ = Math.min(gridBounds.minZ, z);
        gridBounds.maxX = Math.max(gridBounds.maxX, x + 1);
        gridBounds.maxY = Math.max(gridBounds.maxY, y + 1);
        gridBounds.maxZ = Math.max(gridBounds.maxZ, z + 1);
      }

      const voxelBounds = {
        min: {
          x: origin.x + gridBounds.minX * resolution,
          y: origin.y + gridBounds.minY * resolution,
          z: origin.z + gridBounds.minZ * resolution
        },
        max: {
          x: origin.x + gridBounds.maxX * resolution,
          y: origin.y + gridBounds.maxY * resolution,
          z: origin.z + gridBounds.maxZ * resolution
        }
      };
      const voxelCenter = {
        x: (voxelBounds.min.x + voxelBounds.max.x) * 0.5,
        y: (voxelBounds.min.y + voxelBounds.max.y) * 0.5,
        z: (voxelBounds.min.z + voxelBounds.max.z) * 0.5
      };

      let splatBounds = null;
      if (typeof environment.splatMesh.getBoundingBox === 'function') {
        try {
          const localBounds = environment.splatMesh.getBoundingBox(false);
          if (localBounds && !localBounds.isEmpty?.()) {
            const worldBounds = localBounds.clone();
            environment.splatMesh.updateMatrixWorld?.(true);
            worldBounds.applyMatrix4(environment.splatMesh.matrixWorld);
            splatBounds = worldBounds;
          }
        } catch {
          // Continue with voxel-only metrics.
        }
      }

      const splatBoundsJson = splatBounds
        ? {
            min: { x: splatBounds.min.x, y: splatBounds.min.y, z: splatBounds.min.z },
            max: { x: splatBounds.max.x, y: splatBounds.max.y, z: splatBounds.max.z }
          }
        : null;
      const splatCenter = splatBounds
        ? {
            x: (splatBounds.min.x + splatBounds.max.x) * 0.5,
            y: (splatBounds.min.y + splatBounds.max.y) * 0.5,
            z: (splatBounds.min.z + splatBounds.max.z) * 0.5
          }
        : null;
      const centerDelta = splatCenter
        ? {
            x: voxelCenter.x - splatCenter.x,
            y: voxelCenter.y - splatCenter.y,
            z: voxelCenter.z - splatCenter.z
          }
        : null;
      const centerDistance = centerDelta
        ? Math.hypot(centerDelta.x, centerDelta.y, centerDelta.z)
        : Number.NaN;

      const voxelSize = {
        x: voxelBounds.max.x - voxelBounds.min.x,
        y: voxelBounds.max.y - voxelBounds.min.y,
        z: voxelBounds.max.z - voxelBounds.min.z
      };
      const voxelDiagonal = Math.hypot(voxelSize.x, voxelSize.y, voxelSize.z);
      const splatDiagonal = splatBounds
        ? Math.hypot(
          splatBounds.max.x - splatBounds.min.x,
          splatBounds.max.y - splatBounds.min.y,
          splatBounds.max.z - splatBounds.min.z
        )
        : Number.NaN;
      const normalizedCenterDistance = Number.isFinite(centerDistance) && Number.isFinite(splatDiagonal)
        ? centerDistance / Math.max(1e-6, splatDiagonal)
        : Number.NaN;

      const globalMinY = voxelBounds.min.y;
      const globalHeight = Math.max(voxelBounds.max.y - voxelBounds.min.y, resolution);
      const globalMidY = voxelBounds.min.y + globalHeight * 0.5;

      const countsByBand = new Map();
      let total = 0;
      for (const key of occupied) {
        const [, y] = parseKey(key);
        countsByBand.set(y, (countsByBand.get(y) ?? 0) + 1);
        total += 1;
      }

      const rows = Array.from(countsByBand.entries()).sort((a, b) => a[0] - b[0]).map(([y, count]) => ({
        y,
        count,
        worldY: origin.y + (y + 0.5) * resolution,
        ratio: count / Math.max(total, 1)
      }));

      const candidate = rows
        .filter((row) => row.worldY > globalMidY)
        .sort((a, b) => b.count - a.count || a.worldY - b.worldY)[0]
        ?? rows[Math.floor(rows.length * 0.6)]
        ?? null;

      if (!candidate) {
        return {
          voxelBounds,
          splatBounds: splatBoundsJson,
          centerDistance,
          normalizedCenterDistance,
          candidateY: null,
          selectedCount: 0,
          occupantCount: occupied.size,
          rows
        };
      }

      const candidateY = candidate.y;
      const selectedKeys = [];
      for (const key of occupied) {
        const [x, y, z] = parseKey(key);
        if (y < candidateY) continue;
        const localY = origin.y + (y + 0.5) * resolution;
        const aboveFloor = (localY - globalMinY) / Math.max(globalHeight, resolution);
        if (aboveFloor < 0.32) continue;
        const belowHead = (voxelBounds.max.y - localY) / Math.max(globalHeight, resolution);
        if (belowHead < 0.05) continue;
        const horizontalDistance = Math.hypot(
          origin.x + (x + 0.5) * resolution - voxelCenter.x,
          origin.z + (z + 0.5) * resolution - voxelCenter.z
        );
        if (horizontalDistance > Math.max(voxelSize.x, voxelSize.z) * 0.32) continue;
        selectedKeys.push(hashKey(x, y, z));
      }

      return {
        voxelBounds,
        splatBounds: splatBoundsJson,
        centerDistance,
        normalizedCenterDistance,
        candidateY,
        selectedCount: selectedKeys.length,
        selectedKeys,
        occupantCount: occupied.size,
        rows
      };
    });

    console.log('SMOKE: pre-analysis', pretty(pre));

    const selectionMetrics = await page.evaluate((preselection) => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      const environment = sceneManager?.findEnvironmentEntity?.()
        ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
      if (!sceneManager || !environment?.voxelData) {
        throw new Error('Missing environment for selection metric pass.');
      }

      const voxelData = environment.voxelData;
      const selectedKeys = new Set(preselection.selectedKeys ?? []);
      if (selectedKeys.size < 1) {
        return {
          selectedCount: 0,
          activeCount: Number(voxelData.activeCount ?? voxelData.occupiedKeys?.size ?? 0),
          width: 0,
          height: 0,
          depth: 0,
          slenderness: 0,
          source: 'pre-analysis-empty'
        };
      }

      const selectedIndices = [];
      for (const key of selectedKeys) {
        const index = voxelData.keyToIndex.get(key);
        if (Number.isInteger(index)) selectedIndices.push(index);
      }
      sceneManager.voxelEditState.setSelection(selectedIndices);

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
      for (const key of selectedKeys) {
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
      return {
        selectedCount: selectedKeys.size,
        activeCount: Number(voxelData.activeCount ?? voxelData.occupiedKeys?.size ?? 0),
        width,
        height,
        depth,
        slenderness: height / footprint,
        source: 'pre-analysis-applied'
      };
    }, pre);

    console.log('SMOKE: selection metrics', pretty(selectionMetrics));

    assert(pageErrors === 0, `Encountered ${pageErrors} browser page errors.`);
    assert(selectionMetrics.selectedCount > 0, `Expected selection candidates, got ${selectionMetrics.selectedCount}.`);
    assert(selectionMetrics.slenderness > 1.0, `Selection slenderness too low (${selectionMetrics.slenderness}).`);

    console.log('VOXEL_SEGMENTATION_SMOKE_OK');
    console.log(pretty({ selectionMetrics, pre }));
  } finally {
    await browser.close();
  }
}

await main();
