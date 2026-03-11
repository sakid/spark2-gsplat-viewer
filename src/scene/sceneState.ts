import type { LoadMode } from '../viewer/loadSplat';

export const SCENE_FILE_SCHEMA = 'spark2-scene' as const;
export const SCENE_FILE_VERSION = 2 as const;
const SCENE_FILE_VERSION_V1 = 1 as const;
export const SCENE_SLOT_STORAGE_KEY = 'spark2.scene.slots.v2' as const;
const SCENE_SLOT_STORAGE_KEY_V1 = 'spark2.scene.slots.v1' as const;
export const SCENE_SLOT_LIMIT = 50;

export const DEFAULT_LIGHT_SHADOW_MAP_SIZE = 1024;
export const DEFAULT_LIGHT_SHADOW_BIAS = -0.0005;
export const DEFAULT_LIGHT_SHADOW_NORMAL_BIAS = 0.02;

export type SceneFileVersion = 1 | 2;
export type SceneLightType = 'ambient' | 'directional' | 'point' | 'spot';
export type SceneToneMapping = 'ACESFilmic' | 'Neutral' | 'None';
export type EditorGizmoSpace = 'world' | 'local';

export interface SceneLightBaseV2 {
  id: string;
  type: SceneLightType;
  name: string;
  enabled: boolean;
  color: string;
  intensity: number;
}

export interface SceneShadowSettingsV2 {
  castShadow: boolean;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
}

export interface SceneAmbientLightV2 extends SceneLightBaseV2 {
  type: 'ambient';
}

export interface SceneDirectionalLightV2 extends SceneLightBaseV2, SceneShadowSettingsV2 {
  type: 'directional';
  position: [number, number, number];
  target: [number, number, number];
}

export interface ScenePointLightV2 extends SceneLightBaseV2, SceneShadowSettingsV2 {
  type: 'point';
  position: [number, number, number];
  distance: number;
  decay: number;
}

export interface SceneSpotLightV2 extends SceneLightBaseV2, SceneShadowSettingsV2 {
  type: 'spot';
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
}

export type SceneLightV2 =
  | SceneAmbientLightV2
  | SceneDirectionalLightV2
  | ScenePointLightV2
  | SceneSpotLightV2;

export interface SceneCameraV1 {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
  near: number;
  far: number;
}

export interface SceneSplatRefV1 {
  name: string;
  ext: string;
  loadMode: LoadMode;
}

export interface SceneSettingsV2 {
  lodSplatCount: number;
  lodSplatScale: number;
  improvedQuality: boolean;
  sourceQualityMode: boolean;
  flipUpDown: boolean;
  flipLeftRight: boolean;
  proxyFlipUpDown: boolean;
  proxyMirrorX: boolean;
  proxyMirrorZ: boolean;
  proxyUserPosition: [number, number, number];
  proxyUserQuaternion: [number, number, number, number];
  proxyUserScale: [number, number, number];
  outlinerParents: Array<{ id: string; parentId: string | null }>;
  selectedOutlinerId: string | null;
  physicallyCorrectLights: boolean;
  toneMapping: SceneToneMapping;
  toneMappingExposure: number;
  shadowsEnabled: boolean;
  lightEditMode: boolean;
  showLightHelpers: boolean;
  showLightGizmos: boolean;
  showMovementControls: boolean;
  showLightingProbes: boolean;
  collisionEnabled: boolean;
  showProxyMesh: boolean;
  voxelEditMode: boolean;
  objectEditMode: boolean;
  editorSnapEnabled: boolean;
  editorGizmoSpace: EditorGizmoSpace;
  editorTranslateSnap: number;
  editorRotateSnap: number;
  editorScaleSnap: number;
}

export interface SceneFileV2 {
  schema: typeof SCENE_FILE_SCHEMA;
  version: 2;
  savedAt: string;
  sceneName: string;
  splatRef: SceneSplatRefV1 | null;
  camera: SceneCameraV1;
  settings: SceneSettingsV2;
  lights: SceneLightV2[];
}

interface SceneLightBaseV1 {
  id: string;
  type: SceneLightType;
  name: string;
  enabled: boolean;
  color: string;
  intensity: number;
}

interface SceneAmbientLightV1Legacy extends SceneLightBaseV1 {
  type: 'ambient';
}

interface SceneDirectionalLightV1Legacy extends SceneLightBaseV1 {
  type: 'directional';
  position: [number, number, number];
}

interface ScenePointLightV1Legacy extends SceneLightBaseV1 {
  type: 'point';
  position: [number, number, number];
  distance: number;
  decay: number;
}

interface SceneSpotLightV1Legacy extends SceneLightBaseV1 {
  type: 'spot';
  position: [number, number, number];
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
}

type SceneLightV1Legacy =
  | SceneAmbientLightV1Legacy
  | SceneDirectionalLightV1Legacy
  | ScenePointLightV1Legacy
  | SceneSpotLightV1Legacy;

interface SceneSettingsV1Legacy {
  lodSplatCount: number;
  lodSplatScale: number;
  improvedQuality: boolean;
  sourceQualityMode: boolean;
  flipUpDown: boolean;
  flipLeftRight: boolean;
}

interface SceneFileV1Legacy {
  schema: typeof SCENE_FILE_SCHEMA;
  version: 1;
  savedAt: string;
  sceneName: string;
  splatRef: SceneSplatRefV1 | null;
  camera: SceneCameraV1;
  settings: SceneSettingsV1Legacy;
  lights: SceneLightV1Legacy[];
}

export type SceneFileAny = SceneFileV1Legacy | SceneFileV2;

// Compatibility aliases for existing imports.
export type SceneLightV1 = SceneLightV2;
export type SceneAmbientLightV1 = SceneAmbientLightV2;
export type SceneDirectionalLightV1 = SceneDirectionalLightV2;
export type ScenePointLightV1 = ScenePointLightV2;
export type SceneSpotLightV1 = SceneSpotLightV2;
export type SceneSettingsV1 = SceneSettingsV2;
export type SceneFileV1 = SceneFileV2;

interface SlotStore {
  slots: Record<string, SceneFileV2>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Scene validation failed: ${name} must be a string.`);
  }

  return value;
}

function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Scene validation failed: ${name} must be a boolean.`);
  }

  return value;
}

function assertFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Scene validation failed: ${name} must be a finite number.`);
  }

  return value;
}

function assertTuple3(value: unknown, name: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Scene validation failed: ${name} must be [x,y,z].`);
  }

  return [
    assertFiniteNumber(value[0], `${name}[0]`),
    assertFiniteNumber(value[1], `${name}[1]`),
    assertFiniteNumber(value[2], `${name}[2]`)
  ];
}

function assertTuple4(value: unknown, name: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error(`Scene validation failed: ${name} must be [x,y,z,w].`);
  }

  return [
    assertFiniteNumber(value[0], `${name}[0]`),
    assertFiniteNumber(value[1], `${name}[1]`),
    assertFiniteNumber(value[2], `${name}[2]`),
    assertFiniteNumber(value[3], `${name}[3]`)
  ];
}

function isSceneLightType(value: unknown): value is SceneLightType {
  return value === 'ambient' || value === 'directional' || value === 'point' || value === 'spot';
}

function isSceneToneMapping(value: unknown): value is SceneToneMapping {
  return value === 'ACESFilmic' || value === 'Neutral' || value === 'None';
}

function isEditorGizmoSpace(value: unknown): value is EditorGizmoSpace {
  return value === 'world' || value === 'local';
}

function normalizeShadowSettings(raw: Record<string, unknown>, namePrefix: string): SceneShadowSettingsV2 {
  return {
    castShadow: assertBoolean(raw.castShadow, `${namePrefix}.castShadow`),
    shadowMapSize: Math.max(128, Math.floor(assertFiniteNumber(raw.shadowMapSize, `${namePrefix}.shadowMapSize`))),
    shadowBias: assertFiniteNumber(raw.shadowBias, `${namePrefix}.shadowBias`),
    shadowNormalBias: assertFiniteNumber(raw.shadowNormalBias, `${namePrefix}.shadowNormalBias`)
  };
}

function defaultShadowSettings(type: 'directional' | 'point' | 'spot'): SceneShadowSettingsV2 {
  return {
    castShadow: type === 'directional' || type === 'spot',
    shadowMapSize: DEFAULT_LIGHT_SHADOW_MAP_SIZE,
    shadowBias: DEFAULT_LIGHT_SHADOW_BIAS,
    shadowNormalBias: DEFAULT_LIGHT_SHADOW_NORMAL_BIAS
  };
}

function validateSceneLightV1(raw: unknown, index: number): SceneLightV1Legacy {
  if (!isObject(raw)) {
    throw new Error(`Scene validation failed: lights[${index}] must be an object.`);
  }

  const id = assertString(raw.id, `lights[${index}].id`);
  const type = raw.type;
  if (!isSceneLightType(type)) {
    throw new Error(`Scene validation failed: lights[${index}].type is invalid.`);
  }

  const name = assertString(raw.name, `lights[${index}].name`);
  const enabled = assertBoolean(raw.enabled, `lights[${index}].enabled`);
  const color = assertString(raw.color, `lights[${index}].color`);
  const intensity = assertFiniteNumber(raw.intensity, `lights[${index}].intensity`);

  if (type === 'ambient') {
    return { id, type, name, enabled, color, intensity };
  }

  const position = assertTuple3(raw.position, `lights[${index}].position`);

  if (type === 'directional') {
    return { id, type, name, enabled, color, intensity, position };
  }

  const distance = assertFiniteNumber(raw.distance, `lights[${index}].distance`);
  const decay = assertFiniteNumber(raw.decay, `lights[${index}].decay`);

  if (type === 'point') {
    return { id, type, name, enabled, color, intensity, position, distance, decay };
  }

  return {
    id,
    type: 'spot',
    name,
    enabled,
    color,
    intensity,
    position,
    distance,
    decay,
    angle: assertFiniteNumber(raw.angle, `lights[${index}].angle`),
    penumbra: assertFiniteNumber(raw.penumbra, `lights[${index}].penumbra`)
  };
}

function validateSceneLightV2(raw: unknown, index: number): SceneLightV2 {
  if (!isObject(raw)) {
    throw new Error(`Scene validation failed: lights[${index}] must be an object.`);
  }

  const id = assertString(raw.id, `lights[${index}].id`);
  const type = raw.type;
  if (!isSceneLightType(type)) {
    throw new Error(`Scene validation failed: lights[${index}].type is invalid.`);
  }

  const name = assertString(raw.name, `lights[${index}].name`);
  const enabled = assertBoolean(raw.enabled, `lights[${index}].enabled`);
  const color = assertString(raw.color, `lights[${index}].color`);
  const intensity = assertFiniteNumber(raw.intensity, `lights[${index}].intensity`);

  if (type === 'ambient') {
    return { id, type, name, enabled, color, intensity };
  }

  const position = assertTuple3(raw.position, `lights[${index}].position`);

  if (type === 'directional') {
    const target = assertTuple3(raw.target, `lights[${index}].target`);
    return {
      id,
      type,
      name,
      enabled,
      color,
      intensity,
      position,
      target,
      ...normalizeShadowSettings(raw, `lights[${index}]`)
    };
  }

  const distance = assertFiniteNumber(raw.distance, `lights[${index}].distance`);
  const decay = assertFiniteNumber(raw.decay, `lights[${index}].decay`);

  if (type === 'point') {
    return {
      id,
      type,
      name,
      enabled,
      color,
      intensity,
      position,
      distance,
      decay,
      ...normalizeShadowSettings(raw, `lights[${index}]`)
    };
  }

  const target = assertTuple3(raw.target, `lights[${index}].target`);
  return {
    id,
    type: 'spot',
    name,
    enabled,
    color,
    intensity,
    position,
    target,
    distance,
    decay,
    angle: assertFiniteNumber(raw.angle, `lights[${index}].angle`),
    penumbra: assertFiniteNumber(raw.penumbra, `lights[${index}].penumbra`),
    ...normalizeShadowSettings(raw, `lights[${index}]`)
  };
}

function validateSceneCamera(raw: unknown): SceneCameraV1 {
  if (!isObject(raw)) {
    throw new Error('Scene validation failed: camera must be an object.');
  }

  return {
    position: assertTuple3(raw.position, 'camera.position'),
    quaternion: assertTuple4(raw.quaternion, 'camera.quaternion'),
    fov: assertFiniteNumber(raw.fov, 'camera.fov'),
    near: assertFiniteNumber(raw.near, 'camera.near'),
    far: assertFiniteNumber(raw.far, 'camera.far')
  };
}

function validateSceneSettingsV1(raw: unknown): SceneSettingsV1Legacy {
  if (!isObject(raw)) {
    throw new Error('Scene validation failed: settings must be an object.');
  }

  return {
    lodSplatCount: Math.floor(assertFiniteNumber(raw.lodSplatCount, 'settings.lodSplatCount')),
    lodSplatScale: assertFiniteNumber(raw.lodSplatScale, 'settings.lodSplatScale'),
    improvedQuality: assertBoolean(raw.improvedQuality, 'settings.improvedQuality'),
    sourceQualityMode: assertBoolean(raw.sourceQualityMode, 'settings.sourceQualityMode'),
    flipUpDown: assertBoolean(raw.flipUpDown, 'settings.flipUpDown'),
    flipLeftRight: assertBoolean(raw.flipLeftRight, 'settings.flipLeftRight')
  };
}

function validateSceneSettingsV2(raw: unknown): SceneSettingsV2 {
  if (!isObject(raw)) {
    throw new Error('Scene validation failed: settings must be an object.');
  }

  const toneMapping = raw.toneMapping;
  if (!isSceneToneMapping(toneMapping)) {
    throw new Error('Scene validation failed: settings.toneMapping is invalid.');
  }

  const outlinerParentsRaw = 'outlinerParents' in raw ? raw.outlinerParents : [];
  const outlinerParents: Array<{ id: string; parentId: string | null }> = [];
  if (Array.isArray(outlinerParentsRaw)) {
    for (let i = 0; i < outlinerParentsRaw.length; i += 1) {
      const entry = outlinerParentsRaw[i];
      if (!isObject(entry)) {
        throw new Error(`Scene validation failed: settings.outlinerParents[${i}] must be an object.`);
      }
      const id = assertString(entry.id, `settings.outlinerParents[${i}].id`);
      const parentIdRaw = 'parentId' in entry ? entry.parentId : null;
      const parentId = parentIdRaw == null ? null : assertString(parentIdRaw, `settings.outlinerParents[${i}].parentId`);
      outlinerParents.push({ id, parentId });
    }
  } else {
    throw new Error('Scene validation failed: settings.outlinerParents must be an array.');
  }

  const selectedOutlinerIdRaw = 'selectedOutlinerId' in raw ? raw.selectedOutlinerId : null;
  const selectedOutlinerId = selectedOutlinerIdRaw == null
    ? null
    : assertString(selectedOutlinerIdRaw, 'settings.selectedOutlinerId');

  return {
    lodSplatCount: Math.floor(assertFiniteNumber(raw.lodSplatCount, 'settings.lodSplatCount')),
    lodSplatScale: assertFiniteNumber(raw.lodSplatScale, 'settings.lodSplatScale'),
    improvedQuality: assertBoolean(raw.improvedQuality, 'settings.improvedQuality'),
    sourceQualityMode: assertBoolean(raw.sourceQualityMode, 'settings.sourceQualityMode'),
    flipUpDown: assertBoolean(raw.flipUpDown, 'settings.flipUpDown'),
    flipLeftRight: assertBoolean(raw.flipLeftRight, 'settings.flipLeftRight'),
    proxyFlipUpDown: 'proxyFlipUpDown' in raw ? assertBoolean(raw.proxyFlipUpDown, 'settings.proxyFlipUpDown') : false,
    proxyMirrorX: 'proxyMirrorX' in raw ? assertBoolean(raw.proxyMirrorX, 'settings.proxyMirrorX') : false,
    proxyMirrorZ: 'proxyMirrorZ' in raw ? assertBoolean(raw.proxyMirrorZ, 'settings.proxyMirrorZ') : false,
    proxyUserPosition: 'proxyUserPosition' in raw ? assertTuple3(raw.proxyUserPosition, 'settings.proxyUserPosition') : [0, 0, 0],
    proxyUserQuaternion: 'proxyUserQuaternion' in raw ? assertTuple4(raw.proxyUserQuaternion, 'settings.proxyUserQuaternion') : [0, 0, 0, 1],
    proxyUserScale: 'proxyUserScale' in raw ? assertTuple3(raw.proxyUserScale, 'settings.proxyUserScale') : [1, 1, 1],
    outlinerParents,
    selectedOutlinerId,
    physicallyCorrectLights: assertBoolean(raw.physicallyCorrectLights, 'settings.physicallyCorrectLights'),
    toneMapping,
    toneMappingExposure: assertFiniteNumber(raw.toneMappingExposure, 'settings.toneMappingExposure'),
    shadowsEnabled: assertBoolean(raw.shadowsEnabled, 'settings.shadowsEnabled'),
    lightEditMode: assertBoolean(raw.lightEditMode, 'settings.lightEditMode'),
    showLightHelpers: assertBoolean(raw.showLightHelpers, 'settings.showLightHelpers'),
    showLightGizmos: assertBoolean(raw.showLightGizmos, 'settings.showLightGizmos'),
    showMovementControls: assertBoolean(raw.showMovementControls, 'settings.showMovementControls'),
    showLightingProbes: assertBoolean(raw.showLightingProbes, 'settings.showLightingProbes'),
    collisionEnabled: 'collisionEnabled' in raw ? assertBoolean(raw.collisionEnabled, 'settings.collisionEnabled') : true,
    showProxyMesh: 'showProxyMesh' in raw ? assertBoolean(raw.showProxyMesh, 'settings.showProxyMesh') : false,
    voxelEditMode: 'voxelEditMode' in raw ? assertBoolean(raw.voxelEditMode, 'settings.voxelEditMode') : false,
    objectEditMode: 'objectEditMode' in raw ? assertBoolean(raw.objectEditMode, 'settings.objectEditMode') : false,
    editorSnapEnabled: 'editorSnapEnabled' in raw ? assertBoolean(raw.editorSnapEnabled, 'settings.editorSnapEnabled') : true,
    editorGizmoSpace: isEditorGizmoSpace(raw.editorGizmoSpace) ? raw.editorGizmoSpace : 'world',
    editorTranslateSnap: 'editorTranslateSnap' in raw ? assertFiniteNumber(raw.editorTranslateSnap, 'settings.editorTranslateSnap') : 0.25,
    editorRotateSnap: 'editorRotateSnap' in raw ? assertFiniteNumber(raw.editorRotateSnap, 'settings.editorRotateSnap') : 15,
    editorScaleSnap: 'editorScaleSnap' in raw ? assertFiniteNumber(raw.editorScaleSnap, 'settings.editorScaleSnap') : 0.1
  };
}

function validateSplatRef(raw: unknown): SceneSplatRefV1 | null {
  if (raw == null) {
    return null;
  }

  if (!isObject(raw)) {
    throw new Error('Scene validation failed: splatRef must be an object or null.');
  }

  const loadModeRaw = raw.loadMode;
  if (loadModeRaw !== 'raw-ply' && loadModeRaw !== 'spz') {
    throw new Error('Scene validation failed: splatRef.loadMode is invalid.');
  }

  return {
    name: assertString(raw.name, 'splatRef.name'),
    ext: assertString(raw.ext, 'splatRef.ext'),
    loadMode: loadModeRaw
  };
}

function validateSceneFileV1(input: unknown): SceneFileV1Legacy {
  if (!isObject(input)) {
    throw new Error('Scene validation failed: root must be an object.');
  }

  const schema = assertString(input.schema, 'schema');
  if (schema !== SCENE_FILE_SCHEMA) {
    throw new Error(`Scene validation failed: schema must be "${SCENE_FILE_SCHEMA}".`);
  }

  const version = assertFiniteNumber(input.version, 'version');
  if (version !== SCENE_FILE_VERSION_V1) {
    throw new Error(`Scene validation failed: unsupported version ${version}.`);
  }

  const lightsRaw = input.lights;
  if (!Array.isArray(lightsRaw)) {
    throw new Error('Scene validation failed: lights must be an array.');
  }

  const lights = lightsRaw.map((light, index) => validateSceneLightV1(light, index));

  return {
    schema: SCENE_FILE_SCHEMA,
    version: 1,
    savedAt: assertString(input.savedAt, 'savedAt'),
    sceneName: assertString(input.sceneName, 'sceneName'),
    splatRef: validateSplatRef(input.splatRef),
    camera: validateSceneCamera(input.camera),
    settings: validateSceneSettingsV1(input.settings),
    lights
  };
}

function validateSceneFileV2(input: unknown): SceneFileV2 {
  if (!isObject(input)) {
    throw new Error('Scene validation failed: root must be an object.');
  }

  const schema = assertString(input.schema, 'schema');
  if (schema !== SCENE_FILE_SCHEMA) {
    throw new Error(`Scene validation failed: schema must be "${SCENE_FILE_SCHEMA}".`);
  }

  const version = assertFiniteNumber(input.version, 'version');
  if (version !== SCENE_FILE_VERSION) {
    throw new Error(`Scene validation failed: unsupported version ${version}.`);
  }

  const lightsRaw = input.lights;
  if (!Array.isArray(lightsRaw)) {
    throw new Error('Scene validation failed: lights must be an array.');
  }

  const lights = lightsRaw.map((light, index) => validateSceneLightV2(light, index));

  return {
    schema: SCENE_FILE_SCHEMA,
    version: SCENE_FILE_VERSION,
    savedAt: assertString(input.savedAt, 'savedAt'),
    sceneName: assertString(input.sceneName, 'sceneName'),
    splatRef: validateSplatRef(input.splatRef),
    camera: validateSceneCamera(input.camera),
    settings: validateSceneSettingsV2(input.settings),
    lights
  };
}

function migrateV1LightToV2(light: SceneLightV1Legacy): SceneLightV2 {
  if (light.type === 'ambient') {
    return { ...light };
  }

  if (light.type === 'directional') {
    return {
      ...light,
      target: [0, 0, 0],
      ...defaultShadowSettings('directional')
    };
  }

  if (light.type === 'point') {
    return {
      ...light,
      ...defaultShadowSettings('point')
    };
  }

  return {
    ...light,
    target: [0, 0, 0],
    ...defaultShadowSettings('spot')
  };
}

export function createDefaultSceneSettings(partial: Partial<SceneSettingsV2> = {}): SceneSettingsV2 {
  const toneMapping = isSceneToneMapping(partial.toneMapping) ? partial.toneMapping : 'ACESFilmic';
  return {
    lodSplatCount: Math.max(10_000, Math.floor(partial.lodSplatCount ?? 1_500_000)),
    lodSplatScale: Number.isFinite(partial.lodSplatScale) ? Math.max(0.1, partial.lodSplatScale as number) : 1,
    improvedQuality: Boolean(partial.improvedQuality),
    sourceQualityMode: Boolean(partial.sourceQualityMode),
    flipUpDown: Boolean(partial.flipUpDown),
    flipLeftRight: Boolean(partial.flipLeftRight),
    proxyFlipUpDown: Boolean(partial.proxyFlipUpDown),
    proxyMirrorX: Boolean(partial.proxyMirrorX),
    proxyMirrorZ: Boolean(partial.proxyMirrorZ),
    proxyUserPosition: Array.isArray(partial.proxyUserPosition) ? (partial.proxyUserPosition as [number, number, number]) : [0, 0, 0],
    proxyUserQuaternion: Array.isArray(partial.proxyUserQuaternion)
      ? (partial.proxyUserQuaternion as [number, number, number, number])
      : [0, 0, 0, 1],
    proxyUserScale: Array.isArray(partial.proxyUserScale) ? (partial.proxyUserScale as [number, number, number]) : [1, 1, 1],
    outlinerParents: Array.isArray(partial.outlinerParents)
      ? partial.outlinerParents
        .filter((entry): entry is { id: string; parentId: string | null } => isObject(entry) && typeof entry.id === 'string')
        .map((entry) => ({ id: entry.id, parentId: entry.parentId ?? null }))
      : [],
    selectedOutlinerId: typeof partial.selectedOutlinerId === 'string' ? partial.selectedOutlinerId : null,
    physicallyCorrectLights: partial.physicallyCorrectLights ?? true,
    toneMapping,
    toneMappingExposure: Number.isFinite(partial.toneMappingExposure)
      ? Math.max(0.05, partial.toneMappingExposure as number)
      : 1,
    shadowsEnabled: partial.shadowsEnabled ?? true,
    lightEditMode: Boolean(partial.lightEditMode),
    showLightHelpers: partial.showLightHelpers ?? true,
    showLightGizmos: partial.showLightGizmos ?? true,
    showMovementControls: partial.showMovementControls ?? true,
    showLightingProbes: partial.showLightingProbes ?? true,
    collisionEnabled: partial.collisionEnabled ?? true,
    showProxyMesh: partial.showProxyMesh ?? false,
    voxelEditMode: partial.voxelEditMode ?? false,
    objectEditMode: partial.objectEditMode ?? false,
    editorSnapEnabled: partial.editorSnapEnabled ?? true,
    editorGizmoSpace: partial.editorGizmoSpace === 'local' ? 'local' : 'world',
    editorTranslateSnap: Number.isFinite(partial.editorTranslateSnap)
      ? Math.max(0.01, partial.editorTranslateSnap as number)
      : 0.25,
    editorRotateSnap: Number.isFinite(partial.editorRotateSnap)
      ? Math.max(0.1, partial.editorRotateSnap as number)
      : 15,
    editorScaleSnap: Number.isFinite(partial.editorScaleSnap)
      ? Math.max(0.01, partial.editorScaleSnap as number)
      : 0.1
  };
}

export function migrateSceneFileToLatest(input: unknown): SceneFileV2 {
  if (!isObject(input)) {
    throw new Error('Scene validation failed: root must be an object.');
  }

  const version = assertFiniteNumber(input.version, 'version');
  if (version === SCENE_FILE_VERSION) {
    return validateSceneFileV2(input);
  }

  if (version === SCENE_FILE_VERSION_V1) {
    const parsedV1 = validateSceneFileV1(input);
    return {
      schema: SCENE_FILE_SCHEMA,
      version: SCENE_FILE_VERSION,
      savedAt: parsedV1.savedAt,
      sceneName: parsedV1.sceneName,
      splatRef: parsedV1.splatRef,
      camera: parsedV1.camera,
      settings: createDefaultSceneSettings(parsedV1.settings),
      lights: parsedV1.lights.map((light) => migrateV1LightToV2(light))
    };
  }

  throw new Error(`Scene validation failed: unsupported version ${version}.`);
}

export function validateSceneFile(input: unknown): SceneFileV2 {
  return migrateSceneFileToLatest(input);
}

export function parseSceneFileJson(jsonText: string): SceneFileV2 {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Scene file is not valid JSON: ${detail}`);
  }

  return validateSceneFile(parsed);
}

export function createSceneFile(input: Omit<SceneFileV2, 'schema' | 'version' | 'savedAt'> & { savedAt?: string }): SceneFileV2 {
  const candidate: SceneFileV2 = {
    schema: SCENE_FILE_SCHEMA,
    version: SCENE_FILE_VERSION,
    savedAt: input.savedAt ?? new Date().toISOString(),
    sceneName: input.sceneName,
    splatRef: input.splatRef,
    camera: input.camera,
    settings: createDefaultSceneSettings(input.settings),
    lights: input.lights
  };

  return validateSceneFile(candidate);
}

export function stringifySceneFile(scene: SceneFileV2): string {
  return JSON.stringify(scene, null, 2);
}

export async function loadSceneFileFromUpload(file: File): Promise<SceneFileV2> {
  const text = await file.text();
  return parseSceneFileJson(text);
}

export function triggerSceneDownload(scene: SceneFileV2, sceneName?: string): void {
  const baseName = (sceneName ?? scene.sceneName ?? 'scene').trim() || 'scene';
  const safeName =
    baseName
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'scene';

  const blob = new Blob([stringifySceneFile(scene)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName}.sparkscene.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getLocalStorageOrThrow(): Storage {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is not available in this runtime.');
  }

  return localStorage;
}

function readSlotStoreByKey(storage: Storage, key: string): SlotStore {
  const raw = storage.getItem(key);
  if (!raw) {
    return { slots: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { slots: {} };
  }

  if (!isObject(parsed) || !isObject(parsed.slots)) {
    return { slots: {} };
  }

  const slots: Record<string, SceneFileV2> = {};
  for (const [name, value] of Object.entries(parsed.slots)) {
    try {
      slots[name] = migrateSceneFileToLatest(value);
    } catch {
      // ignore invalid slot entries
    }
  }

  return { slots };
}

function readSlotStore(): SlotStore {
  const storage = getLocalStorageOrThrow();
  const v2 = readSlotStoreByKey(storage, SCENE_SLOT_STORAGE_KEY);
  const v1 = readSlotStoreByKey(storage, SCENE_SLOT_STORAGE_KEY_V1);

  const merged: SlotStore = {
    slots: {
      ...v1.slots,
      ...v2.slots
    }
  };

  if (Object.keys(v1.slots).length > 0) {
    storage.setItem(SCENE_SLOT_STORAGE_KEY, JSON.stringify(merged));
  }

  return merged;
}

function writeSlotStore(store: SlotStore): void {
  const storage = getLocalStorageOrThrow();
  storage.setItem(SCENE_SLOT_STORAGE_KEY, JSON.stringify(store));
}

function normalizeSlotName(name: string): string {
  return name.trim();
}

export function listSceneSlotNames(): string[] {
  return Object.keys(readSlotStore().slots).sort((a, b) => a.localeCompare(b));
}

export function saveSceneSlot(name: string, scene: SceneFileV2): void {
  const slotName = normalizeSlotName(name);
  if (!slotName) {
    throw new Error('Scene slot name cannot be empty.');
  }

  const validated = validateSceneFile(scene);
  const store = readSlotStore();

  const isExisting = slotName in store.slots;
  const slotCount = Object.keys(store.slots).length;
  if (!isExisting && slotCount >= SCENE_SLOT_LIMIT) {
    throw new Error(`Cannot save scene slot: limit of ${SCENE_SLOT_LIMIT} reached.`);
  }

  store.slots[slotName] = validated;
  writeSlotStore(store);
}

export function loadSceneSlot(name: string): SceneFileV2 {
  const slotName = normalizeSlotName(name);
  if (!slotName) {
    throw new Error('Scene slot name cannot be empty.');
  }

  const store = readSlotStore();
  const scene = store.slots[slotName];
  if (!scene) {
    throw new Error(`Scene slot "${slotName}" not found.`);
  }

  return validateSceneFile(scene);
}

export function deleteSceneSlot(name: string): boolean {
  const slotName = normalizeSlotName(name);
  if (!slotName) {
    return false;
  }

  const store = readSlotStore();
  if (!(slotName in store.slots)) {
    return false;
  }

  delete store.slots[slotName];
  writeSlotStore(store);
  return true;
}
