export interface OutlinerListItem {
  id: string;
  parentId: string | null;
}

export function orderOutlinerItems<T extends OutlinerListItem>(
  allItems: T[],
  renderedOutlinerItems: T[]
): Array<{ item: T; depth: number }> {
  const itemById = new Map(allItems.map((item) => [item.id, item]));
  const childrenByParent = new Map<string | null, T[]>();
  for (const item of allItems) {
    const parentId = item.parentId && itemById.has(item.parentId) ? item.parentId : null;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(item);
    childrenByParent.set(parentId, list);
  }

  const ordered: Array<{ item: T; depth: number }> = [];
  const visited = new Set<string>();

  const walk = (parentId: string | null, depth: number): void => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const item of children) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      ordered.push({ item, depth });
      walk(item.id, depth + 1);
    }
  };

  walk(null, 0);
  for (const item of renderedOutlinerItems) {
    if (!visited.has(item.id)) {
      ordered.push({ item, depth: 0 });
    }
  }

  return ordered;
}

