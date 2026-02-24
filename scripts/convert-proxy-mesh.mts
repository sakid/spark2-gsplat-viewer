import { stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, flatten, join, prune, quantize, reorder, simplify, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import obj2gltf from 'obj2gltf';

const MiB = 1024 * 1024;
const GiB = 1024 * 1024 * 1024;
const MAX_OBJ_IMPORT_BYTES = 2 * GiB;

interface CliOptions {
  input: string;
  output?: string;
  ratio?: number;
  targetTriangles?: number;
  error: number;
  draco: boolean;
}

function usage(): string {
  return [
    'Usage:',
    '  npm run convert:proxy -- --input <mesh.obj|mesh.glb|mesh.gltf> [--output out.glb] [--target-triangles 600000] [--ratio 0.25] [--error 0.0015] [--no-draco]',
    '',
    'Defaults:',
    '  --target-triangles auto (heuristic based on source size)',
    '  --error 0.0015',
    '  --draco enabled',
    '  --output <input-basename>.proxy.glb',
    '',
    'Notes:',
    '  - Output format is always .glb (best runtime path for this viewer).',
    '  - --ratio overrides --target-triangles.',
    `  - OBJ inputs over ${(MAX_OBJ_IMPORT_BYTES / GiB).toFixed(0)} GiB are rejected to avoid node memory crashes.`
  ].join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes >= GiB) {
    return `${(bytes / GiB).toFixed(2)} GiB`;
  }
  if (bytes >= MiB) {
    return `${(bytes / MiB).toFixed(2)} MiB`;
  }
  return `${bytes} B`;
}

function extension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

function defaultOutputPath(inputPath: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.proxy.glb`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  let dracoEnabled = true;

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--no-draco') {
      dracoEnabled = false;
      continue;
    }
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

  const ratioRaw = args.get('--ratio');
  const ratio = ratioRaw !== undefined ? Number(ratioRaw) : undefined;
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1)) {
    throw new Error(`Invalid --ratio value "${ratioRaw}". Expected number in (0,1].`);
  }

  const targetRaw = args.get('--target-triangles');
  const targetTriangles = targetRaw !== undefined ? Number(targetRaw) : undefined;
  if (targetTriangles !== undefined && (!Number.isFinite(targetTriangles) || targetTriangles < 1000)) {
    throw new Error(`Invalid --target-triangles value "${targetRaw}". Expected number >= 1000.`);
  }

  const errorRaw = args.get('--error') ?? '0.0015';
  const error = Number(errorRaw);
  if (!Number.isFinite(error) || error <= 0 || error > 1) {
    throw new Error(`Invalid --error value "${errorRaw}". Expected number in (0,1].`);
  }

  return {
    input,
    output: args.get('--output'),
    ratio,
    targetTriangles,
    error,
    draco: dracoEnabled
  };
}

async function createIO(): Promise<NodeIO> {
  const encoderModule = await draco3d.createEncoderModule();
  const decoderModule = await draco3d.createDecoderModule();
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': encoderModule,
      'draco3d.decoder': decoderModule,
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder
    });
}

function countTriangles(document: Awaited<ReturnType<NodeIO['read']>>): number {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      if (indices) {
        triangles += Math.floor(indices.getCount() / 3);
        continue;
      }
      if (position) {
        triangles += Math.floor(position.getCount() / 3);
      }
    }
  }
  return triangles;
}

function chooseTargetTriangles(sourceTriangles: number): number {
  if (sourceTriangles > 25_000_000) {
    return 900_000;
  }
  if (sourceTriangles > 10_000_000) {
    return 700_000;
  }
  if (sourceTriangles > 3_000_000) {
    return 500_000;
  }
  if (sourceTriangles > 1_000_000) {
    return 350_000;
  }
  return Math.max(120_000, Math.round(sourceTriangles * 0.6));
}

async function loadDocument(io: NodeIO, inputPath: string): Promise<Awaited<ReturnType<NodeIO['read']>>> {
  const ext = extension(inputPath);
  if (ext === '.obj') {
    const sourceStat = await stat(inputPath);
    if (sourceStat.size > MAX_OBJ_IMPORT_BYTES) {
      throw new Error(
        [
          `OBJ input is ${formatBytes(sourceStat.size)}, which exceeds the safe import limit for Node.`,
          'Use a DCC/offline tool for first-pass reduction (Blender, MeshLab, or similar), then run this script on the reduced mesh.'
        ].join('\n')
      );
    }
    const glb = await obj2gltf(inputPath, { binary: true, separate: false });
    const glbBytes = glb instanceof Uint8Array ? glb : new Uint8Array(glb);
    return io.readBinary(glbBytes);
  }
  if (ext !== '.glb' && ext !== '.gltf') {
    throw new Error(`Unsupported input "${ext || 'unknown'}". Use .obj, .glb, or .gltf.`);
  }
  return io.read(inputPath);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputPath = path.resolve(process.cwd(), options.output ?? defaultOutputPath(inputPath));
  if (extension(outputPath) !== '.glb') {
    throw new Error('Output must be a .glb file.');
  }

  const start = performance.now();
  const io = await createIO();
  const doc = await loadDocument(io, inputPath);

  const sourceTriangles = countTriangles(doc);
  const targetTriangles = options.targetTriangles ?? chooseTargetTriangles(sourceTriangles);
  const ratio = options.ratio ?? (sourceTriangles > 0 ? Math.min(1, targetTriangles / sourceTriangles) : 1);
  const simplifyEnabled = ratio < 0.995;

  const transforms = [
    dedup(),
    flatten(),
    join(),
    weld()
  ];

  if (simplifyEnabled) {
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.01, ratio), error: options.error, lockBorder: true }));
  }

  transforms.push(
    unpartition(),
    prune(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({
      quantizationVolume: 'mesh',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeWeight: 8,
      quantizeGeneric: 12
    }),
    prune()
  );

  if (options.draco) {
    transforms.push(
      draco({
        method: 'edgebreaker',
        encodeSpeed: 7,
        decodeSpeed: 5,
        quantizePosition: 14,
        quantizeNormal: 10,
        quantizeTexcoord: 12,
        quantizeColor: 8
      }),
      prune()
    );
  }

  await doc.transform(...transforms);
  await io.write(outputPath, doc);

  const sourceBytes = (await stat(inputPath)).size;
  const outputBytes = (await stat(outputPath)).size;
  const outputTriangles = countTriangles(doc);
  const elapsedMs = performance.now() - start;

  console.log('Proxy mesh conversion complete');
  console.log(`Input             : ${inputPath}`);
  console.log(`Output            : ${outputPath}`);
  console.log(`Source triangles  : ${sourceTriangles.toLocaleString()}`);
  console.log(`Target triangles  : ${Math.round(targetTriangles).toLocaleString()}`);
  console.log(`Output triangles  : ${outputTriangles.toLocaleString()}`);
  console.log(`Applied ratio     : ${ratio.toFixed(4)}${simplifyEnabled ? '' : ' (no simplification needed)'}`);
  console.log(`Draco compression : ${options.draco ? 'enabled' : 'disabled'}`);
  console.log(`Input size        : ${formatBytes(sourceBytes)}`);
  console.log(`Output size       : ${formatBytes(outputBytes)}`);
  console.log(`Size ratio        : ${(outputBytes / Math.max(sourceBytes, 1)).toFixed(4)}`);
  console.log(`Elapsed           : ${(elapsedMs / 1000).toFixed(2)}s`);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(detail);
  console.error('\n' + usage());
  process.exitCode = 1;
});
