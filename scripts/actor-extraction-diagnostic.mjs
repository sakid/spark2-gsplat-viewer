import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/?skipBootProxy=1&autoDefaultScene=0';
const MODEL_PATH = process.env.SPARK2_MODEL_PATH ?? '/Users/alyoshakidoguchi/Downloads/Model.spz';
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

async function activateControlsPanel(page) {
  const start = Date.now();
  while (true) {
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
      if (Date.now() - start > 30_000) throw new Error('Controls tab not found.');
      await sleep(500);
      continue;
    }
    const ready = await page.evaluate(() => Boolean(document.querySelector('#file-input')));
    if (ready) return;
    if (Date.now() - start > 60_000) throw new Error('Controls panel did not expose #file-input.');
    await sleep(750);
  }
}

async function prepareSelection(page) {
  console.log(`DIAG: open ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  console.log('DIAG: debug wait');
  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__), { polling: 100, timeout: TIMEOUT_MS });
  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__?.sceneManager?.sparkModule), { polling: 100, timeout: TIMEOUT_MS });
  console.log('DIAG: spark ready');
  await activateControlsPanel(page);
  console.log('DIAG: controls ready');
  await page.waitForSelector('#file-input', { timeout: TIMEOUT_MS });

  const fileInput = await page.$('#file-input');
  assert(fileInput, 'Missing #file-input');
  await fileInput.uploadFile(MODEL_PATH);

  console.log('DIAG: workflow start');
  await page.evaluate(async () => {
    const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
    const environment = sceneManager?.findEnvironmentEntity?.()
      ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
    const file = document.querySelector('#file-input')?.files?.[0] ?? null;
    if (!environment) throw new Error('Missing EnvironmentSplat for workflow.');
    await environment.runVoxelWorkflow({ file });
  });

  const workflowStart = Date.now();
  while (true) {
    const state = await page.evaluate(() => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      const environment = sceneManager?.findEnvironmentEntity?.()
        ?? sceneManager?.entities?.find?.((entity) => entity?.constructor?.name === 'EnvironmentSplat');
      const statusNode = document.querySelector('[role="status"]');
      return {
        proxyKind: environment?.proxyKind ?? 'unknown',
        activeCount: Number(environment?.voxelData?.activeCount ?? 0),
        status: String(statusNode?.textContent ?? '').trim()
      };
    });
    if (state.proxyKind === 'voxel' && state.activeCount > 0) break;
    const elapsed = Date.now() - workflowStart;
    if (Math.floor(elapsed / 10000) !== Math.floor((elapsed - 1000) / 10000)) {
      console.log(`DIAG: workflow wait t=${Math.round(elapsed / 1000)}s proxyKind=${state.proxyKind} active=${state.activeCount} status=${state.status}`);
    }
    if (elapsed > TIMEOUT_MS) {
      throw new Error(`Timed out waiting for voxel workflow. proxyKind=${state.proxyKind} activeCount=${state.activeCount} status=${state.status}`);
    }
    await sleep(1_000);
  }

  console.log('DIAG: voxel ready');
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
  await sleep(1_500);
  return selection;
}

async function captureVariant(browser, variant, outputDir) {
  const page = await browser.newPage();
  page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
  page.setDefaultTimeout(TIMEOUT_MS);

  const consoleErrors = [];
  page.on('pageerror', (error) => {
    consoleErrors.push(error?.message ?? String(error));
  });

  try {
    const selection = await prepareSelection(page);
    console.log(`DIAG: preview ${variant}`);
    const result = await page.evaluate(async (name) => {
      const sceneManager = window.__SPARK2_DEBUG__?.sceneManager;
      return await sceneManager.previewActorDiagnosticVariant({ variant: name });
    }, variant);
    console.log(`DIAG: preview ready ${variant}`);
    await sleep(2_000);
    const imagePath = path.join(outputDir, `${variant}.png`);
    await page.screenshot({ path: imagePath, fullPage: false });
    console.log(`DIAG: screenshot ${variant}`);
    return {
      variant,
      selection,
      consoleErrors,
      imagePath,
      imageSha1: sha1File(imagePath),
      ...result
    };
  } finally {
    await page.close();
  }
}

async function main() {
  assert(fs.existsSync(MODEL_PATH), `Model file not found: ${MODEL_PATH}`);
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
    const results = [];
    for (const variant of VARIANTS) {
      console.log(`DIAG: capturing ${variant}`);
      results.push(await captureVariant(browser, variant, outputDir));
    }

    const summary = {
      url: URL,
      modelPath: MODEL_PATH,
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
