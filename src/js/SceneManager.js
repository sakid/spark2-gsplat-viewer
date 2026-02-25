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

function flattenMapValues(map, target) {
  target.length = 0;
  for (const list of map.values()) target.push(...list);
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
    this.uiReadyDispose();
    this.uiDispose();
    this.renderer?.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost);
    this.sparkRenderer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove?.();
    this.eventBus.clear?.();
  }
}
