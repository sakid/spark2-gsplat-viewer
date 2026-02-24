import type {
  SceneLightType,
  SceneLightV2,
  SceneSettingsV2,
  SceneSplatRefV1,
  SceneToneMapping
} from '../scene/sceneState';
import type { LoadMode } from '../viewer/loadSplat';
import type { LightGizmoSubmode } from '../viewer/lights';

type StatusKind = 'info' | 'success' | 'warning' | 'error';

export type RendererLightingSettings = Pick<
  SceneSettingsV2,
  'physicallyCorrectLights' | 'toneMapping' | 'toneMappingExposure' | 'shadowsEnabled'
>;

export interface OutlinerItem {
  id: string;
  label: string;
  typeLabel: string;
  visible: boolean;
  parentId: string | null;
  canReparent: boolean;
}

interface PanelDom {
  panel: HTMLElement;
  hidePanelButton: HTMLButtonElement;
  showPanelButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  loadMode: HTMLSelectElement;
  loadButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  lodScale: HTMLInputElement;
  lodCount: HTMLInputElement;
  qualityImproved: HTMLInputElement;
  qualityMaxDetail: HTMLInputElement;
  flipUpDown: HTMLInputElement;
  flipLeftRight: HTMLInputElement;
  status: HTMLElement;
  newLightType: HTMLSelectElement;
  addLightButton: HTMLButtonElement;
  lightEditMode: HTMLInputElement;
  showLightHelpers: HTMLInputElement;
  showLightGizmos: HTMLInputElement;
  showMovementControls: HTMLInputElement;
  showLightingProbes: HTMLInputElement;
  lightGizmoSubmode: HTMLSelectElement;
  lightMoveStep: HTMLInputElement;
  physicallyCorrectLights: HTMLInputElement;
  shadowsEnabled: HTMLInputElement;
  toneMapping: HTMLSelectElement;
  toneMappingExposure: HTMLInputElement;
  lightList: HTMLElement;
  sceneName: HTMLInputElement;
  saveSceneFileButton: HTMLButtonElement;
  openSceneFileButton: HTMLButtonElement;
  loadSceneFileInput: HTMLInputElement;
  sceneSlotName: HTMLInputElement;
  saveSceneSlotButton: HTMLButtonElement;
  sceneSlotSelect: HTMLSelectElement;
  loadSceneSlotButton: HTMLButtonElement;
  deleteSceneSlotButton: HTMLButtonElement;
  missingSplatPrompt: HTMLElement;
  missingSplatText: HTMLElement;
  pickMissingSplatButton: HTMLButtonElement;
  proxyFileInput: HTMLInputElement;
  realignProxyButton: HTMLButtonElement;
  proxyFlipUpDown: HTMLInputElement;
  proxyMirrorX: HTMLInputElement;
  proxyMirrorZ: HTMLInputElement;
  proxyEditMode: HTMLInputElement;
  proxyGizmoMode: HTMLSelectElement;
  resetProxyTransformButton: HTMLButtonElement;
  collisionEnabled: HTMLInputElement;
  showProxyMesh: HTMLInputElement;
  generateVoxelButton: HTMLButtonElement;
  voxelResolution: HTMLInputElement;
  voxelDensity: HTMLInputElement;
  voxelEditMode: HTMLInputElement;
  voxelEditControls: HTMLElement;
  voxelSelectionCount: HTMLElement;
  voxelDeleteButton: HTMLButtonElement;
  voxelUndoButton: HTMLButtonElement;
  exportVoxelGlbButton: HTMLButtonElement;
  outlinerEditMode: HTMLInputElement;
  outlinerGizmoMode: HTMLSelectElement;
  outlinerSearch: HTMLInputElement;
  outlinerFocusButton: HTMLButtonElement;
  exportSceneGlbButton: HTMLButtonElement;
  outlinerList: HTMLElement;
}

export interface ControlPanel {
  getSelectedFile: () => File | null;
  openSplatFilePicker: () => void;
  getLoadMode: () => LoadMode;
  setLoadMode: (mode: LoadMode) => void;
  setStatus: (message: string, kind?: StatusKind) => void;
  setLoading: (loading: boolean) => void;
  confirmRawPly: (file: File) => Promise<boolean>;
  onLoadRequested: (handler: () => void) => void;
  onClearRequested: (handler: () => void) => void;
  onLodScaleChanged: (handler: (value: number) => void) => void;
  onLodCountChanged: (handler: (value: number) => void) => void;
  getLodScaleValue: () => number;
  getLodCountValue: () => number;
  setLodScaleValue: (value: number) => void;
  setLodCountValue: (value: number) => void;
  isImprovedQualityEnabled: () => boolean;
  setImprovedQualityEnabled: (enabled: boolean) => void;
  onImprovedQualityChanged: (handler: (enabled: boolean) => void) => void;
  isMaxDetailEnabled: () => boolean;
  setMaxDetailEnabled: (enabled: boolean) => void;
  onMaxDetailChanged: (handler: (enabled: boolean) => void) => void;
  isFlipUpDownEnabled: () => boolean;
  setFlipUpDownEnabled: (enabled: boolean) => void;
  isFlipLeftRightEnabled: () => boolean;
  setFlipLeftRightEnabled: (enabled: boolean) => void;
  onFlipUpDownChanged: (handler: (enabled: boolean) => void) => void;
  onFlipLeftRightChanged: (handler: (enabled: boolean) => void) => void;
  setLightList: (lights: SceneLightV2[]) => void;
  onAddLightRequested: (handler: (type: SceneLightType) => void) => void;
  onLightChanged: (handler: (light: SceneLightV2) => void) => void;
  onLightRemoved: (handler: (id: string) => void) => void;
  onLightSelected: (handler: (id: string) => void) => void;
  onLightFocusRequested: (handler: (id: string) => void) => void;
  onLightGizmoRequested: (handler: (id: string) => void) => void;
  setSelectedLight: (id: string | null) => void;
  setActiveGizmoLight: (id: string | null) => void;
  getLightGizmoSubmode: () => LightGizmoSubmode;
  setLightGizmoSubmode: (submode: LightGizmoSubmode) => void;
  onLightGizmoSubmodeChanged: (handler: (submode: LightGizmoSubmode) => void) => void;
  isLightHelpersEnabled: () => boolean;
  setLightHelpersEnabled: (enabled: boolean) => void;
  onLightHelpersChanged: (handler: (enabled: boolean) => void) => void;
  isLightEditModeEnabled: () => boolean;
  setLightEditModeEnabled: (enabled: boolean) => void;
  onLightEditModeChanged: (handler: (enabled: boolean) => void) => void;
  isLightGizmosEnabled: () => boolean;
  setLightGizmosEnabled: (enabled: boolean) => void;
  onLightGizmosChanged: (handler: (enabled: boolean) => void) => void;
  isMovementControlsEnabled: () => boolean;
  setMovementControlsEnabled: (enabled: boolean) => void;
  onMovementControlsChanged: (handler: (enabled: boolean) => void) => void;
  isLightingProbeEnabled: () => boolean;
  setLightingProbeEnabled: (enabled: boolean) => void;
  onLightingProbeToggled: (handler: (enabled: boolean) => void) => void;
  getRendererLightingSettings: () => RendererLightingSettings;
  setRendererLightingSettings: (settings: RendererLightingSettings) => void;
  onRendererLightingSettingsChanged: (handler: (settings: RendererLightingSettings) => void) => void;
  getLightMoveStep: () => number;
  getSceneName: () => string;
  setSceneName: (name: string) => void;
  getSceneSlotName: () => string;
  setSceneSlotName: (name: string) => void;
  setSceneSlotNames: (names: string[], selected?: string | null) => void;
  getSelectedSceneSlotName: () => string | null;
  onSaveSceneFileRequested: (handler: () => void) => void;
  onLoadSceneFileRequested: (handler: (file: File) => void) => void;
  onSaveSceneSlotRequested: (handler: (slotName: string) => void) => void;
  onLoadSceneSlotRequested: (handler: (slotName: string) => void) => void;
  onDeleteSceneSlotRequested: (handler: (slotName: string) => void) => void;
  setMissingSplatPrompt: (ref: SceneSplatRefV1 | null) => void;
  onPickMissingSplatRequested: (handler: () => void) => void;
  onProxyFileRequested: (handler: (file: File) => void) => void;
  onRealignProxyRequested: (handler: () => void) => void;
  isProxyFlipUpDownEnabled: () => boolean;
  setProxyFlipUpDownEnabled: (enabled: boolean) => void;
  onProxyFlipUpDownChanged: (handler: (enabled: boolean) => void) => void;
  isProxyMirrorXEnabled: () => boolean;
  setProxyMirrorXEnabled: (enabled: boolean) => void;
  onProxyMirrorXChanged: (handler: (enabled: boolean) => void) => void;
  isProxyMirrorZEnabled: () => boolean;
  setProxyMirrorZEnabled: (enabled: boolean) => void;
  onProxyMirrorZChanged: (handler: (enabled: boolean) => void) => void;
  isProxyEditModeEnabled: () => boolean;
  setProxyEditModeEnabled: (enabled: boolean) => void;
  onProxyEditModeChanged: (handler: (enabled: boolean) => void) => void;
  getProxyGizmoMode: () => 'translate' | 'rotate' | 'scale';
  setProxyGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  onProxyGizmoModeChanged: (handler: (mode: 'translate' | 'rotate' | 'scale') => void) => void;
  onResetProxyTransformRequested: (handler: () => void) => void;
  isCollisionEnabled: () => boolean;
  setCollisionEnabled: (enabled: boolean) => void;
  onCollisionEnabledChanged: (handler: (enabled: boolean) => void) => void;
  isShowProxyMeshEnabled: () => boolean;
  setShowProxyMeshEnabled: (enabled: boolean) => void;
  onShowProxyMeshChanged: (handler: (enabled: boolean) => void) => void;
  onGenerateVoxelRequested: (handler: () => void) => void;
  onExportVoxelGlbRequested: (handler: () => void) => void;
  getVoxelResolution: () => number;
  getVoxelDensity: () => number;
  isVoxelEditMode: () => boolean;
  setVoxelEditMode: (enabled: boolean) => void;
  onVoxelEditModeChanged: (handler: (enabled: boolean) => void) => void;
  onVoxelDeleteRequested: (handler: () => void) => void;
  onVoxelUndoRequested: (handler: () => void) => void;
  setVoxelSelectionCount: (count: number) => void;
  setOutlinerItems: (items: OutlinerItem[]) => void;
  setSelectedOutlinerItem: (id: string | null) => void;
  onOutlinerSelected: (handler: (id: string) => void) => void;
  onOutlinerVisibilityChanged: (handler: (id: string, visible: boolean) => void) => void;
  onOutlinerParentChanged: (handler: (id: string, parentId: string | null) => void) => void;
  isOutlinerEditModeEnabled: () => boolean;
  setOutlinerEditModeEnabled: (enabled: boolean) => void;
  onOutlinerEditModeChanged: (handler: (enabled: boolean) => void) => void;
  getOutlinerGizmoMode: () => 'translate' | 'rotate' | 'scale';
  setOutlinerGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  onOutlinerGizmoModeChanged: (handler: (mode: 'translate' | 'rotate' | 'scale') => void) => void;
  onOutlinerFocusRequested: (handler: () => void) => void;
  onExportSceneGlbRequested: (handler: () => void) => void;

  // Compatibility wrappers used by older call sites.
  isLightGizmoModeEnabled: () => boolean;
  setLightGizmoModeEnabled: (enabled: boolean) => void;
  onLightGizmoModeChanged: (handler: (enabled: boolean) => void) => void;
}

function requiredElement<T extends Element>(id: string, typeName: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} element in DOM.`);
  }

  if (element.constructor.name !== typeName && !(element instanceof (globalThis as any)[typeName])) {
    throw new Error(`Element #${id} is not a ${typeName}.`);
  }

  return element as unknown as T;
}

function getDom(): PanelDom {
  return {
    panel: requiredElement<HTMLElement>('panel', 'HTMLDivElement'),
    hidePanelButton: requiredElement<HTMLButtonElement>('hide-panel-btn', 'HTMLButtonElement'),
    showPanelButton: requiredElement<HTMLButtonElement>('show-panel-btn', 'HTMLButtonElement'),
    fileInput: requiredElement<HTMLInputElement>('file-input', 'HTMLInputElement'),
    loadMode: requiredElement<HTMLSelectElement>('load-mode', 'HTMLSelectElement'),
    loadButton: requiredElement<HTMLButtonElement>('load-btn', 'HTMLButtonElement'),
    clearButton: requiredElement<HTMLButtonElement>('clear-btn', 'HTMLButtonElement'),
    lodScale: requiredElement<HTMLInputElement>('lod-scale', 'HTMLInputElement'),
    lodCount: requiredElement<HTMLInputElement>('lod-count', 'HTMLInputElement'),
    qualityImproved: requiredElement<HTMLInputElement>('quality-improved', 'HTMLInputElement'),
    qualityMaxDetail: requiredElement<HTMLInputElement>('quality-max-detail', 'HTMLInputElement'),
    flipUpDown: requiredElement<HTMLInputElement>('flip-updown', 'HTMLInputElement'),
    flipLeftRight: requiredElement<HTMLInputElement>('flip-leftright', 'HTMLInputElement'),
    status: requiredElement<HTMLElement>('status', 'HTMLElement'),
    newLightType: requiredElement<HTMLSelectElement>('new-light-type', 'HTMLSelectElement'),
    addLightButton: requiredElement<HTMLButtonElement>('add-light-btn', 'HTMLButtonElement'),
    lightEditMode: requiredElement<HTMLInputElement>('light-edit-mode', 'HTMLInputElement'),
    showLightHelpers: requiredElement<HTMLInputElement>('show-light-helpers', 'HTMLInputElement'),
    showLightGizmos: requiredElement<HTMLInputElement>('show-light-gizmos', 'HTMLInputElement'),
    showMovementControls: requiredElement<HTMLInputElement>('show-movement-controls', 'HTMLInputElement'),
    showLightingProbes: requiredElement<HTMLInputElement>('show-lighting-probes', 'HTMLInputElement'),
    lightGizmoSubmode: requiredElement<HTMLSelectElement>('light-gizmo-submode', 'HTMLSelectElement'),
    lightMoveStep: requiredElement<HTMLInputElement>('light-move-step', 'HTMLInputElement'),
    physicallyCorrectLights: requiredElement<HTMLInputElement>('physically-correct-lights', 'HTMLInputElement'),
    shadowsEnabled: requiredElement<HTMLInputElement>('shadows-enabled', 'HTMLInputElement'),
    toneMapping: requiredElement<HTMLSelectElement>('tone-mapping', 'HTMLSelectElement'),
    toneMappingExposure: requiredElement<HTMLInputElement>('tone-mapping-exposure', 'HTMLInputElement'),
    lightList: requiredElement<HTMLElement>('light-list', 'HTMLDivElement'),
    sceneName: requiredElement<HTMLInputElement>('scene-name', 'HTMLInputElement'),
    saveSceneFileButton: requiredElement<HTMLButtonElement>('save-scene-file-btn', 'HTMLButtonElement'),
    openSceneFileButton: requiredElement<HTMLButtonElement>('open-scene-file-btn', 'HTMLButtonElement'),
    loadSceneFileInput: requiredElement<HTMLInputElement>('load-scene-file-input', 'HTMLInputElement'),
    sceneSlotName: requiredElement<HTMLInputElement>('scene-slot-name', 'HTMLInputElement'),
    saveSceneSlotButton: requiredElement<HTMLButtonElement>('save-scene-slot-btn', 'HTMLButtonElement'),
    sceneSlotSelect: requiredElement<HTMLSelectElement>('scene-slot-select', 'HTMLSelectElement'),
    loadSceneSlotButton: requiredElement<HTMLButtonElement>('load-scene-slot-btn', 'HTMLButtonElement'),
    deleteSceneSlotButton: requiredElement<HTMLButtonElement>('delete-scene-slot-btn', 'HTMLButtonElement'),
    missingSplatPrompt: requiredElement<HTMLElement>('missing-splat-prompt', 'HTMLDivElement'),
    missingSplatText: requiredElement<HTMLElement>('missing-splat-text', 'HTMLParagraphElement'),
    pickMissingSplatButton: requiredElement<HTMLButtonElement>('pick-missing-splat-btn', 'HTMLButtonElement'),
    proxyFileInput: requiredElement<HTMLInputElement>('proxy-file-input', 'HTMLInputElement'),
    realignProxyButton: requiredElement<HTMLButtonElement>('realign-proxy-btn', 'HTMLButtonElement'),
    proxyFlipUpDown: requiredElement<HTMLInputElement>('proxy-flip-updown', 'HTMLInputElement'),
    proxyMirrorX: requiredElement<HTMLInputElement>('proxy-mirror-x', 'HTMLInputElement'),
    proxyMirrorZ: requiredElement<HTMLInputElement>('proxy-mirror-z', 'HTMLInputElement'),
    proxyEditMode: requiredElement<HTMLInputElement>('proxy-edit-mode', 'HTMLInputElement'),
    proxyGizmoMode: requiredElement<HTMLSelectElement>('proxy-gizmo-mode', 'HTMLSelectElement'),
    resetProxyTransformButton: requiredElement<HTMLButtonElement>('reset-proxy-transform-btn', 'HTMLButtonElement'),
    collisionEnabled: requiredElement<HTMLInputElement>('collision-enabled', 'HTMLInputElement'),
    showProxyMesh: requiredElement<HTMLInputElement>('show-proxy-mesh', 'HTMLInputElement'),
    generateVoxelButton: requiredElement<HTMLButtonElement>('generate-voxel-btn', 'HTMLButtonElement'),
    voxelResolution: requiredElement<HTMLInputElement>('voxel-resolution', 'HTMLInputElement'),
    voxelDensity: requiredElement<HTMLInputElement>('voxel-density', 'HTMLInputElement'),
    voxelEditMode: requiredElement<HTMLInputElement>('voxel-edit-mode', 'HTMLInputElement'),
    voxelEditControls: requiredElement<HTMLElement>('voxel-edit-controls', 'HTMLDivElement'),
    voxelSelectionCount: requiredElement<HTMLElement>('voxel-selection-count', 'HTMLSpanElement'),
    voxelDeleteButton: requiredElement<HTMLButtonElement>('voxel-delete-btn', 'HTMLButtonElement'),
    voxelUndoButton: requiredElement<HTMLButtonElement>('voxel-undo-btn', 'HTMLButtonElement'),
    exportVoxelGlbButton: requiredElement<HTMLButtonElement>('export-voxel-glb-btn', 'HTMLButtonElement'),
    outlinerEditMode: requiredElement<HTMLInputElement>('outliner-edit-mode', 'HTMLInputElement'),
    outlinerGizmoMode: requiredElement<HTMLSelectElement>('outliner-gizmo-mode', 'HTMLSelectElement'),
    outlinerSearch: requiredElement<HTMLInputElement>('outliner-search', 'HTMLInputElement'),
    outlinerFocusButton: requiredElement<HTMLButtonElement>('outliner-focus-btn', 'HTMLButtonElement'),
    exportSceneGlbButton: requiredElement<HTMLButtonElement>('export-scene-glb-btn', 'HTMLButtonElement'),
    outlinerList: requiredElement<HTMLElement>('outliner-list', 'HTMLDivElement')
  };
}

function asNumber(input: HTMLInputElement, fallback: number): number {
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function createNumberInput(value: number, step = '0.1', min?: string, max?: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = Number.isFinite(value) ? String(value) : '0';
  input.step = step;
  if (min != null) {
    input.min = min;
  }
  if (max != null) {
    input.max = max;
  }
  return input;
}

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement || target instanceof HTMLLabelElement;
}

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

export function createPanel(): ControlPanel {
  const dom = getDom();

  const setPanelVisibility = (visible: boolean): void => {
    dom.panel.hidden = !visible;
    dom.showPanelButton.hidden = visible;
  };

  dom.hidePanelButton.addEventListener('click', () => {
    setPanelVisibility(false);
  });

  dom.showPanelButton.addEventListener('click', () => {
    setPanelVisibility(true);
  });

  let addLightHandler: (type: SceneLightType) => void = () => { };
  let lightChangedHandler: (light: SceneLightV2) => void = () => { };
  let lightRemovedHandler: (id: string) => void = () => { };
  let lightSelectedHandler: (id: string) => void = () => { };
  let lightFocusHandler: (id: string) => void = () => { };
  let lightGizmoRequestedHandler: (id: string) => void = () => { };
  let saveSceneFileHandler: () => void = () => { };
  let loadSceneFileHandler: (file: File) => void = () => { };
  let saveSceneSlotHandler: (slotName: string) => void = () => { };
  let loadSceneSlotHandler: (slotName: string) => void = () => { };
  let deleteSceneSlotHandler: (slotName: string) => void = () => { };
  let missingSplatPickHandler: () => void = () => { };
  let lightHelpersChangedHandler: (enabled: boolean) => void = () => { };
  let lightEditModeChangedHandler: (enabled: boolean) => void = () => { };
  let lightGizmosChangedHandler: (enabled: boolean) => void = () => { };
  let movementControlsChangedHandler: (enabled: boolean) => void = () => { };
  let lightingProbesChangedHandler: (enabled: boolean) => void = () => { };
  let collisionEnabledChangedHandler: (enabled: boolean) => void = () => { };
  let showProxyMeshChangedHandler: (enabled: boolean) => void = () => { };
  let proxyFileRequestedHandler: (file: File) => void = () => { };
  let realignProxyRequestedHandler: () => void = () => { };
  let proxyFlipUpDownChangedHandler: (enabled: boolean) => void = () => { };
  let proxyMirrorXChangedHandler: (enabled: boolean) => void = () => { };
  let proxyMirrorZChangedHandler: (enabled: boolean) => void = () => { };
  let proxyEditModeChangedHandler: (enabled: boolean) => void = () => { };
  let proxyGizmoModeChangedHandler: (mode: 'translate' | 'rotate' | 'scale') => void = () => { };
  let resetProxyTransformRequestedHandler: () => void = () => { };
  let generateVoxelHandler: () => void = () => { };
  let exportVoxelGlbHandler: () => void = () => { };
  let voxelEditModeChangedHandler: (enabled: boolean) => void = () => { };
  let voxelDeleteHandler: () => void = () => { };
  let voxelUndoHandler: () => void = () => { };
  let outlinerSelectedHandler: (id: string) => void = () => { };
  let outlinerVisibilityChangedHandler: (id: string, visible: boolean) => void = () => { };
  let outlinerParentChangedHandler: (id: string, parentId: string | null) => void = () => { };
  let outlinerEditModeChangedHandler: (enabled: boolean) => void = () => { };
  let outlinerGizmoModeChangedHandler: (mode: 'translate' | 'rotate' | 'scale') => void = () => { };
  let outlinerFocusHandler: () => void = () => { };
  let exportSceneGlbHandler: () => void = () => { };
  let gizmoSubmodeChangedHandler: (submode: LightGizmoSubmode) => void = () => { };
  let rendererSettingsChangedHandler: (settings: RendererLightingSettings) => void = () => { };

  let renderedLights: SceneLightV2[] = [];
  let selectedLightId: string | null = null;
  let activeGizmoLightId: string | null = null;
  let renderedOutlinerItems: OutlinerItem[] = [];
  let selectedOutlinerId: string | null = null;

  const applyMovementControlsClass = (): void => {
    dom.panel.classList.toggle('movement-hidden', !dom.showMovementControls.checked);
  };

  const getMoveStep = (): number => {
    return Math.max(0.01, asNumber(dom.lightMoveStep, 0.5));
  };

  const getRendererLightingSettings = (): RendererLightingSettings => {
    const toneMappingRaw = dom.toneMapping.value;
    const toneMapping: SceneToneMapping =
      toneMappingRaw === 'Neutral' || toneMappingRaw === 'None' ? toneMappingRaw : 'ACESFilmic';

    return {
      physicallyCorrectLights: dom.physicallyCorrectLights.checked,
      toneMapping,
      toneMappingExposure: Math.max(0.05, asNumber(dom.toneMappingExposure, 1)),
      shadowsEnabled: dom.shadowsEnabled.checked
    };
  };

  const renderLightList = (): void => {
    dom.lightList.replaceChildren();
    if (renderedLights.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No lights in scene.';
      dom.lightList.append(empty);
      return;
    }

    for (const light of renderedLights) {
      const row = createLightRow(
        light,
        getMoveStep,
        (nextLight) => {
          lightChangedHandler(nextLight);
        },
        (id) => {
          lightRemovedHandler(id);
        },
        (id) => {
          lightSelectedHandler(id);
        },
        (id) => {
          lightFocusHandler(id);
        },
        (id) => {
          lightGizmoRequestedHandler(id);
        },
        selectedLightId === light.id,
        activeGizmoLightId === light.id
      );
      dom.lightList.append(row);
    }
  };

  const renderOutlinerList = (): void => {
    dom.outlinerList.replaceChildren();

    const query = dom.outlinerSearch.value.trim().toLowerCase();
    const allItems = query.length === 0
      ? renderedOutlinerItems
      : renderedOutlinerItems.filter((item) => item.label.toLowerCase().includes(query) || item.typeLabel.toLowerCase().includes(query));

    if (allItems.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = query ? 'No matching objects.' : 'No scene objects.';
      dom.outlinerList.append(empty);
      return;
    }

    const allById = new Map(renderedOutlinerItems.map((item) => [item.id, item]));
    const itemById = new Map(allItems.map((item) => [item.id, item]));
    const childrenByParent = new Map<string | null, OutlinerItem[]>();
    for (const item of allItems) {
      const parentId = item.parentId && itemById.has(item.parentId) ? item.parentId : null;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(item);
      childrenByParent.set(parentId, list);
    }

    const ordered: Array<{ item: OutlinerItem; depth: number }> = [];
    const visited = new Set<string>();

    const walk = (parentId: string | null, depth: number): void => {
      const children = childrenByParent.get(parentId) ?? [];
      for (const item of children) {
        if (visited.has(item.id)) {
          continue;
        }
        visited.add(item.id);
        ordered.push({ item, depth });
        walk(item.id, depth + 1);
      }
    };

    walk(null, 0);
    for (const item of allItems) {
      if (!visited.has(item.id)) {
        ordered.push({ item, depth: 0 });
      }
    }

    for (const { item, depth } of ordered) {
      const row = document.createElement('div');
      row.className = 'outliner-row';
      if (item.id === selectedOutlinerId) {
        row.classList.add('selected');
      }

      const visibility = document.createElement('input');
      visibility.type = 'checkbox';
      visibility.checked = item.visible;
      visibility.addEventListener('change', () => {
        outlinerVisibilityChangedHandler(item.id, visibility.checked);
      });

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'outliner-item-button';
      button.textContent = item.label;
      button.style.paddingLeft = `${8 + depth * 12}px`;
      button.addEventListener('click', () => {
        outlinerSelectedHandler(item.id);
      });

      const type = document.createElement('span');
      type.className = 'outliner-type';
      type.textContent = item.typeLabel;

      const parentSelect = document.createElement('select');
      parentSelect.className = 'outliner-parent';
      parentSelect.disabled = !item.canReparent;
      const rootOption = document.createElement('option');
      rootOption.value = '';
      rootOption.textContent = 'Root';
      parentSelect.append(rootOption);
      for (const candidate of renderedOutlinerItems) {
        if (candidate.id === item.id) {
          continue;
        }
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = candidate.label;
        if (candidate.id === item.parentId) {
          option.selected = true;
        }
        parentSelect.append(option);
      }
      if (item.parentId && !allById.has(item.parentId)) {
        parentSelect.value = '';
      }
      parentSelect.addEventListener('change', () => {
        const parentId = parentSelect.value.trim() || null;
        outlinerParentChangedHandler(item.id, parentId);
      });

      row.append(visibility, button, type, parentSelect);
      dom.outlinerList.append(row);
    }
  };

  applyMovementControlsClass();

  dom.addLightButton.addEventListener('click', () => {
    const rawType = dom.newLightType.value;
    if (rawType === 'ambient' || rawType === 'directional' || rawType === 'point' || rawType === 'spot') {
      addLightHandler(rawType);
    }
  });

  dom.saveSceneFileButton.addEventListener('click', () => {
    saveSceneFileHandler();
  });

  dom.openSceneFileButton.addEventListener('click', () => {
    dom.loadSceneFileInput.click();
  });

  dom.loadSceneFileInput.addEventListener('change', () => {
    const file = dom.loadSceneFileInput.files?.[0];
    if (file) {
      loadSceneFileHandler(file);
    }
    dom.loadSceneFileInput.value = '';
  });

  dom.saveSceneSlotButton.addEventListener('click', () => {
    saveSceneSlotHandler(dom.sceneSlotName.value.trim());
  });

  dom.loadSceneSlotButton.addEventListener('click', () => {
    const selected = dom.sceneSlotSelect.value.trim();
    if (selected) {
      loadSceneSlotHandler(selected);
    }
  });

  dom.deleteSceneSlotButton.addEventListener('click', () => {
    const selected = dom.sceneSlotSelect.value.trim();
    if (selected) {
      deleteSceneSlotHandler(selected);
    }
  });

  dom.pickMissingSplatButton.addEventListener('click', () => {
    missingSplatPickHandler();
  });

  dom.showLightHelpers.addEventListener('change', () => {
    lightHelpersChangedHandler(dom.showLightHelpers.checked);
  });

  dom.lightEditMode.addEventListener('change', () => {
    lightEditModeChangedHandler(dom.lightEditMode.checked);
  });

  dom.showLightGizmos.addEventListener('change', () => {
    lightGizmosChangedHandler(dom.showLightGizmos.checked);
  });

  dom.lightGizmoSubmode.addEventListener('change', () => {
    const value = dom.lightGizmoSubmode.value;
    gizmoSubmodeChangedHandler(value === 'target' ? 'target' : 'position');
  });

  dom.showMovementControls.addEventListener('change', () => {
    applyMovementControlsClass();
    movementControlsChangedHandler(dom.showMovementControls.checked);
  });

  dom.showLightingProbes.addEventListener('change', () => {
    lightingProbesChangedHandler(dom.showLightingProbes.checked);
  });

  dom.collisionEnabled.addEventListener('change', () => {
    collisionEnabledChangedHandler(dom.collisionEnabled.checked);
  });

  dom.showProxyMesh.addEventListener('change', () => {
    showProxyMeshChangedHandler(dom.showProxyMesh.checked);
  });

  dom.realignProxyButton.addEventListener('click', () => {
    realignProxyRequestedHandler();
  });

  dom.proxyFlipUpDown.addEventListener('change', () => {
    proxyFlipUpDownChangedHandler(dom.proxyFlipUpDown.checked);
  });

  dom.proxyMirrorX.addEventListener('change', () => {
    proxyMirrorXChangedHandler(dom.proxyMirrorX.checked);
  });

  dom.proxyMirrorZ.addEventListener('change', () => {
    proxyMirrorZChangedHandler(dom.proxyMirrorZ.checked);
  });

  dom.proxyEditMode.addEventListener('change', () => {
    proxyEditModeChangedHandler(dom.proxyEditMode.checked);
  });

  dom.proxyGizmoMode.addEventListener('change', () => {
    const value = dom.proxyGizmoMode.value;
    const mode = value === 'rotate' ? 'rotate' : value === 'scale' ? 'scale' : 'translate';
    proxyGizmoModeChangedHandler(mode);
  });

  dom.resetProxyTransformButton.addEventListener('click', () => {
    resetProxyTransformRequestedHandler();
  });

  dom.proxyFileInput.addEventListener('change', () => {
    const file = dom.proxyFileInput.files?.[0];
    if (file) {
      proxyFileRequestedHandler(file);
    }
  });

  dom.generateVoxelButton.addEventListener('click', () => {
    generateVoxelHandler();
  });

  dom.exportVoxelGlbButton.addEventListener('click', () => {
    exportVoxelGlbHandler();
  });

  dom.voxelEditMode.addEventListener('change', () => {
    const enabled = dom.voxelEditMode.checked;
    dom.voxelEditControls.style.display = enabled ? '' : 'none';
    voxelEditModeChangedHandler(enabled);
  });

  dom.voxelDeleteButton.addEventListener('click', () => {
    voxelDeleteHandler();
  });

  dom.voxelUndoButton.addEventListener('click', () => {
    voxelUndoHandler();
  });

  dom.outlinerEditMode.addEventListener('change', () => {
    outlinerEditModeChangedHandler(dom.outlinerEditMode.checked);
  });

  dom.outlinerGizmoMode.addEventListener('change', () => {
    const value = dom.outlinerGizmoMode.value;
    const mode = value === 'rotate' ? 'rotate' : value === 'scale' ? 'scale' : 'translate';
    outlinerGizmoModeChangedHandler(mode);
  });

  dom.outlinerSearch.addEventListener('input', () => {
    renderOutlinerList();
  });

  dom.outlinerFocusButton.addEventListener('click', () => {
    outlinerFocusHandler();
  });

  dom.exportSceneGlbButton.addEventListener('click', () => {
    exportSceneGlbHandler();
  });

  const rendererSettingsInputs: Array<HTMLInputElement | HTMLSelectElement> = [
    dom.physicallyCorrectLights,
    dom.shadowsEnabled,
    dom.toneMapping,
    dom.toneMappingExposure
  ];

  for (const input of rendererSettingsInputs) {
    input.addEventListener('change', () => {
      rendererSettingsChangedHandler(getRendererLightingSettings());
    });
    input.addEventListener('input', () => {
      rendererSettingsChangedHandler(getRendererLightingSettings());
    });
  }

  const setStatus = (message: string, kind: StatusKind = 'info'): void => {
    dom.status.textContent = message;
    dom.status.className = kind;
  };

  return {
    getSelectedFile: (): File | null => dom.fileInput.files?.[0] ?? null,
    openSplatFilePicker: (): void => {
      dom.fileInput.click();
    },
    getLoadMode: (): LoadMode => (dom.loadMode.value === 'raw-ply' ? 'raw-ply' : 'spz'),
    setLoadMode: (mode: LoadMode): void => {
      dom.loadMode.value = mode;
    },
    setStatus,
    setLoading: (loading: boolean): void => {
      dom.loadButton.disabled = loading;
      dom.clearButton.disabled = loading;
      dom.fileInput.disabled = loading;
      dom.loadMode.disabled = loading;
      dom.generateVoxelButton.disabled = loading;
      dom.exportVoxelGlbButton.disabled = loading;
      dom.exportSceneGlbButton.disabled = loading;
    },
    confirmRawPly: async (file: File): Promise<boolean> => {
      const sizeGb = file.size / (1024 * 1024 * 1024);
      const warning = [
        `Raw PLY load requested for ${file.name}.`,
        `Estimated file size: ${sizeGb.toFixed(2)} GB.`,
        'This can trigger heavy CPU, memory pressure, browser stalls, or a tab crash.',
        'Continue with raw PLY loading?'
      ].join('\n');

      return window.confirm(warning);
    },
    onLoadRequested: (handler: () => void): void => {
      dom.loadButton.addEventListener('click', () => handler());
    },
    onClearRequested: (handler: () => void): void => {
      dom.clearButton.addEventListener('click', () => handler());
    },
    onLodScaleChanged: (handler: (value: number) => void): void => {
      dom.lodScale.addEventListener('change', () => {
        handler(Number(dom.lodScale.value));
      });
    },
    onLodCountChanged: (handler: (value: number) => void): void => {
      dom.lodCount.addEventListener('change', () => {
        handler(Number(dom.lodCount.value));
      });
    },
    getLodScaleValue: (): number => Number(dom.lodScale.value),
    getLodCountValue: (): number => Number(dom.lodCount.value),
    setLodScaleValue: (value: number): void => {
      dom.lodScale.value = value.toString();
    },
    setLodCountValue: (value: number): void => {
      dom.lodCount.value = Math.floor(value).toString();
    },
    isImprovedQualityEnabled: (): boolean => dom.qualityImproved.checked,
    setImprovedQualityEnabled: (enabled: boolean): void => {
      dom.qualityImproved.checked = enabled;
    },
    onImprovedQualityChanged: (handler: (enabled: boolean) => void): void => {
      dom.qualityImproved.addEventListener('change', () => {
        handler(dom.qualityImproved.checked);
      });
    },
    isMaxDetailEnabled: (): boolean => dom.qualityMaxDetail.checked,
    setMaxDetailEnabled: (enabled: boolean): void => {
      dom.qualityMaxDetail.checked = enabled;
    },
    onMaxDetailChanged: (handler: (enabled: boolean) => void): void => {
      dom.qualityMaxDetail.addEventListener('change', () => {
        handler(dom.qualityMaxDetail.checked);
      });
    },
    isFlipUpDownEnabled: (): boolean => dom.flipUpDown.checked,
    setFlipUpDownEnabled: (enabled: boolean): void => {
      dom.flipUpDown.checked = enabled;
    },
    isFlipLeftRightEnabled: (): boolean => dom.flipLeftRight.checked,
    setFlipLeftRightEnabled: (enabled: boolean): void => {
      dom.flipLeftRight.checked = enabled;
    },
    onFlipUpDownChanged: (handler: (enabled: boolean) => void): void => {
      dom.flipUpDown.addEventListener('change', () => {
        handler(dom.flipUpDown.checked);
      });
    },
    onFlipLeftRightChanged: (handler: (enabled: boolean) => void): void => {
      dom.flipLeftRight.addEventListener('change', () => {
        handler(dom.flipLeftRight.checked);
      });
    },
    setLightList: (lights: SceneLightV2[]): void => {
      renderedLights = [...lights];
      if (selectedLightId && !renderedLights.some((light) => light.id === selectedLightId)) {
        selectedLightId = null;
      }
      if (activeGizmoLightId && !renderedLights.some((light) => light.id === activeGizmoLightId)) {
        activeGizmoLightId = null;
      }
      renderLightList();
    },
    onAddLightRequested: (handler: (type: SceneLightType) => void): void => {
      addLightHandler = handler;
    },
    onLightChanged: (handler: (light: SceneLightV2) => void): void => {
      lightChangedHandler = handler;
    },
    onLightRemoved: (handler: (id: string) => void): void => {
      lightRemovedHandler = handler;
    },
    onLightSelected: (handler: (id: string) => void): void => {
      lightSelectedHandler = handler;
    },
    onLightFocusRequested: (handler: (id: string) => void): void => {
      lightFocusHandler = handler;
    },
    onLightGizmoRequested: (handler: (id: string) => void): void => {
      lightGizmoRequestedHandler = handler;
    },
    setSelectedLight: (id: string | null): void => {
      selectedLightId = id;
      renderLightList();
    },
    setActiveGizmoLight: (id: string | null): void => {
      activeGizmoLightId = id;
      renderLightList();
    },
    getLightGizmoSubmode: (): LightGizmoSubmode => (dom.lightGizmoSubmode.value === 'target' ? 'target' : 'position'),
    setLightGizmoSubmode: (submode: LightGizmoSubmode): void => {
      dom.lightGizmoSubmode.value = submode;
    },
    onLightGizmoSubmodeChanged: (handler: (submode: LightGizmoSubmode) => void): void => {
      gizmoSubmodeChangedHandler = handler;
    },
    isLightHelpersEnabled: (): boolean => dom.showLightHelpers.checked,
    setLightHelpersEnabled: (enabled: boolean): void => {
      dom.showLightHelpers.checked = enabled;
    },
    onLightHelpersChanged: (handler: (enabled: boolean) => void): void => {
      lightHelpersChangedHandler = handler;
    },
    isLightEditModeEnabled: (): boolean => dom.lightEditMode.checked,
    setLightEditModeEnabled: (enabled: boolean): void => {
      dom.lightEditMode.checked = enabled;
    },
    onLightEditModeChanged: (handler: (enabled: boolean) => void): void => {
      lightEditModeChangedHandler = handler;
    },
    isLightGizmosEnabled: (): boolean => dom.showLightGizmos.checked,
    setLightGizmosEnabled: (enabled: boolean): void => {
      dom.showLightGizmos.checked = enabled;
    },
    onLightGizmosChanged: (handler: (enabled: boolean) => void): void => {
      lightGizmosChangedHandler = handler;
    },
    isMovementControlsEnabled: (): boolean => dom.showMovementControls.checked,
    setMovementControlsEnabled: (enabled: boolean): void => {
      dom.showMovementControls.checked = enabled;
      applyMovementControlsClass();
    },
    onMovementControlsChanged: (handler: (enabled: boolean) => void): void => {
      movementControlsChangedHandler = handler;
    },
    isLightingProbeEnabled: (): boolean => dom.showLightingProbes.checked,
    setLightingProbeEnabled: (enabled: boolean): void => {
      dom.showLightingProbes.checked = enabled;
    },
    onLightingProbeToggled: (handler: (enabled: boolean) => void): void => {
      lightingProbesChangedHandler = handler;
    },
    getRendererLightingSettings,
    setRendererLightingSettings: (settings: RendererLightingSettings): void => {
      dom.physicallyCorrectLights.checked = settings.physicallyCorrectLights;
      dom.toneMapping.value = settings.toneMapping;
      dom.toneMappingExposure.value = settings.toneMappingExposure.toString();
      dom.shadowsEnabled.checked = settings.shadowsEnabled;
    },
    onRendererLightingSettingsChanged: (handler: (settings: RendererLightingSettings) => void): void => {
      rendererSettingsChangedHandler = handler;
    },
    getLightMoveStep: (): number => getMoveStep(),
    getSceneName: (): string => dom.sceneName.value.trim(),
    setSceneName: (name: string): void => {
      dom.sceneName.value = name;
    },
    getSceneSlotName: (): string => dom.sceneSlotName.value.trim(),
    setSceneSlotName: (name: string): void => {
      dom.sceneSlotName.value = name;
    },
    setSceneSlotNames: (names: string[], selected?: string | null): void => {
      const current = selected ?? dom.sceneSlotSelect.value;
      dom.sceneSlotSelect.replaceChildren();

      if (names.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No saved slots';
        dom.sceneSlotSelect.append(emptyOption);
        dom.sceneSlotSelect.value = '';
        return;
      }

      for (const name of names) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        dom.sceneSlotSelect.append(option);
      }

      if (current && names.includes(current)) {
        dom.sceneSlotSelect.value = current;
      } else {
        dom.sceneSlotSelect.value = names[0];
      }
    },
    getSelectedSceneSlotName: (): string | null => {
      const selected = dom.sceneSlotSelect.value.trim();
      return selected || null;
    },
    onSaveSceneFileRequested: (handler: () => void): void => {
      saveSceneFileHandler = handler;
    },
    onLoadSceneFileRequested: (handler: (file: File) => void): void => {
      loadSceneFileHandler = handler;
    },
    onSaveSceneSlotRequested: (handler: (slotName: string) => void): void => {
      saveSceneSlotHandler = handler;
    },
    onLoadSceneSlotRequested: (handler: (slotName: string) => void): void => {
      loadSceneSlotHandler = handler;
    },
    onDeleteSceneSlotRequested: (handler: (slotName: string) => void): void => {
      deleteSceneSlotHandler = handler;
    },
    setMissingSplatPrompt: (ref: SceneSplatRefV1 | null): void => {
      if (!ref) {
        dom.missingSplatPrompt.hidden = true;
        dom.missingSplatText.textContent = '';
        return;
      }

      dom.missingSplatText.textContent = `Scene references splat "${ref.name}" (${ref.ext}). Select that file and click Load file.`;
      dom.missingSplatPrompt.hidden = false;
    },
    onPickMissingSplatRequested: (handler: () => void): void => {
      missingSplatPickHandler = handler;
    },
    onProxyFileRequested: (handler: (file: File) => void): void => {
      proxyFileRequestedHandler = handler;
    },
    onRealignProxyRequested: (handler: () => void): void => {
      realignProxyRequestedHandler = handler;
    },
    isProxyFlipUpDownEnabled: (): boolean => dom.proxyFlipUpDown.checked,
    setProxyFlipUpDownEnabled: (enabled: boolean): void => {
      dom.proxyFlipUpDown.checked = enabled;
    },
    onProxyFlipUpDownChanged: (handler: (enabled: boolean) => void): void => {
      proxyFlipUpDownChangedHandler = handler;
    },
    isProxyMirrorXEnabled: (): boolean => dom.proxyMirrorX.checked,
    setProxyMirrorXEnabled: (enabled: boolean): void => {
      dom.proxyMirrorX.checked = enabled;
    },
    onProxyMirrorXChanged: (handler: (enabled: boolean) => void): void => {
      proxyMirrorXChangedHandler = handler;
    },
    isProxyMirrorZEnabled: (): boolean => dom.proxyMirrorZ.checked,
    setProxyMirrorZEnabled: (enabled: boolean): void => {
      dom.proxyMirrorZ.checked = enabled;
    },
    onProxyMirrorZChanged: (handler: (enabled: boolean) => void): void => {
      proxyMirrorZChangedHandler = handler;
    },
    isProxyEditModeEnabled: (): boolean => dom.proxyEditMode.checked,
    setProxyEditModeEnabled: (enabled: boolean): void => {
      dom.proxyEditMode.checked = enabled;
    },
    onProxyEditModeChanged: (handler: (enabled: boolean) => void): void => {
      proxyEditModeChangedHandler = handler;
    },
    getProxyGizmoMode: (): 'translate' | 'rotate' | 'scale' => {
      const value = dom.proxyGizmoMode.value;
      return value === 'rotate' ? 'rotate' : value === 'scale' ? 'scale' : 'translate';
    },
    setProxyGizmoMode: (mode: 'translate' | 'rotate' | 'scale'): void => {
      dom.proxyGizmoMode.value = mode;
    },
    onProxyGizmoModeChanged: (handler: (mode: 'translate' | 'rotate' | 'scale') => void): void => {
      proxyGizmoModeChangedHandler = handler;
    },
    onResetProxyTransformRequested: (handler: () => void): void => {
      resetProxyTransformRequestedHandler = handler;
    },
    isCollisionEnabled: (): boolean => dom.collisionEnabled.checked,
    setCollisionEnabled: (enabled: boolean): void => {
      dom.collisionEnabled.checked = enabled;
    },
    onCollisionEnabledChanged: (handler: (enabled: boolean) => void): void => {
      collisionEnabledChangedHandler = handler;
    },
    isShowProxyMeshEnabled: (): boolean => dom.showProxyMesh.checked,
    setShowProxyMeshEnabled: (enabled: boolean): void => {
      dom.showProxyMesh.checked = enabled;
    },
    onShowProxyMeshChanged: (handler: (enabled: boolean) => void): void => {
      showProxyMeshChangedHandler = handler;
    },
    onGenerateVoxelRequested: (handler: () => void): void => {
      generateVoxelHandler = handler;
    },
    onExportVoxelGlbRequested: (handler: () => void): void => {
      exportVoxelGlbHandler = handler;
    },
    getVoxelResolution: (): number => Math.max(0.1, asNumber(dom.voxelResolution, 0.5)),
    getVoxelDensity: (): number => Math.max(1, asNumber(dom.voxelDensity, 5)),
    isVoxelEditMode: (): boolean => dom.voxelEditMode.checked,
    setVoxelEditMode: (enabled: boolean): void => {
      dom.voxelEditMode.checked = enabled;
      dom.voxelEditControls.style.display = enabled ? '' : 'none';
    },
    onVoxelEditModeChanged: (handler: (enabled: boolean) => void): void => {
      voxelEditModeChangedHandler = handler;
    },
    onVoxelDeleteRequested: (handler: () => void): void => {
      voxelDeleteHandler = handler;
    },
    onVoxelUndoRequested: (handler: () => void): void => {
      voxelUndoHandler = handler;
    },
    setVoxelSelectionCount: (count: number): void => {
      dom.voxelSelectionCount.textContent = `${count} selected`;
    },
    setOutlinerItems: (items: OutlinerItem[]): void => {
      renderedOutlinerItems = [...items];
      renderOutlinerList();
    },
    setSelectedOutlinerItem: (id: string | null): void => {
      selectedOutlinerId = id;
      renderOutlinerList();
    },
    onOutlinerSelected: (handler: (id: string) => void): void => {
      outlinerSelectedHandler = handler;
    },
    onOutlinerVisibilityChanged: (handler: (id: string, visible: boolean) => void): void => {
      outlinerVisibilityChangedHandler = handler;
    },
    onOutlinerParentChanged: (handler: (id: string, parentId: string | null) => void): void => {
      outlinerParentChangedHandler = handler;
    },
    isOutlinerEditModeEnabled: (): boolean => dom.outlinerEditMode.checked,
    setOutlinerEditModeEnabled: (enabled: boolean): void => {
      dom.outlinerEditMode.checked = enabled;
    },
    onOutlinerEditModeChanged: (handler: (enabled: boolean) => void): void => {
      outlinerEditModeChangedHandler = handler;
    },
    getOutlinerGizmoMode: (): 'translate' | 'rotate' | 'scale' => {
      const value = dom.outlinerGizmoMode.value;
      return value === 'rotate' ? 'rotate' : value === 'scale' ? 'scale' : 'translate';
    },
    setOutlinerGizmoMode: (mode: 'translate' | 'rotate' | 'scale'): void => {
      dom.outlinerGizmoMode.value = mode;
    },
    onOutlinerGizmoModeChanged: (handler: (mode: 'translate' | 'rotate' | 'scale') => void): void => {
      outlinerGizmoModeChangedHandler = handler;
    },
    onOutlinerFocusRequested: (handler: () => void): void => {
      outlinerFocusHandler = handler;
    },
    onExportSceneGlbRequested: (handler: () => void): void => {
      exportSceneGlbHandler = handler;
    },
    isLightGizmoModeEnabled: (): boolean => dom.lightEditMode.checked,
    setLightGizmoModeEnabled: (enabled: boolean): void => {
      dom.lightEditMode.checked = enabled;
    },
    onLightGizmoModeChanged: (handler: (enabled: boolean) => void): void => {
      lightEditModeChangedHandler = handler;
    }
  };
}
