import * as THREE from 'three';
import {
  createDefaultSceneSettings,
  DEFAULT_LIGHT_SHADOW_BIAS,
  DEFAULT_LIGHT_SHADOW_MAP_SIZE,
  DEFAULT_LIGHT_SHADOW_NORMAL_BIAS,
  type SceneAmbientLightV2,
  type SceneDirectionalLightV2,
  type SceneLightType,
  type SceneLightV2,
  type ScenePointLightV2,
  type SceneSettingsV2,
  type SceneSpotLightV2
} from '../scene/sceneState';

export const DEFAULT_AMBIENT_LIGHT_ID = 'default-ambient';
export const DEFAULT_KEY_LIGHT_ID = 'default-key';

export type SupportedThreeLight =
  | THREE.AmbientLight
  | THREE.DirectionalLight
  | THREE.PointLight
  | THREE.SpotLight;

export type LightGizmoSubmode = 'position' | 'target';

export interface LightRuntimeNode {
  id: string;
  type: SceneLightType;
  light: SupportedThreeLight;
  targetObject: THREE.Object3D | null;
}

export interface LightReconcileState {
  nodes: Map<string, LightRuntimeNode>;
  helperObjects: Map<string, THREE.Object3D>;
  positionMarker: THREE.Mesh;
  targetMarker: THREE.Mesh;
}

interface ReconcileOptions {
  showHelpers: boolean;
  selectedLightId: string | null;
  selectedSubmode: LightGizmoSubmode;
  shadowsEnabled: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getAdaptiveSnapForDistance(distance: number): number {
  if (distance < 5) {
    return 0.1;
  }
  if (distance <= 30) {
    return 0.5;
  }
  return 2;
}

export function generateLightId(type: SceneLightType): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${type}-${randomPart}`;
}

function normalizeColor(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase();
  }

  return '#ffffff';
}

function sceneLightName(type: SceneLightType, index = 1): string {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return `${label} ${index}`;
}

function createShadowDefaults(type: 'directional' | 'point' | 'spot') {
  return {
    castShadow: type === 'directional' || type === 'spot',
    shadowMapSize: DEFAULT_LIGHT_SHADOW_MAP_SIZE,
    shadowBias: DEFAULT_LIGHT_SHADOW_BIAS,
    shadowNormalBias: DEFAULT_LIGHT_SHADOW_NORMAL_BIAS
  };
}

export function createDefaultSceneLight(
  type: SceneLightType,
  id = generateLightId(type),
  index = 1
): SceneLightV2 {
  if (type === 'ambient') {
    return {
      id,
      type,
      name: sceneLightName(type, index),
      enabled: true,
      color: '#ffffff',
      intensity: 0.5
    };
  }

  if (type === 'directional') {
    return {
      id,
      type,
      name: sceneLightName(type, index),
      enabled: true,
      color: '#ffffff',
      intensity: 3,
      position: [5, 8, 2],
      target: [0, 0, 0],
      ...createShadowDefaults('directional')
    };
  }

  if (type === 'point') {
    return {
      id,
      type,
      name: sceneLightName(type, index),
      enabled: true,
      color: '#ffffff',
      intensity: 80,
      position: [2, 3, 2],
      distance: 0,
      decay: 2,
      ...createShadowDefaults('point')
    };
  }

  return {
    id,
    type,
    name: sceneLightName(type, index),
    enabled: true,
    color: '#ffffff',
    intensity: 75,
    position: [2, 3, 2],
    target: [0, 0, 0],
    distance: 0,
    decay: 2,
    angle: Math.PI / 6,
    penumbra: 0.2,
    ...createShadowDefaults('spot')
  };
}

function applyBase(light: SupportedThreeLight, sceneLight: SceneLightV2): void {
  light.visible = sceneLight.enabled;
  light.intensity = sceneLight.intensity;
  light.color.set(sceneLight.color);
  light.userData.sceneLightId = sceneLight.id;
  light.userData.sceneLightType = sceneLight.type;
  light.userData.sceneLightName = sceneLight.name;
}

function applyShadowSettings(light: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight, sceneLight: SceneLightV2, shadowsEnabled: boolean): void {
  if (sceneLight.type === 'ambient') {
    return;
  }

  light.castShadow = shadowsEnabled && sceneLight.castShadow;
  light.shadow.mapSize.width = sceneLight.shadowMapSize;
  light.shadow.mapSize.height = sceneLight.shadowMapSize;
  light.shadow.bias = sceneLight.shadowBias;
  light.shadow.normalBias = sceneLight.shadowNormalBias;
  light.shadow.needsUpdate = true;
}

function createLightNode(sceneLight: SceneLightV2, shadowsEnabled = true): LightRuntimeNode {
  if (sceneLight.type === 'ambient') {
    const light = new THREE.AmbientLight(0xffffff, sceneLight.intensity);
    applyBase(light, sceneLight);
    return {
      id: sceneLight.id,
      type: sceneLight.type,
      light,
      targetObject: null
    };
  }

  if (sceneLight.type === 'directional') {
    const light = new THREE.DirectionalLight(0xffffff, sceneLight.intensity);
    const targetObject = new THREE.Object3D();
    targetObject.name = `${sceneLight.name}-target`;
    targetObject.userData.sceneLightId = sceneLight.id;
    targetObject.userData.sceneLightRole = 'target';
    light.target = targetObject;

    applyBase(light, sceneLight);
    light.position.set(...sceneLight.position);
    targetObject.position.set(...sceneLight.target);
    applyShadowSettings(light, sceneLight, shadowsEnabled);

    return {
      id: sceneLight.id,
      type: sceneLight.type,
      light,
      targetObject
    };
  }

  if (sceneLight.type === 'point') {
    const light = new THREE.PointLight(0xffffff, sceneLight.intensity, sceneLight.distance, sceneLight.decay);
    applyBase(light, sceneLight);
    light.position.set(...sceneLight.position);
    applyShadowSettings(light, sceneLight, shadowsEnabled);

    return {
      id: sceneLight.id,
      type: sceneLight.type,
      light,
      targetObject: null
    };
  }

  const light = new THREE.SpotLight(
    0xffffff,
    sceneLight.intensity,
    sceneLight.distance,
    sceneLight.angle,
    sceneLight.penumbra,
    sceneLight.decay
  );
  const targetObject = new THREE.Object3D();
  targetObject.name = `${sceneLight.name}-target`;
  targetObject.userData.sceneLightId = sceneLight.id;
  targetObject.userData.sceneLightRole = 'target';
  light.target = targetObject;

  applyBase(light, sceneLight);
  light.position.set(...sceneLight.position);
  targetObject.position.set(...sceneLight.target);
  applyShadowSettings(light, sceneLight, shadowsEnabled);

  return {
    id: sceneLight.id,
    type: sceneLight.type,
    light,
    targetObject
  };
}

function updateLightNode(node: LightRuntimeNode, sceneLight: SceneLightV2, shadowsEnabled: boolean): void {
  applyBase(node.light, sceneLight);

  if (sceneLight.type === 'ambient') {
    return;
  }

  node.light.position.set(...sceneLight.position);

  if (sceneLight.type === 'directional') {
    if (node.targetObject) {
      node.targetObject.position.set(...sceneLight.target);
    }
    if (node.light instanceof THREE.DirectionalLight) {
      applyShadowSettings(node.light, sceneLight, shadowsEnabled);
    }
    return;
  }

  if (sceneLight.type === 'point') {
    if (node.light instanceof THREE.PointLight) {
      node.light.distance = sceneLight.distance;
      node.light.decay = sceneLight.decay;
      applyShadowSettings(node.light, sceneLight, shadowsEnabled);
    }
    return;
  }

  if (node.targetObject) {
    node.targetObject.position.set(...sceneLight.target);
  }
  if (node.light instanceof THREE.SpotLight) {
    node.light.distance = sceneLight.distance;
    node.light.decay = sceneLight.decay;
    node.light.angle = sceneLight.angle;
    node.light.penumbra = sceneLight.penumbra;
    applyShadowSettings(node.light, sceneLight, shadowsEnabled);
  }
}

function disposeObject(object: THREE.Object3D): void {
  const disposable = object as THREE.Object3D & {
    geometry?: { dispose?: () => void };
    material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
    dispose?: () => void;
  };

  disposable.dispose?.();
  disposable.geometry?.dispose?.();
  if (Array.isArray(disposable.material)) {
    for (const material of disposable.material) {
      material.dispose?.();
    }
  } else {
    disposable.material?.dispose?.();
  }
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function createMarker(color: number, position: THREE.Vector3, size = 0.1): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(size, 12, 10),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.92 })
  );
  marker.position.copy(position);
  marker.renderOrder = 10_000;
  return marker;
}

function disposeAndDeleteHelper(state: LightReconcileState, helperRoot: THREE.Group, key: string): void {
  const helper = state.helperObjects.get(key);
  if (!helper) {
    return;
  }
  helperRoot.remove(helper);
  disposeObject(helper);
  state.helperObjects.delete(key);
}

function upsertDirectionalHelper(
  helperRoot: THREE.Group,
  state: LightReconcileState,
  key: string,
  light: THREE.DirectionalLight,
  visible: boolean
): void {
  const existing = state.helperObjects.get(key);
  let helper: THREE.DirectionalLightHelper;
  if (!(existing instanceof THREE.DirectionalLightHelper) || existing.light !== light) {
    if (existing) {
      helperRoot.remove(existing);
      disposeObject(existing);
    }
    helper = new THREE.DirectionalLightHelper(light, 1.2, light.color.getHex());
    helperRoot.add(helper);
    state.helperObjects.set(key, helper);
  } else {
    helper = existing;
  }
  helper.userData.sceneLightId = light.userData.sceneLightId;
  helper.visible = visible && light.visible;
  helper.update();
}

function upsertPointHelper(
  helperRoot: THREE.Group,
  state: LightReconcileState,
  key: string,
  light: THREE.PointLight,
  visible: boolean
): void {
  const existing = state.helperObjects.get(key);
  let helper: THREE.PointLightHelper;
  if (!(existing instanceof THREE.PointLightHelper) || existing.light !== light) {
    if (existing) {
      helperRoot.remove(existing);
      disposeObject(existing);
    }
    helper = new THREE.PointLightHelper(light, 0.3, light.color.getHex());
    helperRoot.add(helper);
    state.helperObjects.set(key, helper);
  } else {
    helper = existing;
  }
  helper.userData.sceneLightId = light.userData.sceneLightId;
  helper.visible = visible && light.visible;
  helper.update();
}

function upsertSpotHelper(
  helperRoot: THREE.Group,
  state: LightReconcileState,
  key: string,
  light: THREE.SpotLight,
  visible: boolean
): void {
  const existing = state.helperObjects.get(key);
  let helper: THREE.SpotLightHelper;
  if (!(existing instanceof THREE.SpotLightHelper) || existing.light !== light) {
    if (existing) {
      helperRoot.remove(existing);
      disposeObject(existing);
    }
    helper = new THREE.SpotLightHelper(light);
    helperRoot.add(helper);
    state.helperObjects.set(key, helper);
  } else {
    helper = existing;
  }
  helper.userData.sceneLightId = light.userData.sceneLightId;
  helper.visible = visible && light.visible;
  helper.update();
}

function upsertTargetAxes(
  helperRoot: THREE.Group,
  state: LightReconcileState,
  key: string,
  lightId: string,
  target: THREE.Object3D,
  size: number,
  visible: boolean
): void {
  let helper = state.helperObjects.get(key);
  if (!(helper instanceof THREE.AxesHelper)) {
    if (helper) {
      helperRoot.remove(helper);
      disposeObject(helper);
    }
    helper = new THREE.AxesHelper(size);
    helperRoot.add(helper);
    state.helperObjects.set(key, helper);
  }
  helper.userData.sceneLightId = lightId;
  helper.position.copy(target.position);
  helper.visible = visible;
}

function refreshHelpers(
  helperRoot: THREE.Group,
  state: LightReconcileState,
  nodes: Iterable<LightRuntimeNode>,
  visible: boolean
): void {
  const expectedKeys = new Set<string>();

  for (const node of nodes) {
    if (node.light instanceof THREE.DirectionalLight) {
      expectedKeys.add(`dir:${node.id}`);
      if (node.targetObject) {
        expectedKeys.add(`dirTarget:${node.id}`);
      }
      continue;
    }
    if (node.light instanceof THREE.PointLight) {
      expectedKeys.add(`point:${node.id}`);
      continue;
    }
    if (node.light instanceof THREE.SpotLight) {
      expectedKeys.add(`spot:${node.id}`);
      if (node.targetObject) {
        expectedKeys.add(`spotTarget:${node.id}`);
      }
    }
  }

  for (const key of state.helperObjects.keys()) {
    if (!expectedKeys.has(key)) {
      disposeAndDeleteHelper(state, helperRoot, key);
    }
  }

  if (!visible) {
    for (const helper of state.helperObjects.values()) {
      helper.visible = false;
    }
    return;
  }

  for (const node of nodes) {
    if (node.light instanceof THREE.DirectionalLight) {
      upsertDirectionalHelper(helperRoot, state, `dir:${node.id}`, node.light, true);
      if (node.targetObject) {
        upsertTargetAxes(helperRoot, state, `dirTarget:${node.id}`, node.id, node.targetObject, 0.35, true);
      }
      continue;
    }
    if (node.light instanceof THREE.PointLight) {
      upsertPointHelper(helperRoot, state, `point:${node.id}`, node.light, true);
      continue;
    }
    if (node.light instanceof THREE.SpotLight) {
      upsertSpotHelper(helperRoot, state, `spot:${node.id}`, node.light, true);
      if (node.targetObject) {
        upsertTargetAxes(helperRoot, state, `spotTarget:${node.id}`, node.id, node.targetObject, 0.3, true);
      }
    }
  }
}

function refreshSelectionMarkers(
  markerRoot: THREE.Group,
  state: LightReconcileState,
  selectedLightId: string | null,
  selectedSubmode: LightGizmoSubmode
): void {
  if (!markerRoot.children.includes(state.positionMarker)) {
    markerRoot.add(state.positionMarker);
  }
  if (!markerRoot.children.includes(state.targetMarker)) {
    markerRoot.add(state.targetMarker);
  }

  if (!selectedLightId) {
    state.positionMarker.visible = false;
    state.targetMarker.visible = false;
    return;
  }

  const node = state.nodes.get(selectedLightId);
  if (!node) {
    state.positionMarker.visible = false;
    state.targetMarker.visible = false;
    return;
  }

  state.positionMarker.position.copy(node.light.position);
  state.positionMarker.visible = true;

  if (node.targetObject) {
    const targetColor = selectedSubmode === 'target' ? 0xf97316 : 0xfbbf24;
    const targetMaterial = state.targetMarker.material;
    if (targetMaterial instanceof THREE.MeshBasicMaterial) {
      targetMaterial.color.setHex(targetColor);
    }
    state.targetMarker.position.copy(node.targetObject.position);
    state.targetMarker.visible = true;
    return;
  }

  state.targetMarker.visible = false;
}

export function createLightReconcileState(): LightReconcileState {
  const positionMarker = createMarker(0x38bdf8, new THREE.Vector3(), 0.12);
  const targetMarker = createMarker(0xfbbf24, new THREE.Vector3(), 0.09);
  positionMarker.visible = false;
  targetMarker.visible = false;

  return {
    nodes: new Map<string, LightRuntimeNode>(),
    helperObjects: new Map<string, THREE.Object3D>(),
    positionMarker,
    targetMarker
  };
}

export function reconcileSceneLights(
  lightRoot: THREE.Group,
  helperRoot: THREE.Group,
  markerRoot: THREE.Group,
  state: LightReconcileState,
  sceneLights: SceneLightV2[],
  options: ReconcileOptions
): void {
  const expectedIds = new Set(sceneLights.map((light) => light.id));

  for (const [id, node] of state.nodes.entries()) {
    if (expectedIds.has(id)) {
      continue;
    }

    lightRoot.remove(node.light);
    if (node.targetObject) {
      lightRoot.remove(node.targetObject);
    }
    disposeObject(node.light);
    if (node.targetObject) {
      disposeObject(node.targetObject);
    }
    state.nodes.delete(id);
  }

  for (const sceneLight of sceneLights) {
    let node = state.nodes.get(sceneLight.id) ?? null;
    if (!node || node.type !== sceneLight.type) {
      if (node) {
        lightRoot.remove(node.light);
        if (node.targetObject) {
          lightRoot.remove(node.targetObject);
          disposeObject(node.targetObject);
        }
        disposeObject(node.light);
      }

      node = createLightNode(sceneLight, options.shadowsEnabled);
      state.nodes.set(sceneLight.id, node);
    }

    updateLightNode(node, sceneLight, options.shadowsEnabled);

    if (!lightRoot.children.includes(node.light)) {
      lightRoot.add(node.light);
    }

    if (node.targetObject && !lightRoot.children.includes(node.targetObject)) {
      lightRoot.add(node.targetObject);
    }
  }

  refreshHelpers(helperRoot, state, state.nodes.values(), options.showHelpers);
  refreshSelectionMarkers(markerRoot, state, options.selectedLightId, options.selectedSubmode);
}

export function getLightNode(state: LightReconcileState, id: string): LightRuntimeNode | null {
  return state.nodes.get(id) ?? null;
}

export function getLightObjectForGizmo(
  state: LightReconcileState,
  id: string,
  submode: LightGizmoSubmode
): THREE.Object3D | null {
  const node = state.nodes.get(id);
  if (!node) {
    return null;
  }

  if (submode === 'target') {
    return node.targetObject;
  }

  if (node.type === 'ambient') {
    return null;
  }

  return node.light;
}

export function canUseTargetSubmode(light: SceneLightV2): boolean {
  return light.type === 'directional' || light.type === 'spot';
}

export function sceneLightToThreeNode(sceneLight: SceneLightV2, shadowsEnabled = true): LightRuntimeNode {
  return createLightNode(sceneLight, shadowsEnabled);
}

export function threeNodeToSceneLight(node: LightRuntimeNode, fallbackId = generateLightId('ambient')): SceneLightV2 {
  const id = typeof node.light.userData.sceneLightId === 'string' ? node.light.userData.sceneLightId : fallbackId;
  const name = typeof node.light.userData.sceneLightName === 'string' ? node.light.userData.sceneLightName : 'Light';
  const enabled = node.light.visible;
  const intensity = node.light.intensity;
  const color = `#${node.light.color.getHexString()}`;

  if (node.light instanceof THREE.AmbientLight) {
    const data: SceneAmbientLightV2 = {
      id,
      type: 'ambient',
      name,
      enabled,
      color,
      intensity
    };
    return data;
  }

  if (node.light instanceof THREE.DirectionalLight) {
    const target = node.targetObject ?? node.light.target;
    const data: SceneDirectionalLightV2 = {
      id,
      type: 'directional',
      name,
      enabled,
      color,
      intensity,
      position: [node.light.position.x, node.light.position.y, node.light.position.z],
      target: [target.position.x, target.position.y, target.position.z],
      castShadow: node.light.castShadow,
      shadowMapSize: node.light.shadow.mapSize.x,
      shadowBias: node.light.shadow.bias,
      shadowNormalBias: node.light.shadow.normalBias
    };
    return data;
  }

  if (node.light instanceof THREE.PointLight) {
    const data: ScenePointLightV2 = {
      id,
      type: 'point',
      name,
      enabled,
      color,
      intensity,
      position: [node.light.position.x, node.light.position.y, node.light.position.z],
      distance: node.light.distance,
      decay: node.light.decay,
      castShadow: node.light.castShadow,
      shadowMapSize: node.light.shadow.mapSize.x,
      shadowBias: node.light.shadow.bias,
      shadowNormalBias: node.light.shadow.normalBias
    };
    return data;
  }

  const target = node.targetObject ?? node.light.target;
  const data: SceneSpotLightV2 = {
    id,
    type: 'spot',
    name,
    enabled,
    color,
    intensity,
    position: [node.light.position.x, node.light.position.y, node.light.position.z],
    target: [target.position.x, target.position.y, target.position.z],
    distance: node.light.distance,
    decay: node.light.decay,
    angle: node.light.angle,
    penumbra: node.light.penumbra,
    castShadow: node.light.castShadow,
    shadowMapSize: node.light.shadow.mapSize.x,
    shadowBias: node.light.shadow.bias,
    shadowNormalBias: node.light.shadow.normalBias
  };
  return data;
}

export function defaultLightsToSceneLights(defaultLights: {
  ambient: THREE.AmbientLight;
  key: THREE.DirectionalLight;
}): SceneLightV2[] {
  defaultLights.ambient.userData.sceneLightId = DEFAULT_AMBIENT_LIGHT_ID;
  defaultLights.ambient.userData.sceneLightName = 'Ambient Light';

  defaultLights.key.userData.sceneLightId = DEFAULT_KEY_LIGHT_ID;
  defaultLights.key.userData.sceneLightName = 'Key Light';

  const ambientNode: LightRuntimeNode = {
    id: DEFAULT_AMBIENT_LIGHT_ID,
    type: 'ambient',
    light: defaultLights.ambient,
    targetObject: null
  };

  const keyTarget = defaultLights.key.target;
  if (!keyTarget) {
    defaultLights.key.target = new THREE.Object3D();
    defaultLights.key.target.position.set(0, 0, 0);
  }

  const keyNode: LightRuntimeNode = {
    id: DEFAULT_KEY_LIGHT_ID,
    type: 'directional',
    light: defaultLights.key,
    targetObject: defaultLights.key.target
  };

  const ambient = threeNodeToSceneLight(ambientNode, DEFAULT_AMBIENT_LIGHT_ID);
  ambient.name = 'Ambient Light';

  const key = threeNodeToSceneLight(keyNode, DEFAULT_KEY_LIGHT_ID);
  key.name = 'Key Light';

  return [ambient, key];
}

function cloneSceneLight(light: SceneLightV2): SceneLightV2 {
  if (light.type === 'ambient') {
    return {
      ...light,
      color: normalizeColor(light.color),
      intensity: Number.isFinite(light.intensity) ? light.intensity : 1
    };
  }

  if (light.type === 'directional') {
    return {
      ...light,
      color: normalizeColor(light.color),
      intensity: Number.isFinite(light.intensity) ? light.intensity : 1,
      position: [...light.position] as [number, number, number],
      target: [...light.target] as [number, number, number],
      castShadow: Boolean(light.castShadow),
      shadowMapSize: Number.isFinite(light.shadowMapSize) ? Math.max(128, Math.floor(light.shadowMapSize)) : DEFAULT_LIGHT_SHADOW_MAP_SIZE,
      shadowBias: Number.isFinite(light.shadowBias) ? light.shadowBias : DEFAULT_LIGHT_SHADOW_BIAS,
      shadowNormalBias: Number.isFinite(light.shadowNormalBias)
        ? light.shadowNormalBias
        : DEFAULT_LIGHT_SHADOW_NORMAL_BIAS
    };
  }

  if (light.type === 'point') {
    return {
      ...light,
      color: normalizeColor(light.color),
      intensity: Number.isFinite(light.intensity) ? light.intensity : 1,
      position: [...light.position] as [number, number, number],
      distance: Number.isFinite(light.distance) ? Math.max(0, light.distance) : 0,
      decay: Number.isFinite(light.decay) ? Math.max(0, light.decay) : 2,
      castShadow: Boolean(light.castShadow),
      shadowMapSize: Number.isFinite(light.shadowMapSize) ? Math.max(128, Math.floor(light.shadowMapSize)) : DEFAULT_LIGHT_SHADOW_MAP_SIZE,
      shadowBias: Number.isFinite(light.shadowBias) ? light.shadowBias : DEFAULT_LIGHT_SHADOW_BIAS,
      shadowNormalBias: Number.isFinite(light.shadowNormalBias)
        ? light.shadowNormalBias
        : DEFAULT_LIGHT_SHADOW_NORMAL_BIAS
    };
  }

  return {
    ...light,
    color: normalizeColor(light.color),
    intensity: Number.isFinite(light.intensity) ? light.intensity : 1,
    position: [...light.position] as [number, number, number],
    target: [...light.target] as [number, number, number],
    distance: Number.isFinite(light.distance) ? Math.max(0, light.distance) : 0,
    decay: Number.isFinite(light.decay) ? Math.max(0, light.decay) : 2,
    angle: Number.isFinite(light.angle) ? clamp(light.angle, 0.01, Math.PI / 2) : Math.PI / 6,
    penumbra: Number.isFinite(light.penumbra) ? clamp(light.penumbra, 0, 1) : 0.2,
    castShadow: Boolean(light.castShadow),
    shadowMapSize: Number.isFinite(light.shadowMapSize) ? Math.max(128, Math.floor(light.shadowMapSize)) : DEFAULT_LIGHT_SHADOW_MAP_SIZE,
    shadowBias: Number.isFinite(light.shadowBias) ? light.shadowBias : DEFAULT_LIGHT_SHADOW_BIAS,
    shadowNormalBias: Number.isFinite(light.shadowNormalBias)
      ? light.shadowNormalBias
      : DEFAULT_LIGHT_SHADOW_NORMAL_BIAS
  };
}

export function cloneSceneLights(lights: SceneLightV2[]): SceneLightV2[] {
  return lights.map((light) => cloneSceneLight(light));
}

export function hasMatchingSplatRef(
  current: { name: string; ext: string } | null,
  expected: { name: string; ext: string } | null
): boolean {
  if (!current || !expected) {
    return false;
  }

  return current.name === expected.name && current.ext.toLowerCase() === expected.ext.toLowerCase();
}

export function applySceneSettingsDefaults(input: Partial<SceneSettingsV2>): SceneSettingsV2 {
  return createDefaultSceneSettings(input);
}

// Compatibility wrappers for legacy call sites/tests.
export function createThreeLight(sceneLight: SceneLightV2): SupportedThreeLight {
  return sceneLightToThreeNode(sceneLight).light;
}

export function syncSceneLightsToRoot(lightRoot: THREE.Group, sceneLights: SceneLightV2[]): void {
  while (lightRoot.children.length > 0) {
    lightRoot.remove(lightRoot.children[0]);
  }

  for (const sceneLight of sceneLights) {
    const node = sceneLightToThreeNode(sceneLight);
    lightRoot.add(node.light);
    if (node.targetObject) {
      lightRoot.add(node.targetObject);
    }
  }
}

export function syncLightHelpersToRoot(helperRoot: THREE.Group, lightRoot: THREE.Group, visible: boolean): void {
  clearGroup(helperRoot);

  if (!visible) {
    return;
  }

  for (const object of lightRoot.children) {
    if (object instanceof THREE.DirectionalLight) {
      const helper = new THREE.DirectionalLightHelper(object, 1.2, object.color.getHex());
      helper.userData.sceneLightId = object.userData.sceneLightId;
      helper.visible = object.visible;
      helperRoot.add(helper);
      continue;
    }

    if (object instanceof THREE.PointLight) {
      const helper = new THREE.PointLightHelper(object, 0.3, object.color.getHex());
      helper.userData.sceneLightId = object.userData.sceneLightId;
      helper.visible = object.visible;
      helperRoot.add(helper);
      continue;
    }

    if (object instanceof THREE.SpotLight) {
      const helper = new THREE.SpotLightHelper(object);
      helper.userData.sceneLightId = object.userData.sceneLightId;
      helper.visible = object.visible;
      helper.update();
      helperRoot.add(helper);
      continue;
    }
  }
}

export function threeLightToSceneLight(
  light: SupportedThreeLight,
  fallbackId = generateLightId('ambient')
): SceneLightV2 {
  const node: LightRuntimeNode = {
    id: fallbackId,
    type: (light.userData.sceneLightType as SceneLightType) ?? 'ambient',
    light,
    targetObject: light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight ? light.target : null
  };
  return threeNodeToSceneLight(node, fallbackId);
}
