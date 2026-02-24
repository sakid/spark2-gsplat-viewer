import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SPARK2_URL ?? 'http://localhost:5173/?noSpark=1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
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

  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Wait for viewer exposure.
  await page.waitForFunction(() => Boolean(window.__SPARK2_VIEWER__), { polling: 100 });

  // Install a simple voxel floor and enable collisions.
  await page.evaluate(() => {
    const viewer = window.__SPARK2_VIEWER__;
    const occupiedKeys = new Set();
    const floorY = 0;
    const radius = 30;
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        occupiedKeys.add(`${x},${floorY},${z}`);
      }
    }

    viewer.setVoxelCollisionData({
      origin: { x: 0, y: 0, z: 0 },
      resolution: 1,
      occupiedKeys
    });

    viewer.setCollisionEnabled(true);

    // Put the player above the floor.
    viewer.camera.position.set(0, 3, 0);
  });

  const initialState = await page.evaluate(() => window.__SPARK2_VIEWER__.debugGetState());
  console.log('initial state', initialState);
  const initialProbe = await page.evaluate(() => window.__SPARK2_VIEWER__.debugVoxelProbe());
  console.log('initial probe', initialProbe);

  // Step physics deterministically (headless rAF can be throttled).
  await page.evaluate(() => {
    const viewer = window.__SPARK2_VIEWER__;
    // First step probe
    viewer.debugStep(1 / 60);
    for (let i = 0; i < 180; i++) viewer.debugStep(1 / 60);
  });

  const yAfterGravity = await page.evaluate(() => window.__SPARK2_VIEWER__.camera.position.y);
  const afterGravityState = await page.evaluate(() => window.__SPARK2_VIEWER__.debugGetState());
  console.log('after gravity state', afterGravityState);
  const afterGravityProbe = await page.evaluate(() => window.__SPARK2_VIEWER__.debugVoxelProbe());
  console.log('after gravity probe', afterGravityProbe);
  assert(yAfterGravity < 3, `Expected gravity to reduce Y, got y=${yAfterGravity}`);

  // Simulate movement input.
  await page.keyboard.down('w');
  await page.evaluate(() => {
    const viewer = window.__SPARK2_VIEWER__;
    for (let i = 0; i < 60; i++) viewer.debugStep(1 / 60);
  });
  await page.keyboard.up('w');

  const moved = await page.evaluate(() => {
    const p = window.__SPARK2_VIEWER__.camera.position;
    return { x: p.x, y: p.y, z: p.z };
  });

  assert(Math.abs(moved.x) > 0.01 || Math.abs(moved.z) > 0.01, `Expected X/Z movement, got ${JSON.stringify(moved)}`);

  console.log('collision-smoke: OK', { yAfterGravity, moved });
  await browser.close();
}

await main();
