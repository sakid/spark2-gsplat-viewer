import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function usage(): string {
  return [
    'Usage:',
    '  npm run convert:ply-to-spz -- --input /absolute/or/relative/input.ply [--output out.spz] [--max-sh 3]',
    '',
    'Defaults:',
    '  --max-sh 3',
    '  --output <input-basename>.spz'
  ].join('\n');
}

function parseArgs(argv: string[]): { input: string; output?: string; maxSh: number } {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) {
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}.`);
    }

    args.set(key, value);
    i += 1;
  }

  const input = args.get('--input');
  if (!input) {
    throw new Error('Missing --input argument.');
  }

  const maxShRaw = args.get('--max-sh') ?? '3';
  const maxSh = Number(maxShRaw);
  if (!Number.isInteger(maxSh) || maxSh < 0 || maxSh > 3) {
    throw new Error(`Invalid --max-sh value "${maxShRaw}". Expected integer 0..3.`);
  }

  return {
    input,
    output: args.get('--output'),
    maxSh
  };
}

function defaultOutputPath(inputPath: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.spz`);
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

async function main(): Promise<void> {
  const { input, output, maxSh } = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), output ?? defaultOutputPath(inputPath));

  let sparkModule: unknown;

  try {
    sparkModule = await import('@sparkjsdev/spark');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        'Cannot import @sparkjsdev/spark for conversion.',
        'Provide preview artifact at vendor/spark-preview.tgz and run npm install.',
        `Original error: ${detail}`
      ].join('\n')
    );
  }

  if (!sparkModule || typeof sparkModule !== 'object' || typeof (sparkModule as any).transcodeSpz !== 'function') {
    throw new Error('Loaded Spark module does not expose transcodeSpz().');
  }

  const transcodeSpz = (sparkModule as any).transcodeSpz as (input: unknown) => Promise<{ fileBytes: Uint8Array | ArrayBuffer }>;

  const inputBytes = new Uint8Array(await readFile(inputPath));
  const start = performance.now();

  const result = await transcodeSpz({
    inputs: [{ fileBytes: inputBytes, pathOrUrl: inputPath }],
    maxSh
  });

  const outputBytes = result.fileBytes instanceof Uint8Array
    ? result.fileBytes
    : new Uint8Array(result.fileBytes);

  await writeFile(outputPath, outputBytes);

  const elapsedMs = performance.now() - start;
  const ratio = outputBytes.byteLength / inputBytes.byteLength;

  console.log('SPZ conversion complete');
  console.log(`Input : ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`maxSh : ${maxSh}`);
  console.log(`Input bytes : ${formatBytes(inputBytes.byteLength)}`);
  console.log(`Output bytes: ${formatBytes(outputBytes.byteLength)}`);
  console.log(`Size ratio  : ${ratio.toFixed(4)}`);
  console.log(`Elapsed     : ${(elapsedMs / 1000).toFixed(2)}s`);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(detail);
  console.error('\n' + usage());
  process.exitCode = 1;
});
