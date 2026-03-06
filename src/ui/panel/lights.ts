import type { SceneLightV2 } from '../../scene/sceneState';
import { asNumber, createNumberInput, isInteractiveElement } from './dom';

function createVectorEditor(
  root: HTMLDivElement,
  values: [number, number, number],
  className: string,
  withNudgeButtons: boolean,
  getMoveStep: () => number,
  onChanged: () => void
): [HTMLInputElement, HTMLInputElement, HTMLInputElement] {
  const inputRow = document.createElement('div');
  inputRow.className = className;

  const x = createNumberInput(values[0]);
  const y = createNumberInput(values[1]);
  const z = createNumberInput(values[2]);

  inputRow.append(x, y, z);
  root.append(inputRow);

  if (withNudgeButtons) {
    const moveControls = document.createElement('div');
    moveControls.className = 'light-move-controls movement-controls';

    const buttons: Array<{ label: string; axis: 'x' | 'y' | 'z'; sign: 1 | -1 }> = [
      { label: 'X-', axis: 'x', sign: -1 },
      { label: 'X+', axis: 'x', sign: 1 },
      { label: 'Y-', axis: 'y', sign: -1 },
      { label: 'Y+', axis: 'y', sign: 1 },
      { label: 'Z-', axis: 'z', sign: -1 },
      { label: 'Z+', axis: 'z', sign: 1 }
    ];

    for (const config of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = config.label;
      button.addEventListener('click', () => {
        const step = Math.max(0.01, getMoveStep());
        const input = config.axis === 'x' ? x : config.axis === 'y' ? y : z;
        input.value = (asNumber(input, 0) + step * config.sign).toFixed(3);
        onChanged();
      });
      moveControls.append(button);
    }

    root.append(moveControls);
  }

  return [x, y, z];
}

function createLightRow(
  light: SceneLightV2,
  getMoveStep: () => number,
  onChanged: (next: SceneLightV2) => void,
  onRemoved: (id: string) => void,
  onSelected: (id: string) => void,
  onFocusRequested: (id: string) => void,
  onGizmoRequested: (id: string) => void,
  isSelected: boolean,
  isGizmoActive: boolean
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'light-row';
  if (isSelected) {
    row.classList.add('is-selected');
  }
  if (isGizmoActive) {
    row.classList.add('is-gizmo-active');
  }
  row.dataset.lightId = light.id;

  row.addEventListener('click', (event) => {
    if (isInteractiveElement(event.target)) {
      return;
    }
    onSelected(light.id);
  });

  const header = document.createElement('div');
  header.className = 'light-row-header';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = light.name;

  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.checked = light.enabled;
  enabledInput.title = 'Enabled';

  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.textContent = isSelected ? 'Selected' : 'Select';

  const focusButton = document.createElement('button');
  focusButton.type = 'button';
  focusButton.textContent = 'Focus';

  const gizmoButton = document.createElement('button');
  gizmoButton.type = 'button';
  gizmoButton.textContent = 'Gizmo';
  gizmoButton.className = 'light-gizmo';
  gizmoButton.disabled = light.type === 'ambient';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.className = 'light-delete';

  header.append(nameInput, enabledInput, selectButton, focusButton, gizmoButton, deleteButton);

  const typeBadge = document.createElement('div');
  typeBadge.className = 'light-type';
  typeBadge.textContent = light.type;

  const meta = document.createElement('div');
  meta.className = 'light-row-meta';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = /^#[0-9a-fA-F]{6}$/.test(light.color) ? light.color : '#ffffff';

  const intensityInput = createNumberInput(light.intensity, '0.05', '0');

  meta.append(colorInput, intensityInput);

  row.append(header, typeBadge, meta);

  let posXInput: HTMLInputElement | null = null;
  let posYInput: HTMLInputElement | null = null;
  let posZInput: HTMLInputElement | null = null;
  let targetXInput: HTMLInputElement | null = null;
  let targetYInput: HTMLInputElement | null = null;
  let targetZInput: HTMLInputElement | null = null;
  let distanceInput: HTMLInputElement | null = null;
  let decayInput: HTMLInputElement | null = null;
  let angleInput: HTMLInputElement | null = null;
  let penumbraInput: HTMLInputElement | null = null;
  let castShadowInput: HTMLInputElement | null = null;
  let shadowMapSizeInput: HTMLInputElement | null = null;
  let shadowBiasInput: HTMLInputElement | null = null;
  let shadowNormalBiasInput: HTMLInputElement | null = null;

  if (light.type !== 'ambient') {
    const positionLabel = document.createElement('div');
    positionLabel.className = 'light-field-label';
    positionLabel.textContent = 'Position';
    row.append(positionLabel);

    [posXInput, posYInput, posZInput] = createVectorEditor(
      row,
      light.position,
      'light-row-position movement-controls',
      true,
      getMoveStep,
      emit
    );

    if (light.type === 'directional' || light.type === 'spot') {
      const targetLabel = document.createElement('div');
      targetLabel.className = 'light-field-label';
      targetLabel.textContent = 'Target';
      row.append(targetLabel);

      [targetXInput, targetYInput, targetZInput] = createVectorEditor(
        row,
        light.target,
        'light-row-position movement-controls',
        true,
        getMoveStep,
        emit
      );
    }

    if (light.type === 'point' || light.type === 'spot') {
      const attenuationLabel = document.createElement('div');
      attenuationLabel.className = 'light-field-label';
      attenuationLabel.textContent = 'Attenuation';
      row.append(attenuationLabel);

      const attenuationRow = document.createElement('div');
      attenuationRow.className = 'light-row-advanced';
      distanceInput = createNumberInput(light.distance, '0.1', '0');
      decayInput = createNumberInput(light.decay, '0.1', '0');
      attenuationRow.append(distanceInput, decayInput);
      row.append(attenuationRow);
    }

    if (light.type === 'spot') {
      const coneLabel = document.createElement('div');
      coneLabel.className = 'light-field-label';
      coneLabel.textContent = 'Cone';
      row.append(coneLabel);

      const coneRow = document.createElement('div');
      coneRow.className = 'light-row-advanced';
      angleInput = createNumberInput(light.angle, '0.01', '0.01', String(Math.PI / 2));
      penumbraInput = createNumberInput(light.penumbra, '0.01', '0', '1');
      coneRow.append(angleInput, penumbraInput);
      row.append(coneRow);
    }

    const shadowLabel = document.createElement('div');
    shadowLabel.className = 'light-field-label';
    shadowLabel.textContent = 'Shadows';
    row.append(shadowLabel);

    const shadowToggleRow = document.createElement('label');
    shadowToggleRow.className = 'toggle';
    castShadowInput = document.createElement('input');
    castShadowInput.type = 'checkbox';
    castShadowInput.checked = light.castShadow;
    const castShadowText = document.createElement('span');
    castShadowText.textContent = 'Cast shadow';
    shadowToggleRow.append(castShadowInput, castShadowText);
    row.append(shadowToggleRow);

    const shadowRow = document.createElement('div');
    shadowRow.className = 'light-row-shadow';
    shadowMapSizeInput = createNumberInput(light.shadowMapSize, '128', '128', '8192');
    shadowBiasInput = createNumberInput(light.shadowBias, '0.0001', '-0.1', '0.1');
    shadowNormalBiasInput = createNumberInput(light.shadowNormalBias, '0.001', '0', '1');
    shadowRow.append(shadowMapSizeInput, shadowBiasInput, shadowNormalBiasInput);
    row.append(shadowRow);
  }

  function emit(): void {
    const common = {
      id: light.id,
      name: nameInput.value.trim() || light.name,
      enabled: enabledInput.checked,
      color: colorInput.value,
      intensity: asNumber(intensityInput, light.intensity)
    };

    if (light.type === 'ambient') {
      onChanged({
        ...common,
        type: 'ambient'
      });
      return;
    }

    const position: [number, number, number] = [
      asNumber(posXInput as HTMLInputElement, 0),
      asNumber(posYInput as HTMLInputElement, 0),
      asNumber(posZInput as HTMLInputElement, 0)
    ];

    const castShadow = castShadowInput ? castShadowInput.checked : false;
    const shadowMapSize = shadowMapSizeInput ? Math.max(128, Math.floor(asNumber(shadowMapSizeInput, 1024))) : 1024;
    const shadowBias = shadowBiasInput ? asNumber(shadowBiasInput, -0.0005) : -0.0005;
    const shadowNormalBias = shadowNormalBiasInput ? asNumber(shadowNormalBiasInput, 0.02) : 0.02;

    if (light.type === 'directional') {
      const target: [number, number, number] = [
        asNumber(targetXInput as HTMLInputElement, 0),
        asNumber(targetYInput as HTMLInputElement, 0),
        asNumber(targetZInput as HTMLInputElement, 0)
      ];

      onChanged({
        ...common,
        type: 'directional',
        position,
        target,
        castShadow,
        shadowMapSize,
        shadowBias,
        shadowNormalBias
      });
      return;
    }

    const pointBase = {
      ...common,
      position,
      distance: Math.max(0, asNumber(distanceInput as HTMLInputElement, 0)),
      decay: Math.max(0, asNumber(decayInput as HTMLInputElement, 2)),
      castShadow,
      shadowMapSize,
      shadowBias,
      shadowNormalBias
    };

    if (light.type === 'point') {
      onChanged({
        ...pointBase,
        type: 'point'
      });
      return;
    }

    const target: [number, number, number] = [
      asNumber(targetXInput as HTMLInputElement, 0),
      asNumber(targetYInput as HTMLInputElement, 0),
      asNumber(targetZInput as HTMLInputElement, 0)
    ];

    onChanged({
      ...pointBase,
      type: 'spot',
      target,
      angle: Math.min(Math.max(asNumber(angleInput as HTMLInputElement, Math.PI / 6), 0.01), Math.PI / 2),
      penumbra: Math.min(Math.max(asNumber(penumbraInput as HTMLInputElement, 0.2), 0), 1)
    });
  }

  const watchedInputs: Array<HTMLInputElement> = [nameInput, enabledInput, colorInput, intensityInput];
  if (posXInput) watchedInputs.push(posXInput);
  if (posYInput) watchedInputs.push(posYInput);
  if (posZInput) watchedInputs.push(posZInput);
  if (targetXInput) watchedInputs.push(targetXInput);
  if (targetYInput) watchedInputs.push(targetYInput);
  if (targetZInput) watchedInputs.push(targetZInput);
  if (distanceInput) watchedInputs.push(distanceInput);
  if (decayInput) watchedInputs.push(decayInput);
  if (angleInput) watchedInputs.push(angleInput);
  if (penumbraInput) watchedInputs.push(penumbraInput);
  if (castShadowInput) watchedInputs.push(castShadowInput);
  if (shadowMapSizeInput) watchedInputs.push(shadowMapSizeInput);
  if (shadowBiasInput) watchedInputs.push(shadowBiasInput);
  if (shadowNormalBiasInput) watchedInputs.push(shadowNormalBiasInput);

  for (const input of watchedInputs) {
    input.addEventListener('input', emit);
    input.addEventListener('change', emit);
  }

  deleteButton.addEventListener('click', () => onRemoved(light.id));
  selectButton.addEventListener('click', () => onSelected(light.id));
  focusButton.addEventListener('click', () => onFocusRequested(light.id));
  gizmoButton.addEventListener('click', () => onGizmoRequested(light.id));

  return row;
}


export { createLightRow };
