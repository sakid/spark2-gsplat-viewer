function toPositiveInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return 0;
  return Math.floor(number);
}

export function resolveSplatMeshCount(mesh, fallbackCount = 0) {
  const direct = toPositiveInt(mesh?.numSplats);
  if (direct > 0) return direct;

  const packed = toPositiveInt(mesh?.packedSplats?.numSplats);
  if (packed > 0) return packed;

  const ext = toPositiveInt(mesh?.extSplats?.numSplats);
  if (ext > 0) return ext;

  return toPositiveInt(fallbackCount);
}

export function normalizeSplatMeshCounts(mesh, fallbackCount = 0) {
  if (!mesh || (typeof mesh !== 'object' && typeof mesh !== 'function')) return 0;

  const count = resolveSplatMeshCount(mesh, fallbackCount);
  if (count < 1) return 0;

  mesh.numSplats = count;
  mesh.splatCount = count;
  return count;
}
