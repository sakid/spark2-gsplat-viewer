import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/?skipBootProxy=1&autoDefaultScene=0';
const OUTPUT_ROOT = process.env.SPARK2_DIAGNOSTIC_OUT ?? path.resolve('output/playwright/actor-diagnostic');
const TIMEOUT_MS = 420_000;
const VARIANTS = ['source-full', 'masked-fallback', 'subset-direct', 'subset-reloaded', 'actor-cached'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha1File(filePath) {
  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
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
        sourceUrl: environment?.splatSource?.url ?? '',
        proxyKind: environment?.proxyKind ?? 'unknown',
        voxelActive: Number(environment?.voxelData?.activeCount ?? 0)
      };
    });
    if (state.hasSplat && /Model\.spz/i.test(state.sourceUrl)) {
      return state;
    }
    const elapsed = Date.now() - start;
    if (elapsed > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for default environment. hasSplat=${state.hasSplat} source=${state.sourceUrl}`);
    }
    await sleep(1000);
  }
}

async function prepareSelection(page) {
  console.log(`DIAG: open ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__?.sceneManager?.sparkModule), { polling: 100, timeout: TIMEOUT_MS });
  const environment = await waitForDefaultEnvironment(page);
  console.log(`DIAG: default environment ready source=${environment.sourceUrl}`);

  console.log('DIAG: generate voxel');
  await page.evaluate(async () => {
    const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
    const environment = sceneManager?.findEnvironmentEntity?.()
      ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
    if (!environment) throw new Error('Missing EnvironmentSplat.');
    await environment.generateVoxel({ workflow: true });
  });

  const voxelStart = Date.now();
  while (true) {
    const state = await page.evaluate(() => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      const environment = sceneManager?.findEnvironmentEntity?.()
        ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
      return {
        proxyKind: environment?.proxyKind ?? 'unknown',
        activeCount: Number(environment?.voxelData?.activeCount ?? 0)
      };
    });
    if (state.proxyKind === 'voxel' && state.activeCount > 0) break;
    if (Date.now() - voxelStart > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for voxel generation. proxyKind=${state.proxyKind} activeCount=${state.activeCount}`);
    }
    await sleep(1000);
  }

  const selection = await page.evaluate(() => {
    const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
    const result = sceneManager?.autoSelectActorVoxels?.({}, { silent: true }) ?? null;
    window.__SPARK2_DEBUG__?.eventBus?.emit?.('environment:viewMode', 'splats-only');
    return {
      selectedCount: Number(result?.selectedCount ?? 0),
      strategy: String(result?.strategy ?? '')
    };
  });
  assert(selection.selectedCount > 0, 'Actor auto-selection returned zero voxels.');
  console.log(`DIAG: selection ready ${selection.selectedCount}`);
  await sleep(1500);
  return selection;
}

async function captureVariant(page, selection, variant, outputDir, consoleErrors) {
  console.log(`DIAG: preview ${variant}`);
  const result = await page.evaluate(async (name) => {
    const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
    return await sceneManager.previewActorDiagnosticVariant({ variant: name });
  }, variant);
  await sleep(1500);
  const imagePath = path.join(outputDir, `${variant}.png`);
  await page.screenshot({ path: imagePath, fullPage: false });
  console.log(`DIAG: screenshot ${variant}`);
  return {
    variant,
    selection,
    consoleErrors: [...consoleErrors],
    imagePath,
    imageSha1: sha1File(imagePath),
    ...result
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(OUTPUT_ROOT, stamp);
  fs.mkdirSync(outputDir, { recursive: true });

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
    page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
    page.setDefaultTimeout(TIMEOUT_MS);

    const consoleErrors = [];
    page.on('pageerror', (error) => {
      consoleErrors.push(error?.message ?? String(error));
    });

    const selection = await prepareSelection(page);
    const results = [];
    for (const variant of VARIANTS) {
      console.log(`DIAG: capturing ${variant}`);
      results.push(await captureVariant(page, selection, variant, outputDir, consoleErrors));
    }
    await page.close();

    const summary = {
      url: URL,
      outputDir,
      capturedAt: new Date().toISOString(),
      results,
      comparisons: {
        directVsReloadedHashEqual: results.find((entry) => entry.variant === 'subset-direct')?.imageSha1
          === results.find((entry) => entry.variant === 'subset-reloaded')?.imageSha1,
        directVsActorHashEqual: results.find((entry) => entry.variant === 'subset-direct')?.imageSha1
          === results.find((entry) => entry.variant === 'actor-cached')?.imageSha1
      }
    };

    const reportPath = path.join(outputDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

await main();
