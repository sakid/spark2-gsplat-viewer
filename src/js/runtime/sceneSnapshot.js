import * as THREE from 'three';
import { createSceneFile } from '../internal/sceneStateBridge.js';
import { getControl, readChecked, readNumber, readText, setChecked, setInputValue } from './uiControls.js';

function toTuple3(vector) {
  return [vector.x, vector.y, vector.z];
}

function toTuple4(quaternion) {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function parseLoadedName(raw) {
  if (!raw) return null;
  const normalized = String(raw).replace(/^Loaded:\s*/i, '').trim();
  if (!normalized || normalized.toLowerCase() === 'none') return null;
  const ext = normalized.split('.').pop()?.toLowerCase() ?? '';
  return {
    name: normalized,
    ext,
    loadMode: 'spz'
  };
}

function findEnvironmentEntity(state) {
  return state.entities.find((entity) => entity?.constructor?.name === 'EnvironmentSplat') ?? null;
}

export function collectSceneLights(scene) {
  const lightTypeCount = new Map();
  const lights = [];

  scene?.traverse?.((node) => {
    if (!node?.isLight) return;
    const type =
      node.isAmbientLight ? 'ambient' :
      node.isDirectionalLight ? 'directional' :
      node.isPointLight ? 'point' :
      node.isSpotLight ? 'spot' :
      null;
    if (!type) return;

    const index = lightTypeCount.get(type) ?? 0;
    lightTypeCount.set(type, index + 1);

    const base = {
      id: node.uuid || `${type}-${index}`,
      type,
      name: node.name || `${type}-${index + 1}`,
      enabled: node.visible !== false,
      color: `#${node.color?.getHexString?.() ?? 'ffffff'}`,
      intensity: Number(node.intensity ?? 1)
    };

    if (type === 'ambient') {
      lights.push(base);
      return;
    }

    if (type === 'directional') {
      lights.push({
        ...base,
        position: toTuple3(node.position),
        target: toTuple3(node.target?.position ?? new THREE.Vector3()),
        castShadow: Boolean(node.castShadow),
        shadowMapSize: Number(node.shadow?.mapSize?.x ?? 1024),
        shadowBias: Number(node.shadow?.bias ?? -0.0005),
        shadowNormalBias: Number(node.shadow?.normalBias ?? 0.02)
      });
      return;
    }

    if (type === 'point') {
      lights.push({
        ...base,
        position: toTuple3(node.position),
        distance: Number(node.distance ?? 0),
        decay: Number(node.decay ?? 2),
        castShadow: Boolean(node.castShadow),
        shadowMapSize: Number(node.shadow?.mapSize?.x ?? 1024),
        shadowBias: Number(node.shadow?.bias ?? -0.0005),
        shadowNormalBias: Number(node.shadow?.normalBias ?? 0.02)
      });
      return;
    }

    lights.push({
      ...base,
      position: toTuple3(node.position),
      target: toTuple3(node.target?.position ?? new THREE.Vector3()),
      distance: Number(node.distance ?? 0),
      decay: Number(node.decay ?? 2),
      angle: Number(node.angle ?? Math.PI / 3),
      penumbra: Number(node.penumbra ?? 0),
      castShadow: Boolean(node.castShadow),
      shadowMapSize: Number(node.shadow?.mapSize?.x ?? 1024),
      shadowBias: Number(node.shadow?.bias ?? -0.0005),
      shadowNormalBias: Number(node.shadow?.normalBias ?? 0.02)
    });
  });

  return lights;
}

export function applySceneLights(scene, lights) {
  const runtimeByType = new Map([
    ['ambient', []],
    ['directional', []],
    ['point', []],
    ['spot', []]
  ]);

  scene?.traverse?.((node) => {
    if (!node?.isLight) return;
    if (node.isAmbientLight) runtimeByType.get('ambient').push(node);
    else if (node.isDirectionalLight) runtimeByType.get('directional').push(node);
    else if (node.isPointLight) runtimeByType.get('point').push(node);
    else if (node.isSpotLight) runtimeByType.get('spot').push(node);
  });

  const consumeLight = (type) => {
    const list = runtimeByType.get(type);
    if (!list?.length) return null;
    return list.shift();
  };

  for (const light of Array.isArray(lights) ? lights : []) {
    const target = consumeLight(light?.type);
    if (!target) continue;
    if (light.color) target.color?.set?.(light.color);
    if (Number.isFinite(light.intensity)) target.intensity = light.intensity;
    target.visible = light.enabled !== false;

    if (Array.isArray(light.position) && light.position.length === 3) {
      target.position.set(light.position[0], light.position[1], light.position[2]);
    }

    if (target.isDirectionalLight || target.isSpotLight) {
      if (Array.isArray(light.target) && light.target.length === 3) {
        target.target.position.set(light.target[0], light.target[1], light.target[2]);
      }
    }

    if (target.isPointLight || target.isSpotLight) {
      if (Number.isFinite(light.distance)) target.distance = light.distance;
      if (Number.isFinite(light.decay)) target.decay = light.decay;
    }

    if (target.isSpotLight) {
      if (Number.isFinite(light.angle)) target.angle = light.angle;
      if (Number.isFinite(light.penumbra)) target.penumbra = light.penumbra;
    }

    if ('castShadow' in light) target.castShadow = Boolean(light.castShadow);
    if (target.shadow) {
      if (Number.isFinite(light.shadowMapSize)) target.shadow.mapSize.set(light.shadowMapSize, light.shadowMapSize);
      if (Number.isFinite(light.shadowBias)) target.shadow.bias = light.shadowBias;
      if (Number.isFinite(light.shadowNormalBias)) target.shadow.normalBias = light.shadowNormalBias;
    }
  }
}

export function buildSceneSnapshot(state) {
  const sceneName = readText(state, 'scene-name', 'Untitled Scene');
  const toneMapping = getControl(state, 'tone-mapping')?.value ?? 'ACESFilmic';
  const toneMappingExposure = readNumber(state, 'tone-mapping-exposure', 1);
  const splatLabel = getControl(state, 'splat-loaded-name')?.textContent ?? '';
  const loadMode = getControl(state, 'load-mode')?.value ?? 'spz';
  const splatRef = parseLoadedName(splatLabel);
  if (splatRef) splatRef.loadMode = loadMode;
  const environment = findEnvironmentEntity(state);
  const proxyRoot = environment?.proxyRoot ?? null;

  return createSceneFile({
    sceneName,
    splatRef,
    camera: {
      position: toTuple3(state.camera.position),
      quaternion: toTuple4(state.camera.quaternion),
      fov: state.camera.fov,
      near: state.camera.near,
      far: state.camera.far
    },
    settings: {
      lodSplatCount: Number(state.sparkRenderer?.lodSplatCount ?? readNumber(state, 'lod-count', 1500000)),
      lodSplatScale: Number(state.sparkRenderer?.lodSplatScale ?? readNumber(state, 'lod-scale', 1)),
      improvedQuality: readChecked(state, 'quality-improved', false),
      sourceQualityMode: readChecked(state, 'quality-max-detail', false),
      flipUpDown: readChecked(state, 'flip-updown', false),
      flipLeftRight: readChecked(state, 'flip-leftright', false),
      proxyFlipUpDown: readChecked(state, 'proxy-flip-updown', false),
      proxyMirrorX: readChecked(state, 'proxy-mirror-x', false),
      proxyMirrorZ: readChecked(state, 'proxy-mirror-z', false),
      proxyUserPosition: proxyRoot ? toTuple3(proxyRoot.position) : [0, 0, 0],
      proxyUserQuaternion: proxyRoot ? toTuple4(proxyRoot.quaternion) : [0, 0, 0, 1],
      proxyUserScale: proxyRoot ? toTuple3(proxyRoot.scale) : [1, 1, 1],
      outlinerParents: [],
      selectedOutlinerId: state.selectedObjectUuid,
      physicallyCorrectLights: readChecked(state, 'physically-correct-lights', true),
      toneMapping,
      toneMappingExposure,
      shadowsEnabled: readChecked(state, 'shadows-enabled', true),
      lightEditMode: readChecked(state, 'light-edit-mode', false),
      showLightHelpers: readChecked(state, 'show-light-helpers', true),
      showLightGizmos: readChecked(state, 'show-light-gizmos', true),
      showMovementControls: readChecked(state, 'show-movement-controls', true),
      showLightingProbes: readChecked(state, 'show-lighting-probes', true),
      collisionEnabled: readChecked(state, 'collision-enabled', false),
      showProxyMesh: readChecked(state, 'show-proxy-mesh', false),
      voxelEditMode: readChecked(state, 'voxel-edit-mode', false)
    },
    lights: collectSceneLights(state.scene)
  });
}

export function applySceneSnapshot(state, sceneFile) {
  if (!sceneFile) {
    throw new Error('Scene snapshot payload is required.');
  }

  const { camera, settings, sceneName, lights } = sceneFile;
  if (sceneName) setInputValue(state, 'scene-name', sceneName);

  if (camera) {
    state.camera.position.set(camera.position[0], camera.position[1], camera.position[2]);
    state.camera.quaternion.set(camera.quaternion[0], camera.quaternion[1], camera.quaternion[2], camera.quaternion[3]);
    state.camera.fov = camera.fov;
    state.camera.near = camera.near;
    state.camera.far = camera.far;
    state.camera.updateProjectionMatrix();
  }

  if (settings) {
    setInputValue(state, 'lod-count', String(settings.lodSplatCount));
    setInputValue(state, 'lod-scale', String(settings.lodSplatScale));
    setChecked(state, 'quality-improved', settings.improvedQuality);
    setChecked(state, 'quality-max-detail', settings.sourceQualityMode);
    setChecked(state, 'flip-updown', settings.flipUpDown);
    setChecked(state, 'flip-leftright', settings.flipLeftRight);
    setChecked(state, 'proxy-flip-updown', settings.proxyFlipUpDown);
    setChecked(state, 'proxy-mirror-x', settings.proxyMirrorX);
    setChecked(state, 'proxy-mirror-z', settings.proxyMirrorZ);
    setChecked(state, 'show-proxy-mesh', settings.showProxyMesh);
    setChecked(state, 'collision-enabled', settings.collisionEnabled);
    setChecked(state, 'voxel-edit-mode', settings.voxelEditMode);
    setChecked(state, 'light-edit-mode', settings.lightEditMode);
    setChecked(state, 'show-light-helpers', settings.showLightHelpers);
    setChecked(state, 'show-light-gizmos', settings.showLightGizmos);
    setChecked(state, 'show-movement-controls', settings.showMovementControls);
    setChecked(state, 'show-lighting-probes', settings.showLightingProbes);
    setChecked(state, 'physically-correct-lights', settings.physicallyCorrectLights);
    setChecked(state, 'shadows-enabled', settings.shadowsEnabled);
    setInputValue(state, 'tone-mapping', settings.toneMapping);
    setInputValue(state, 'tone-mapping-exposure', String(settings.toneMappingExposure));
  }

  applySceneLights(state.scene, lights);

  if (settings) {
    state.eventBus.emit('environment:flipUpDown', Boolean(settings.flipUpDown));
    state.eventBus.emit('environment:flipLeftRight', Boolean(settings.flipLeftRight));
    state.eventBus.emit('environment:proxyFlipUpDown', Boolean(settings.proxyFlipUpDown));
    state.eventBus.emit('environment:proxyMirrorX', Boolean(settings.proxyMirrorX));
    state.eventBus.emit('environment:proxyMirrorZ', Boolean(settings.proxyMirrorZ));
    state.eventBus.emit('environment:showProxy', Boolean(settings.showProxyMesh));
    state.eventBus.emit('controls:collision', Boolean(settings.collisionEnabled));
    state.eventBus.emit('quality:improved', Boolean(settings.improvedQuality));
    state.eventBus.emit('quality:maxDetail', Boolean(settings.sourceQualityMode));
    state.eventBus.emit('lights:showHelpers', settings.showLightHelpers !== false);
    state.eventBus.emit('lights:showGizmos', settings.showLightGizmos !== false);
    state.eventBus.emit('lights:showMovementControls', settings.showMovementControls !== false);
    state.eventBus.emit('lights:showProbes', settings.showLightingProbes !== false);
    state.eventBus.emit('lights:rendererSettings', {
      physicallyCorrectLights: settings.physicallyCorrectLights !== false,
      shadowsEnabled: settings.shadowsEnabled !== false,
      toneMapping: settings.toneMapping ?? 'ACESFilmic',
      toneMappingExposure: Number(settings.toneMappingExposure ?? 1)
    });
    state.eventBus.emit('lights:editMode', Boolean(settings.lightEditMode));
    state.eventBus.emit('environment:voxelEditMode', Boolean(settings.voxelEditMode));
  }

  if (settings?.selectedOutlinerId) {
    const selectedObject = state.scene?.getObjectByProperty?.('uuid', settings.selectedOutlinerId) ?? null;
    if (selectedObject) {
      state.eventBus.emit('selectionChanged', {
        uuids: [selectedObject.uuid],
        object: selectedObject
      });
    }
  }
}

