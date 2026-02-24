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

// NEW PROXY ANIMATION
export class SceneManager {
  constructor({ container, eventBus, statusReporter }) {
    this.container = container;
    this.eventBus = eventBus;
    this.setStatus = statusReporter.setStatus;
    this.colliderMap = new Map();
    this.colliders = [];
    this.entities = [];
    this.voxelCollisionData = null;
    this.uiDispose = () => {};
    this.tempResolved = new THREE.Vector3();
  }

  async init() {
    this.sparkModule = await loadSparkModule();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#030712');

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
      setVoxelCollisionData: (data) => {
        this.voxelCollisionData = data;
      },
      resolveCameraMovement: (from, to, options) => this.resolveCameraMovement(from, to, options)
    };

    for (const entity of this.entities) {
      await entity.init(context);
    }

    this.uiDispose = bindUi(this.eventBus);
    this.resize();
    this.setStatus('SPARK 2.0 proxy-driven engine initialized.', 'success');
  }

  replaceColliders(owner, colliders) {
    const filtered = colliders.filter(Boolean);
    this.colliderMap.set(owner, filtered);

    this.colliders.length = 0;
    for (const list of this.colliderMap.values()) this.colliders.push(...list);
    for (const mesh of filtered) {
      const geometry = mesh.geometry;
      if (geometry?.computeBoundingBox && !geometry.boundingBox) geometry.computeBoundingBox();
    }
  }

  resolveCameraMovement(from, to, options) {
    if (!options.collisionEnabled) {
      return to;
    }
    const out = options.out ?? this.tempResolved;
    return resolveMovement({
      from,
      to,
      out,
      colliders: this.colliders,
      voxelData: this.voxelCollisionData,
      radius: options.radius,
      height: options.height
    });
  }

  update(delta) {
    for (const entity of this.entities) {
      entity.update(delta);
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose() {
    for (const entity of [...this.entities].reverse()) {
      entity.dispose();
    }
    this.uiDispose();
    this.renderer?.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost);
    this.sparkRenderer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove?.();
    this.eventBus.clear?.();
  }
}
