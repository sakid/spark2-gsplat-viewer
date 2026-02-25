import * as THREE from 'three';
import { loadSparkModule } from '../spark/previewAdapter';
import { resolveCameraMovement as resolveMovement } from './internal/collisionResolver';
import { selectLodSplatCount } from './internal/lodPolicy';
import { bindUi } from './internal/uiBindings';
import { GeneralLights } from './sceneSubjects/GeneralLights';
import { CameraControls } from './sceneSubjects/CameraControls';
import { RenderQuality } from './sceneSubjects/RenderQuality';
import { EnvironmentSplat } from './sceneSubjects/EnvironmentSplat';
import { ButterflySplat } from './sceneSubjects/ButterflySplat';
import { DynoEffectSplat } from './sceneSubjects/DynoEffectSplat';
import { stampPrim } from '../ui/prim-utils.js';
import { createSceneFile, listSceneSlotNames } from './internal/sceneStateBridge.js';

function flattenMapValues(map, target) {
  target.length = 0;
  for (const list of map.values()) target.push(...list);
}

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

// NEW PROXY ANIMATION
export class SceneManager {
  constructor({ container, eventBus, statusReporter }) {
    this.container = container;
    this.eventBus = eventBus;
    this.setStatus = statusReporter.setStatus;
    this.colliderMap = new Map();
    this.colliders = [];
    this.dynamicColliderMap = new Map();
    this.dynamicColliders = [];
    this.entities = [];
    this.voxelCollisionData = null;
    this.uiDispose = () => {};
    this.uiReadyDispose = () => {};
    this.tempResolved = new THREE.Vector3();
    this.uiBound = false;
    this.sceneEventsPatched = false;
    this.uiRoot = null;
    this.selectedObjectUuid = null;
    this.selectionDispose = () => {};
  }

  async init() {
    this.sparkModule = await loadSparkModule();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#030712');
    this.installSceneEventHooks();

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(2, 1.5, 3);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;

    this.onContextLost = (event) => {
      event.preventDefault();
      this.setStatus('WebGL context was lost. Reload the page to recover rendering.', 'error');
    };

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false);
    this.container.appendChild(this.renderer.domElement);

    this.sparkRenderer = new this.sparkModule.NewSparkRenderer({
      renderer: this.renderer,
      enableLod: true,
      lodSplatCount: selectLodSplatCount(navigator.userAgent),
      maxStdDev: Math.sqrt(8),
      autoUpdate: true
    });

    this.scene.add(this.sparkRenderer);

    this.entities = [
      new GeneralLights(),
      new CameraControls(),
      new RenderQuality(),
      new EnvironmentSplat(),
      new ButterflySplat(),
      new DynoEffectSplat()
    ];

    const context = {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      sparkRenderer: this.sparkRenderer,
      sparkModule: this.sparkModule,
      eventBus: this.eventBus,
      setStatus: this.setStatus,
      replaceColliders: (owner, colliders) => this.replaceColliders(owner, colliders),
      setDynamicColliders: (owner, colliders) => this.setDynamicColliders(owner, colliders),
      clearDynamicColliders: (owner) => this.clearDynamicColliders(owner),
      setVoxelCollisionData: (data) => {
        this.voxelCollisionData = data;
      },
      resolveCameraMovement: (from, to, options) => this.resolveCameraMovement(from, to, options)
    };

    for (const entity of this.entities) {
      await entity.init(context);
    }

    const onSelectionChanged = (payload) => {
      this.selectedObjectUuid = payload?.object?.uuid ?? payload?.uuids?.[0] ?? null;
    };
    this.selectionDispose = this.eventBus.on?.('selectionChanged', onSelectionChanged)
      ?? (() => this.eventBus.off?.('selectionChanged', onSelectionChanged));

    this.bindUiWhenReady();
    this.resize();

    this.eventBus.emit('sceneLoaded', {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer
    });

    this.setStatus('SPARK 2.0 proxy-driven engine initialized.', 'success');
  }

  bindUiWhenReady() {
    const bind = (root = document) => {
      this.uiDispose();
      this.uiDispose = bindUi(this.eventBus, root);
      this.uiRoot = root;
      this.uiBound = true;
    };

    const onControlsReady = (payload) => {
      const root = payload?.root;
      if (root instanceof HTMLElement) {
        if (!root.querySelector('#panel')) return;
        bind(root);
        return;
      }
      if (document.getElementById('panel')) bind();
    };

    const onControlsDisposed = () => {
      this.uiDispose();
      this.uiDispose = () => {};
      this.uiRoot = null;
      this.uiBound = false;
    };

    this.uiReadyDispose();
    const disposers = [
      this.eventBus.on?.('ui:controlsReady', onControlsReady) ?? (() => this.eventBus.off?.('ui:controlsReady', onControlsReady)),
      this.eventBus.on?.('ui:controlsDisposed', onControlsDisposed) ?? (() => this.eventBus.off?.('ui:controlsDisposed', onControlsDisposed))
    ];
    this.uiReadyDispose = () => {
      for (const dispose of disposers.splice(0)) dispose();
    };

    if (document.getElementById('panel')) {
      bind();
    }
  }

  installSceneEventHooks() {
    if (!this.scene || this.sceneEventsPatched) return;

    const scene = this.scene;
    const originalAdd = scene.add.bind(scene);
    const originalRemove = scene.remove.bind(scene);

    scene.add = (...objects) => {
      const result = originalAdd(...objects);
      for (const object of objects) {
        if (!object) continue;
        stampPrim(object);
        this.eventBus.emit('objectAdded', { object });
        this.eventBus.emit('hierarchyChanged');
      }
      return result;
    };

    scene.remove = (...objects) => {
      const result = originalRemove(...objects);
      for (const object of objects) {
        if (!object) continue;
        this.eventBus.emit('objectRemoved', { object });
        this.eventBus.emit('hierarchyChanged');
      }
      return result;
    };

    this.sceneEventsPatched = true;
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera ?? null;
  }

  getCanvas() {
    return this.renderer?.domElement ?? null;
  }

  claimCanvasForDockview() {
    const canvas = this.getCanvas();
    canvas?.parentElement?.removeChild(canvas);
    return canvas;
  }

  onResize(width, height) {
    const safeWidth = Math.max(Number(width) || 1, 1);
    const safeHeight = Math.max(Number(height) || 1, 1);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
  }

  getControl(id) {
    const uiScoped = this.uiRoot?.querySelector?.(`#${id}`);
    if (uiScoped) return uiScoped;
    return document.getElementById(id);
  }

  setInputValue(id, value) {
    const input = this.getControl(id);
    if (!input) return;
    if ('value' in input) input.value = value;
  }

  setChecked(id, checked) {
    const input = this.getControl(id);
    if (!input || !('checked' in input)) return;
    input.checked = Boolean(checked);
  }

  readChecked(id, fallback = false) {
    const input = this.getControl(id);
    if (!input || !('checked' in input)) return fallback;
    return Boolean(input.checked);
  }

  readNumber(id, fallback = 0) {
    const input = this.getControl(id);
    if (!input || !('value' in input)) return fallback;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  readText(id, fallback = '') {
    const input = this.getControl(id);
    if (!input || !('value' in input)) return fallback;
    const value = String(input.value ?? '').trim();
    return value || fallback;
  }

  findEnvironmentEntity() {
    return this.entities.find((entity) => entity?.constructor?.name === 'EnvironmentSplat') ?? null;
  }

  collectSceneLights() {
    const lightTypeCount = new Map();
    const lights = [];

    this.scene?.traverse?.((node) => {
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

  applySceneLights(lights) {
    const runtimeByType = new Map([
      ['ambient', []],
      ['directional', []],
      ['point', []],
      ['spot', []]
    ]);

    this.scene?.traverse?.((node) => {
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

  buildSceneSnapshot() {
    const sceneName = this.readText('scene-name', 'Untitled Scene');
    const toneMapping = this.getControl('tone-mapping')?.value ?? 'ACESFilmic';
    const toneMappingExposure = this.readNumber('tone-mapping-exposure', 1);
    const splatLabel = this.getControl('splat-loaded-name')?.textContent ?? '';
    const loadMode = this.getControl('load-mode')?.value ?? 'spz';
    const splatRef = parseLoadedName(splatLabel);
    if (splatRef) splatRef.loadMode = loadMode;
    const environment = this.findEnvironmentEntity();
    const proxyRoot = environment?.proxyRoot ?? null;

    return createSceneFile({
      sceneName,
      splatRef,
      camera: {
        position: toTuple3(this.camera.position),
        quaternion: toTuple4(this.camera.quaternion),
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far
      },
      settings: {
        lodSplatCount: Number(this.sparkRenderer?.lodSplatCount ?? this.readNumber('lod-count', 1500000)),
        lodSplatScale: Number(this.sparkRenderer?.lodSplatScale ?? this.readNumber('lod-scale', 1)),
        improvedQuality: this.readChecked('quality-improved', false),
        sourceQualityMode: this.readChecked('quality-max-detail', false),
        flipUpDown: this.readChecked('flip-updown', false),
        flipLeftRight: this.readChecked('flip-leftright', false),
        proxyFlipUpDown: this.readChecked('proxy-flip-updown', false),
        proxyMirrorX: this.readChecked('proxy-mirror-x', false),
        proxyMirrorZ: this.readChecked('proxy-mirror-z', false),
        proxyUserPosition: proxyRoot ? toTuple3(proxyRoot.position) : [0, 0, 0],
        proxyUserQuaternion: proxyRoot ? toTuple4(proxyRoot.quaternion) : [0, 0, 0, 1],
        proxyUserScale: proxyRoot ? toTuple3(proxyRoot.scale) : [1, 1, 1],
        outlinerParents: [],
        selectedOutlinerId: this.selectedObjectUuid,
        physicallyCorrectLights: this.readChecked('physically-correct-lights', true),
        toneMapping,
        toneMappingExposure,
        shadowsEnabled: this.readChecked('shadows-enabled', true),
        lightEditMode: this.readChecked('light-edit-mode', false),
        showLightHelpers: this.readChecked('show-light-helpers', true),
        showLightGizmos: this.readChecked('show-light-gizmos', true),
        showMovementControls: this.readChecked('show-movement-controls', true),
        showLightingProbes: this.readChecked('show-lighting-probes', true),
        collisionEnabled: this.readChecked('collision-enabled', false),
        showProxyMesh: this.readChecked('show-proxy-mesh', false),
        voxelEditMode: this.readChecked('voxel-edit-mode', false)
      },
      lights: this.collectSceneLights()
    });
  }

  applySceneSnapshot(sceneFile) {
    if (!sceneFile) {
      throw new Error('Scene snapshot payload is required.');
    }

    const { camera, settings, sceneName, lights } = sceneFile;
    if (sceneName) this.setInputValue('scene-name', sceneName);

    if (camera) {
      this.camera.position.set(camera.position[0], camera.position[1], camera.position[2]);
      this.camera.quaternion.set(camera.quaternion[0], camera.quaternion[1], camera.quaternion[2], camera.quaternion[3]);
      this.camera.fov = camera.fov;
      this.camera.near = camera.near;
      this.camera.far = camera.far;
      this.camera.updateProjectionMatrix();
    }

    if (settings) {
      this.setInputValue('lod-count', String(settings.lodSplatCount));
      this.setInputValue('lod-scale', String(settings.lodSplatScale));
      this.setChecked('quality-improved', settings.improvedQuality);
      this.setChecked('quality-max-detail', settings.sourceQualityMode);
      this.setChecked('flip-updown', settings.flipUpDown);
      this.setChecked('flip-leftright', settings.flipLeftRight);
      this.setChecked('proxy-flip-updown', settings.proxyFlipUpDown);
      this.setChecked('proxy-mirror-x', settings.proxyMirrorX);
      this.setChecked('proxy-mirror-z', settings.proxyMirrorZ);
      this.setChecked('show-proxy-mesh', settings.showProxyMesh);
      this.setChecked('collision-enabled', settings.collisionEnabled);
      this.setChecked('voxel-edit-mode', settings.voxelEditMode);
      this.setChecked('light-edit-mode', settings.lightEditMode);
      this.setChecked('show-light-helpers', settings.showLightHelpers);
      this.setChecked('show-light-gizmos', settings.showLightGizmos);
      this.setChecked('show-movement-controls', settings.showMovementControls);
      this.setChecked('show-lighting-probes', settings.showLightingProbes);
      this.setChecked('physically-correct-lights', settings.physicallyCorrectLights);
      this.setChecked('shadows-enabled', settings.shadowsEnabled);
      this.setInputValue('tone-mapping', settings.toneMapping);
      this.setInputValue('tone-mapping-exposure', String(settings.toneMappingExposure));
    }

    this.applySceneLights(lights);

    if (settings) {
      this.eventBus.emit('environment:flipUpDown', Boolean(settings.flipUpDown));
      this.eventBus.emit('environment:flipLeftRight', Boolean(settings.flipLeftRight));
      this.eventBus.emit('environment:proxyFlipUpDown', Boolean(settings.proxyFlipUpDown));
      this.eventBus.emit('environment:proxyMirrorX', Boolean(settings.proxyMirrorX));
      this.eventBus.emit('environment:proxyMirrorZ', Boolean(settings.proxyMirrorZ));
      this.eventBus.emit('environment:showProxy', Boolean(settings.showProxyMesh));
      this.eventBus.emit('controls:collision', Boolean(settings.collisionEnabled));
      this.eventBus.emit('quality:improved', Boolean(settings.improvedQuality));
      this.eventBus.emit('quality:maxDetail', Boolean(settings.sourceQualityMode));
      this.eventBus.emit('lights:showHelpers', settings.showLightHelpers !== false);
      this.eventBus.emit('lights:showGizmos', settings.showLightGizmos !== false);
      this.eventBus.emit('lights:showMovementControls', settings.showMovementControls !== false);
      this.eventBus.emit('lights:showProbes', settings.showLightingProbes !== false);
      this.eventBus.emit('lights:rendererSettings', {
        physicallyCorrectLights: settings.physicallyCorrectLights !== false,
        shadowsEnabled: settings.shadowsEnabled !== false,
        toneMapping: settings.toneMapping ?? 'ACESFilmic',
        toneMappingExposure: Number(settings.toneMappingExposure ?? 1)
      });
      this.eventBus.emit('lights:editMode', Boolean(settings.lightEditMode));
      this.eventBus.emit('environment:voxelEditMode', Boolean(settings.voxelEditMode));
    }

    if (settings?.selectedOutlinerId) {
      const selectedObject = this.scene?.getObjectByProperty?.('uuid', settings.selectedOutlinerId) ?? null;
      if (selectedObject) {
        this.eventBus.emit('selectionChanged', {
          uuids: [selectedObject.uuid],
          object: selectedObject
        });
      }
    }
  }

  listSlotNames() {
    return listSceneSlotNames();
  }

  replaceColliders(owner, colliders) {
    const filtered = colliders.filter(Boolean);
    this.colliderMap.set(owner, filtered);
    flattenMapValues(this.colliderMap, this.colliders);
    for (const mesh of filtered) {
      const geometry = mesh.geometry;
      if (geometry?.computeBoundingBox && !geometry.boundingBox) geometry.computeBoundingBox();
    }
  }

  setDynamicColliders(owner, colliders) {
    this.dynamicColliderMap.set(owner, Array.isArray(colliders) ? colliders : []);
    flattenMapValues(this.dynamicColliderMap, this.dynamicColliders);
  }

  clearDynamicColliders(owner) {
    this.dynamicColliderMap.delete(owner);
    flattenMapValues(this.dynamicColliderMap, this.dynamicColliders);
  }

  resolveCameraMovement(from, to, options) {
    if (!options.collisionEnabled) return to;
    const out = options.out ?? this.tempResolved;
    return resolveMovement({
      from,
      to,
      out,
      colliders: this.colliders,
      dynamicColliders: this.dynamicColliders,
      voxelData: this.voxelCollisionData,
      radius: options.radius,
      height: options.height
    });
  }

  update(delta) {
    for (const entity of this.entities) entity.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.onResize(width, height);
  }

  dispose() {
    for (const entity of [...this.entities].reverse()) entity.dispose();
    this.selectionDispose?.();
    this.uiReadyDispose();
    this.uiDispose();
    this.renderer?.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost);
    this.sparkRenderer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove?.();
    this.eventBus.clear?.();
  }
}
