export function bindRendererSettingsInputs(
  inputs: Array<HTMLInputElement | HTMLSelectElement>,
  getSettings: () => unknown,
  onChanged: (settings: unknown) => void
): void {
  for (const input of inputs) {
    input.addEventListener('change', () => {
      onChanged(getSettings());
    });
    input.addEventListener('input', () => {
      onChanged(getSettings());
    });
  }
}

