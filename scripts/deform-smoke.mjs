import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://127.0.0.1:5173/';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl']
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  let errors = 0;
  page.on('pageerror', (e) => {
    errors += 1;
    console.log('PAGEERR:', e.message);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__SPARK2_DEBUG__), { polling: 100 });

  // Let splat/proxy boot + animation tick.
  await new Promise((r) => setTimeout(r, 15_000));

  const state = await page.evaluate(() => {
    const sm = window.__SPARK2_DEBUG__?.sceneManager;
    const env = sm?.entities?.find?.((e) => e?.constructor?.name === 'EnvironmentSplat');
    const ext = env?.external;
    return {
      patch: Boolean(sm?.sparkModule?.NewSplatAccumulator?.prototype?.__sparkCovOnlyPatchApplied),
      mode: ext?.deformer?.mode ?? 'unknown',
      sparkNum: sm?.sparkRenderer?.current?.numSplats ?? 0
    };
  });

  console.log('STATE', state);
  assert(errors === 0, `Expected 0 page errors, got ${errors}`);
  assert(state.patch, 'Expected Spark cov-only patch to be applied');
  assert(state.sparkNum > 0, `Expected splats to render, sparkNum=${state.sparkNum}`);
  assert(state.mode === 'skinned' || state.mode === 'transform', `Expected deform mode, got ${state.mode}`);

  await browser.close();
}

await main();
