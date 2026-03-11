function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function evalCondition(condition, state) {
  if (!condition) return true;
  if (!isObject(condition)) return false;

  if (Array.isArray(condition.any)) {
    return condition.any.some((child) => evalCondition(child, state));
  }
  if (Array.isArray(condition.all)) {
    return condition.all.every((child) => evalCondition(child, state));
  }
  if (condition.not) {
    return !evalCondition(condition.not, state);
  }

  if (typeof condition.flag === 'string') {
    const expected = condition.is !== false;
    return Boolean(state.getFlag(condition.flag)) === expected;
  }

  if (typeof condition.quest === 'string') {
    const quest = state.getQuest(condition.quest);
    const status = quest?.status ?? 'inactive';
    return status === condition.status;
  }

  if (typeof condition.var === 'string') {
    const value = state.getVar(condition.var);
    if ('eq' in condition) return value === condition.eq;
    if ('neq' in condition) return value !== condition.neq;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    if (typeof condition.gt === 'number') return numeric > condition.gt;
    if (typeof condition.gte === 'number') return numeric >= condition.gte;
    if (typeof condition.lt === 'number') return numeric < condition.lt;
    if (typeof condition.lte === 'number') return numeric <= condition.lte;
    return Boolean(value);
  }

  return false;
}

