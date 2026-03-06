export function asNumber(input: HTMLInputElement, fallback: number): number {
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

export function createNumberInput(value: number, step = '0.1', min?: string, max?: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = Number.isFinite(value) ? String(value) : '0';
  input.step = step;
  if (min != null) input.min = min;
  if (max != null) input.max = max;
  return input;
}

export function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLButtonElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLLabelElement;
}

