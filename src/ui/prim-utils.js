// npm install dockview-core tweakpane && npm run dev

const DEFAULT_PRIM = () => ({
  path: '',
  type: 'Xform',
  attributes: {},
  variants: {},
  references: []
});

const asToken = (value, fallback = 'node') => {
  const text = String(value ?? fallback).trim();
  return text.replace(/[^a-zA-Z0-9_\-]+/g, '_') || fallback;
};

export const inferPrimType = (obj) => {
  if (!obj) return 'Xform';
  if (obj.isScene) return 'Scene';
  if (obj.isPerspectiveCamera || obj.isOrthographicCamera) return 'Camera';
  if (obj.isAmbientLight) return 'AmbientLight';
  if (obj.isDirectionalLight) return 'DirectionalLight';
  if (obj.isPointLight) return 'PointLight';
  if (obj.isSpotLight) return 'SpotLight';
  if (obj.isLight) return 'Light';
  if (obj.isMesh) return 'Mesh';
  if (obj.isGroup) return 'Xform';
  if (obj.constructor?.name === 'SplatMesh') return 'SplatMesh';
  if ('lod' in obj || 'nonLod' in obj || 'objectModifier' in obj) return 'SplatMesh';
  return obj.type || obj.constructor?.name || 'Xform';
};

export const buildPrimPath = (obj) => {
  if (!obj) return '/';
  const segments = [];
  let cursor = obj;
  while (cursor && !cursor.isScene) {
    const name = cursor.name || cursor.type || cursor.constructor?.name || cursor.uuid;
    segments.push(asToken(name));
    cursor = cursor.parent;
  }
  segments.reverse();
  return `/${segments.join('/')}`;
};

export const ensurePrim = (obj) => {
  if (!obj) return DEFAULT_PRIM();
  obj.userData ??= {};
  const current = obj.userData.prim;
  if (!current || typeof current !== 'object') {
    obj.userData.prim = DEFAULT_PRIM();
  }
  const prim = obj.userData.prim;
  prim.path = typeof prim.path === 'string' ? prim.path : '';
  prim.type = typeof prim.type === 'string' ? prim.type : inferPrimType(obj);
  prim.attributes = prim.attributes && typeof prim.attributes === 'object' ? prim.attributes : {};
  prim.variants = prim.variants && typeof prim.variants === 'object' ? prim.variants : {};
  prim.references = Array.isArray(prim.references) ? prim.references : [];
  return prim;
};

export const stampPrim = (obj) => {
  if (!obj) return null;
  const prim = ensurePrim(obj);
  prim.type = inferPrimType(obj);
  prim.path = buildPrimPath(obj);
  return prim;
};

export const stampPrimTree = (root) => {
  if (!root) return;
  stampPrim(root);
  for (const child of root.children || []) {
    stampPrimTree(child);
  }
};

export const updatePathsOnReparent = (movedObj) => {
  if (!movedObj) return;
  stampPrimTree(movedObj);
};

const maybeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const extractSplatMeta = (obj) => {
  if (!obj) {
    return { isSplatMesh: false, lodEnabled: null, lodSplatCount: null, splatCount: null };
  }

  const isSplatMesh = obj.constructor?.name === 'SplatMesh' || inferPrimType(obj) === 'SplatMesh';
  const lodEnabled = 'lod' in obj ? Boolean(obj.lod) : 'enableLod' in obj ? Boolean(obj.enableLod) : null;
  const lodSplatCount = maybeNumber(obj.lodSplatCount ?? obj.maxSplats ?? obj.splatCountLod ?? null);
  const splatCount = maybeNumber(
    obj.splatCount ?? obj.numSplats ?? obj.pointCount ?? obj.gaussianCount ?? obj.count ?? null
  );

  return { isSplatMesh, lodEnabled, lodSplatCount, splatCount };
};
