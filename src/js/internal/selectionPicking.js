function normalizeUuids(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

export function applySelectionClick(currentUuids, clickedUuid, modifiers = {}) {
  const current = normalizeUuids(currentUuids);
  const additive = Boolean(modifiers?.additive);
  const extend = Boolean(modifiers?.extend);
  const hasClickedUuid = typeof clickedUuid === 'string' && clickedUuid.length > 0;

  if (!hasClickedUuid) {
    if (additive || extend) return current;
    return [];
  }

  const next = new Set(current);
  if (additive || extend) {
    if (additive && next.has(clickedUuid)) next.delete(clickedUuid);
    else next.add(clickedUuid);
  } else {
    next.clear();
    next.add(clickedUuid);
  }

  if (next.size === 0) return [];

  const ordered = [];
  if (next.has(clickedUuid)) ordered.push(clickedUuid);
  for (const uuid of next) {
    if (uuid !== clickedUuid) ordered.push(uuid);
  }
  return ordered;
}

export function resolveSelectionRoot(hitObject, scene, isIgnored = () => false) {
  let cursor = hitObject ?? null;
  while (cursor && cursor !== scene) {
    if (isIgnored(cursor)) return null;
    if (cursor.userData?.editorSelectableRoot) return cursor;
    const parent = cursor.parent ?? null;
    if (!parent || parent === scene) return cursor;
    cursor = parent;
  }
  return null;
}

export function pickSelectionObject(intersections, scene, isIgnored = () => false) {
  if (!Array.isArray(intersections) || !scene) return null;
  for (const hit of intersections) {
    const candidate = resolveSelectionRoot(hit?.object ?? null, scene, isIgnored);
    if (candidate) return candidate;
  }
  return null;
}
