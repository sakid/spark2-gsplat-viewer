import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/?skipBootProxy=1';
const MODEL_PATH = process.env.SPARK2_MODEL_PATH ?? '/Users/alyoshakidoguchi/Downloads/Model.spz';
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

async function main() {
  assert(fs.existsSync(MODEL_PATH), `Model file not found: ${MODEL_PATH}`);
  console.log('SMOKE: starting voxel segmentation smoke');
  console.log(`SMOKE: url=${URL}`);
  console.log(`SMOKE: model=${MODEL_PATH}`);

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
    await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__), { polling: 100, timeout: TIMEOUT_MS });

    console.log('SMOKE: activating controls panel');
    const controlsPanelStart = Date.now();
    let controlsReady = false;
    while (!controlsReady) {
      const activated = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.dv-tab'));
        const controlsTab = tabs.find((tab) => /controls/i.test(String(tab?.textContent ?? '').trim()));
        if (!controlsTab) return false;
        const eventInit = { bubbles: true, cancelable: true, composed: true };
        controlsTab.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        controlsTab.dispatchEvent(new MouseEvent('mousedown', eventInit));
        controlsTab.dispatchEvent(new PointerEvent('pointerup', eventInit));
        controlsTab.dispatchEvent(new MouseEvent('mouseup', eventInit));
        controlsTab.dispatchEvent(new MouseEvent('click', eventInit));
        controlsTab.click?.();
        return true;
      });
      if (!activated) {
        if (Date.now() - controlsPanelStart > 30_000) {
          throw new Error('Controls tab not found in Dockview layout.');
        }
        await sleep(500);
        continue;
      }
      controlsReady = await page.evaluate(() => Boolean(document.querySelector('#file-input')));
      if (controlsReady) break;
      if (Date.now() - controlsPanelStart > 60_000) {
        throw new Error('Controls panel did not expose #file-input.');
      }
      await sleep(750);
    }

    await page.waitForSelector('#file-input', { timeout: TIMEOUT_MS });
    await page.waitForSelector('#run-voxel-workflow-btn', { timeout: TIMEOUT_MS });
    console.log('SMOKE: controls ready');

    const fileInput = await page.$('#file-input');
    if (!fileInput) {
      throw new Error('Missing #file-input');
    }

    console.log('SMOKE: uploading model');
    await fileInput.uploadFile(MODEL_PATH);

    const runWorkflowButton = await page.$('#run-voxel-workflow-btn');
    if (!runWorkflowButton) {
      throw new Error('Missing #run-voxel-workflow-btn');
    }

    console.log('SMOKE: running voxel workflow');
    await runWorkflowButton.click();

    const waitStart = Date.now();
    let ready = false;
    while (!ready) {
      const state = await page.evaluate(() => {
        const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
        const environment = sceneManager?.findEnvironmentEntity?.()
          ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
        const statusNode = document.querySelector('[role="status"]');
        return {
          proxyKind: environment?.proxyKind ?? 'unknown',
          activeCount: Number(environment?.voxelData?.activeCount ?? 0),
          statusText: String(statusNode?.textContent ?? '').trim()
        };
      });

      ready = state.proxyKind === 'voxel' && state.activeCount > 0;
      if (ready) {
        console.log(`SMOKE: voxel workflow ready (activeCount=${state.activeCount})`);
        break;
      }

      const elapsed = Date.now() - waitStart;
      if (elapsed > TIMEOUT_MS) {
        throw new Error(
          `Timed out waiting for voxel workflow readiness. proxyKind=${state.proxyKind} activeCount=${state.activeCount} status="${state.statusText}"`
        );
      }
      if (Math.floor(elapsed / 10_000) !== Math.floor((elapsed - 1000) / 10_000)) {
        console.log(
          `SMOKE: waiting... t=${Math.round(elapsed / 1000)}s proxyKind=${state.proxyKind} activeCount=${state.activeCount} status="${state.statusText}"`
        );
      }
      await sleep(1_000);
    }

    await sleep(2_000);
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

      const components = [];
      const visited = new Set();
      for (const startKey of occupied) {
        if (visited.has(startKey)) continue;
        const queue = [startKey];
        visited.add(startKey);
        let head = 0;

        let count = 0;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;

        while (head < queue.length) {
          const key = queue[head++];
          const [x, y, z] = parseKey(key);
          count += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          minZ = Math.min(minZ, z);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          maxZ = Math.max(maxZ, z);

          const neighbors = [
            hashKey(x + 1, y, z),
            hashKey(x - 1, y, z),
            hashKey(x, y + 1, z),
            hashKey(x, y - 1, z),
            hashKey(x, y, z + 1),
            hashKey(x, y, z - 1)
          ];
          for (const neighbor of neighbors) {
            if (!occupied.has(neighbor) || visited.has(neighbor)) continue;
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }

        const width = (maxX - minX + 1) * resolution;
        const height = (maxY - minY + 1) * resolution;
        const depth = (maxZ - minZ + 1) * resolution;
        const footprint = Math.max(width, depth, resolution);
        const volume = width * height * depth;
        const centerY = origin.y + ((minY + maxY + 1) * 0.5) * resolution;
        const elevated = (centerY - globalMinY) / globalHeight;
        const slenderness = height / footprint;
        const compactness = count / Math.max(1, volume / (resolution ** 3));

        let score = slenderness * 1.6 + elevated * 0.8 + Math.log10(count + 1) * 0.5 + compactness * 0.2;
        if (count < 60) score -= 2.5;
        if (count > occupied.size * 0.55) score -= 1.5;

        components.push({
          sampleKey: startKey,
          count,
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ },
          width,
          height,
          depth,
          centerY,
          slenderness,
          compactness,
          score
        });
      }

      components.sort((a, b) => b.count - a.count);
      const rankedByScore = [...components].sort((a, b) => b.score - a.score);
      const candidate = rankedByScore[0] ?? null;
      if (!candidate) {
        throw new Error('No voxel component candidate found for segmentation.');
      }

      const seedIndex = voxelData.keyToIndex.get(candidate.sampleKey);
      if (!Number.isInteger(seedIndex)) {
        throw new Error(`Cannot resolve seed voxel index for key ${candidate.sampleKey}`);
      }

      sceneManager.voxelEditState.selectOnly(seedIndex);
      sceneManager.selectConnectedVoxels();
      const selectedCount = sceneManager.voxelEditState.getSelectedCount();

      return {
        voxelCount: occupied.size,
        componentCount: components.length,
        selectedCount,
        selectedTargetCount: candidate.count,
        selectedMatchesTarget: selectedCount === candidate.count,
        candidate,
        topComponentsByCount: components.slice(0, 10),
        topComponentsByScore: rankedByScore.slice(0, 10),
        alignment: {
          centerDelta,
          centerDistance,
          normalizedCenterDistance,
          voxelBounds,
          splatBounds: splatBoundsJson,
          voxelDiagonal,
          splatDiagonal
        }
      };
    });

    console.log(
      `SMOKE: candidate count=${pre.candidate?.count ?? 0}, components=${pre.componentCount}, selected=${pre.selectedCount}`
    );

    console.log('SMOKE: starting extraction');
    await page.evaluate(() => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      window.__VOXEL_SEG_SMOKE__ = {
        done: false,
        error: null
      };
      Promise.resolve(sceneManager.extractSelectedVoxelActor())
        .then(() => {
          window.__VOXEL_SEG_SMOKE__.done = true;
        })
        .catch((error) => {
          window.__VOXEL_SEG_SMOKE__.done = true;
          window.__VOXEL_SEG_SMOKE__.error = error instanceof Error ? error.message : String(error);
        });
    });

    const extractionStart = Date.now();
    let post = null;
    while (true) {
      post = await page.evaluate(() => {
        const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
        const extraction = window.__VOXEL_SEG_SMOKE__ ?? { done: false, error: null };
        const actors = sceneManager?.entities?.filter?.((entity) => entity?.constructor?.name === 'VoxelSplatActor') ?? [];
        const actor = actors[actors.length - 1] ?? null;
        const animationState = actor?.voxelRuntime?.getAnimationState?.() ?? null;

        const environment = sceneManager?.findEnvironmentEntity?.()
          ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
        const statusNode = document.querySelector('[role="status"]');

        return {
          done: Boolean(extraction.done),
          error: extraction.error ? String(extraction.error) : null,
          statusText: String(statusNode?.textContent ?? '').trim(),
          actor: {
            created: Boolean(actor),
            clipName: String(animationState?.clipName ?? ''),
            clipIndex: Number(animationState?.clipIndex ?? -1),
            playing: Boolean(animationState?.playing),
            voxelCount: Number(actor?.voxelData?.activeCount ?? 0)
          },
          environment: {
            proxyKind: environment?.proxyKind ?? 'unknown',
            masked: Boolean(environment?.splatMesh?.worldModifier),
            trackedBySceneManager: Boolean(sceneManager?.worldMaskByMesh?.has?.(environment?.splatMesh)),
            trackedMaskCount: Number(sceneManager?.worldMaskByMesh?.size ?? 0)
          }
        };
      });

      if (post.error) {
        throw new Error(`Extraction failed: ${post.error}`);
      }

      if (post.actor.created && post.done) {
        console.log('SMOKE: extraction completed');
        break;
      }

      const elapsed = Date.now() - extractionStart;
      if (elapsed > 240_000) {
        throw new Error(
          `Timed out waiting for extraction completion. state=${JSON.stringify(post)}`
        );
      }

      if (Math.floor(elapsed / 10_000) !== Math.floor((elapsed - 1000) / 10_000)) {
        console.log(
          `SMOKE: extracting... t=${Math.round(elapsed / 1000)}s done=${post.done} actor=${post.actor.created} status="${post.statusText}"`
        );
      }
      await sleep(1_000);
    }

    const smoke = { pre, post };

    assert(pageErrors === 0, `Encountered ${pageErrors} browser page errors.`);
    assert(Number(pre.voxelCount) > 0, 'No voxels generated.');
    assert(Number(pre.componentCount) > 0, 'No connected voxel components detected.');
    assert(Boolean(pre.selectedMatchesTarget), `Connected selection mismatch: ${pre.selectedCount} vs ${pre.selectedTargetCount}.`);
    assert(Boolean(post.actor?.created), 'Voxel extraction did not create an actor.');
    assert(Boolean(post.actor?.playing), 'Extracted actor is not playing.');
    assert(
      post.actor?.clipIndex === 1 || String(post.actor?.clipName).toLowerCase().includes('walk'),
      `Expected walk cycle clip, got index=${post.actor?.clipIndex} name=${post.actor?.clipName}.`
    );
    assert(
      Boolean(post.environment?.trackedBySceneManager) && Number(post.environment?.trackedMaskCount ?? 0) > 0,
      'Environment splat mask was not tracked after extraction.'
    );
    if (Number.isFinite(pre.alignment?.normalizedCenterDistance)) {
      assert(
        pre.alignment.normalizedCenterDistance <= 0.35,
        `Voxel/splat alignment drift too large: normalized center delta ${pre.alignment.normalizedCenterDistance.toFixed(4)}.`
      );
    }

    console.log('VOXEL_SEGMENTATION_SMOKE_OK');
    console.log(pretty({ smoke }));
  } finally {
    await browser.close();
  }
}

await main();
