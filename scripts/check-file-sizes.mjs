import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const BINARY_LIMIT_BYTES = 100 * 1024 * 1024;
const SOURCE_LINE_LIMIT = 1200;

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx']);

const ALLOWED_LARGE_BINARIES = new Set([
  'public/assets/proxies/sean_proxy_animated.glb',
  'public/assets/splats/Sean_Sheep.spz'
]);

const ALLOWED_LARGE_SOURCES = new Set([
  // Temporary: migration from monolithic app bootstrap is in progress.
  'src/main.ts'
]);

function getTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeFile(filePath) {
  return filePath.split(path.sep).join('/');
}

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const trackedFiles = getTrackedFiles();
  const binaryFailures = [];
  const sourceFailures = [];

  for (const filePath of trackedFiles) {
    if (!fs.existsSync(filePath)) continue;
    const normalized = normalizeFile(filePath);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    if (stat.size > BINARY_LIMIT_BYTES && !ALLOWED_LARGE_BINARIES.has(normalized)) {
      binaryFailures.push({ file: normalized, size: stat.size });
    }

    const extension = path.extname(normalized);
    if (!SOURCE_EXTENSIONS.has(extension)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = countLines(content);
    if (lines > SOURCE_LINE_LIMIT && !ALLOWED_LARGE_SOURCES.has(normalized)) {
      sourceFailures.push({ file: normalized, lines });
    }
  }

  if (binaryFailures.length === 0 && sourceFailures.length === 0) {
    console.log(
      `Size checks passed (binary <= ${formatMb(BINARY_LIMIT_BYTES)}, source <= ${SOURCE_LINE_LIMIT} lines).`
    );
    return;
  }

  if (binaryFailures.length) {
    console.error('\nLarge binary files detected:');
    for (const item of binaryFailures) {
      console.error(`- ${item.file}: ${formatMb(item.size)} (limit ${formatMb(BINARY_LIMIT_BYTES)})`);
    }
    console.error('\nUse Git LFS or reduce asset size before committing.');
  }

  if (sourceFailures.length) {
    console.error('\nLarge source files detected:');
    for (const item of sourceFailures) {
      console.error(`- ${item.file}: ${item.lines} lines (limit ${SOURCE_LINE_LIMIT})`);
    }
    console.error('\nSplit large source files or explicitly document temporary exceptions.');
  }

  process.exitCode = 1;
}

main();
