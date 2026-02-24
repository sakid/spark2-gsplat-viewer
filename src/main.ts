import './styles.css';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { SplatMeshLike } from './spark/previewAdapter';
import {
  createDefaultSceneSettings,
  createSceneFile,
  deleteSceneSlot,
  listSceneSlotNames,
  loadSceneFileFromUpload,
  loadSceneSlot,
  saveSceneSlot,
  triggerSceneDownload,
  type SceneCameraV1,
  type SceneFileV2,
  type SceneLightV2,
  type SceneSplatRefV1,
  type SceneToneMapping
} from './scene/sceneState';
import { loadSparkModule } from './spark/previewAdapter';
import {
  applySceneSettingsDefaults,
  canUseTargetSubmode,
  cloneSceneLights,
  createDefaultSceneLight,
  createLightReconcileState,
  defaultLightsToSceneLights,
  generateLightId,
  getAdaptiveSnapForDistance,
  getLightNode,
  getLightObjectForGizmo,
  hasMatchingSplatRef,
  reconcileSceneLights,
  threeNodeToSceneLight,
  type LightGizmoSubmode
} from './viewer/lights';
import { createPanel, type OutlinerItem, type RendererLightingSettings } from './ui/panel';
import { fitCameraToObject } from './viewer/camera';
import { initViewer } from './viewer/initScene';
import { loadFromFile } from './viewer/loadSplat';
import { generateVoxelMesh } from './viewer/voxelizer';
import { VoxelEditState } from './viewer/voxelEditState';
import type { SparkModuleLike } from './spark/previewAdapter';
import { createExportableVoxelMesh, exportObjectAsGlb, exportObjectsAsGlb } from './export/gltfExport';

declare global {
  interface Window {
    __SPARK2_VIEWER__?: ReturnType<typeof initViewer>;
  }
}

interface AppState {
  sceneName: string;
  lodSplatScale: number;
  lodSplatCount: number;
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
}

function getExtension(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ext ?? '';
}

const MAX_PROXY_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB hard stop
const MAX_OBJ_PROXY_FILE_BYTES = 512 * 1024 * 1024; // 512 MiB practical browser limit for OBJ

function toSceneCamera(camera: THREE.PerspectiveCamera): SceneCameraV1 {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    fov: camera.fov,
    near: camera.near,
    far: camera.far
  };
}

function applySceneCamera(camera: THREE.PerspectiveCamera, sceneCamera: SceneCameraV1): void {
  camera.position.set(...sceneCamera.position);
  camera.quaternion.set(...sceneCamera.quaternion);
  camera.fov = sceneCamera.fov;
  camera.near = sceneCamera.near;
  camera.far = sceneCamera.far;
  camera.updateProjectionMatrix();
}

function createLightingProbeRig(): THREE.Group {
  const probeRoot = new THREE.Group();
  probeRoot.name = 'lighting-probe-rig';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: '#3f3f46', roughness: 0.95, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.85;
  ground.receiveShadow = true;
  probeRoot.add(ground);

  const matte = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 20),
    new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9, metalness: 0.05 })
  );
  matte.position.set(-0.85, -0.4, 0);
  matte.castShadow = true;
  matte.receiveShadow = true;
  probeRoot.add(matte);

  const glossy = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 24, 20),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.12, metalness: 0.9 })
  );
  glossy.position.set(0.85, -0.4, 0.15);
  glossy.castShadow = true;
  glossy.receiveShadow = true;
  probeRoot.add(glossy);

  return probeRoot;
}

function adaptiveTranslationSnap(camera: THREE.Camera, object: THREE.Object3D): number {
  const position = new THREE.Vector3();
  object.getWorldPosition(position);
  const distance = camera.position.distanceTo(position);
  return getAdaptiveSnapForDistance(distance);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

async function bootstrap(): Promise<void> {
  const panel = createPanel();
  panel.setStatus('Loading Spark preview artifact...', 'info');

  const params = new URLSearchParams(window.location.search);
  const noSpark = params.get('noSpark') === '1';

  const createNoSparkModule = (): SparkModuleLike => {
    const moduleObject = {
      NewSparkRenderer: class DummySparkRenderer extends THREE.Object3D {
        enableLod = true;
        lodSplatCount = 0;
        lodSplatScale = 1;
        dispose() {}
      },
      SplatMesh: class DummySplatMesh extends THREE.Object3D {},
      SplatEdit: class DummySplatEdit extends THREE.Object3D {
        addSdf() {}
        removeSdf() {}
      },
      SplatEditSdf: class DummySplatEditSdf extends THREE.Object3D {
        invert = false;
        opacity = 1;
        color = new THREE.Color(0xffffff);
        displace = new THREE.Vector3();
        radius = 0;
        constructor(_options = {}) {
          super();
        }
      },
      SplatModifier: class DummySplatModifier {
        modifier: unknown;
        constructor(modifier: unknown) {
          this.modifier = modifier;
        }
      },
      transcodeSpz: async () => ({ fileBytes: new Uint8Array() })
    };

    return moduleObject as unknown as SparkModuleLike;
  };

  const sparkModule: SparkModuleLike = noSpark ? createNoSparkModule() : await loadSparkModule();

  panel.setStatus(
    noSpark ? 'NoSpark mode active (collision test harness).' : 'Spark preview loaded. Lighting editor + scene save/load ready.',
    'success'
  );

  const container = document.getElementById('scene-container');
  if (!(container instanceof HTMLElement)) {
    throw new Error('Missing #scene-container element.');
  }

  const viewer = initViewer(container, sparkModule, (message) => {
    panel.setStatus(message, 'error');
  });

  if (import.meta.env.DEV || noSpark) {
    window.__SPARK2_VIEWER__ = viewer;
  }

  const lightHelperRoot = new THREE.Group();
  lightHelperRoot.name = 'light-helper-root';
  viewer.scene.add(lightHelperRoot);

  const lightMarkerRoot = new THREE.Group();
  lightMarkerRoot.name = 'light-marker-root';
  viewer.scene.add(lightMarkerRoot);

  const probeRoot = createLightingProbeRig();
  viewer.scene.add(probeRoot);

  const lightTransform = new TransformControls(viewer.camera, viewer.renderer.domElement);
  const lightTransformHelper = lightTransform.getHelper();
  lightTransformHelper.visible = false;
  lightTransform.setMode('translate');
  viewer.scene.add(lightTransformHelper);

  const lightReconcileState = createLightReconcileState();

  let currentMesh: SplatMeshLike | null = null;
  let currentSplatRef: SceneSplatRefV1 | null = null;
  let pendingSplatRef: SceneSplatRefV1 | null = null;
  let sceneLights: SceneLightV2[] = defaultLightsToSceneLights(viewer.defaultLights);

  const rendererSettings = panel.getRendererLightingSettings();
  const defaults = createDefaultSceneSettings({
    lodSplatScale: panel.getLodScaleValue(),
    lodSplatCount: panel.getLodCountValue(),
    improvedQuality: panel.isImprovedQualityEnabled(),
    sourceQualityMode: panel.isMaxDetailEnabled(),
    flipUpDown: panel.isFlipUpDownEnabled(),
    flipLeftRight: panel.isFlipLeftRightEnabled(),
    proxyFlipUpDown: panel.isProxyFlipUpDownEnabled(),
    proxyMirrorX: panel.isProxyMirrorXEnabled(),
    proxyMirrorZ: panel.isProxyMirrorZEnabled(),
    physicallyCorrectLights: rendererSettings.physicallyCorrectLights,
    toneMapping: rendererSettings.toneMapping,
    toneMappingExposure: rendererSettings.toneMappingExposure,
    shadowsEnabled: rendererSettings.shadowsEnabled,
    lightEditMode: panel.isLightEditModeEnabled(),
    showLightHelpers: panel.isLightHelpersEnabled(),
    showLightGizmos: panel.isLightGizmosEnabled(),
    showMovementControls: panel.isMovementControlsEnabled(),
    showLightingProbes: panel.isLightingProbeEnabled(),
    collisionEnabled: panel.isCollisionEnabled(),
    showProxyMesh: panel.isShowProxyMeshEnabled(),
    voxelEditMode: panel.isVoxelEditMode()
  });

  const appState: AppState = {
    sceneName: panel.getSceneName() || 'Untitled Scene',
    ...defaults
  };

  panel.setRendererLightingSettings({
    physicallyCorrectLights: appState.physicallyCorrectLights,
    toneMapping: appState.toneMapping,
    toneMappingExposure: appState.toneMappingExposure,
    shadowsEnabled: appState.shadowsEnabled
  });
  panel.setLightEditModeEnabled(appState.lightEditMode);
  panel.setLightHelpersEnabled(appState.showLightHelpers);
  panel.setLightGizmosEnabled(appState.showLightGizmos);
  panel.setMovementControlsEnabled(appState.showMovementControls);
  panel.setLightingProbeEnabled(appState.showLightingProbes);
  panel.setCollisionEnabled(appState.collisionEnabled);
  panel.setShowProxyMeshEnabled(appState.showProxyMesh);
  panel.setProxyFlipUpDownEnabled(appState.proxyFlipUpDown);
  panel.setProxyMirrorXEnabled(appState.proxyMirrorX);
  panel.setProxyMirrorZEnabled(appState.proxyMirrorZ);
  viewer.setCollisionEnabled(appState.collisionEnabled);

  const applyProxyVisibility = (show: boolean, options?: { silentNoProxy?: boolean; reportBlocked?: boolean }): boolean => {
    const result = viewer.setShowProxyMesh(show);
    if (!result.applied) {
      if (show) {
        appState.showProxyMesh = false;
        panel.setShowProxyMeshEnabled(false);
      }
      if (
        options?.reportBlocked &&
        result.reason &&
        (!options?.silentNoProxy || result.reason !== 'No proxy mesh is loaded.')
      ) {
        panel.setStatus(`Proxy mesh visibility blocked: ${result.reason}`, 'warning');
      }
      return false;
    }
    return true;
  };

  applyProxyVisibility(appState.showProxyMesh, { silentNoProxy: true });

  let selectedLightId: string | null = null;
  let activeGizmoLightId: string | null = null;
  let gizmoSubmode: LightGizmoSubmode = panel.getLightGizmoSubmode();
  let proxyEditMode = panel.isProxyEditModeEnabled();
  let proxyGizmoMode = panel.getProxyGizmoMode();
  let outlinerEditMode = panel.isOutlinerEditModeEnabled();
  let outlinerGizmoMode = panel.getOutlinerGizmoMode();
  let selectedOutlinerId: string | null = null;
  panel.setOutlinerEditModeEnabled(outlinerEditMode);
  panel.setOutlinerGizmoMode(outlinerGizmoMode);

  type OutlinerRuntimeItem = {
    id: string;
    object: THREE.Object3D;
    editable: boolean;
    exportable: boolean;
    canReparent: boolean;
    setVisible?: (visible: boolean) => void;
  };
  const outlinerRuntime = new Map<string, OutlinerRuntimeItem>();
  const outlinerParentMap = new Map<string, string | null>();

  const workingBounds = new THREE.Box3();
  const workingProxyBounds = new THREE.Box3();
  const workingCenter = new THREE.Vector3();
  const workingProxyCenter = new THREE.Vector3();
  const workingSize = new THREE.Vector3();
  const workingVecA = new THREE.Vector3();
  const workingVecB = new THREE.Vector3();
  const workingVecC = new THREE.Vector3();
  const lightingColor = new THREE.Color();
  const flipQuat = new THREE.Quaternion();
  const baseQuatTemp = new THREE.Quaternion();
  const unitX = new THREE.Vector3(1, 0, 0);
  const unitY = new THREE.Vector3(0, 1, 0);
  const unitZ = new THREE.Vector3(0, 0, 1);
  const proxyCalibrationQuat = new THREE.Quaternion();
  const proxyCalibrationEuler = new THREE.Euler(0, 0, 0, 'XYZ');
  let proxyCalibrationScale = 1;
  let proxyCalibrationLabel = '';
  let proxyKind: 'none' | 'external' | 'voxel' = 'none';
  const proxyRootBounds = new THREE.Box3();
  const proxyRootSize = new THREE.Vector3();
  const proxyCandidateSize = new THREE.Vector3();
  const proxyRootHalf = new THREE.Vector3();
  const proxyRotHalf = new THREE.Vector3();
  const proxySavedPos = new THREE.Vector3();
  const proxySavedScale = new THREE.Vector3();
  const proxySavedQuat = new THREE.Quaternion();
  const rotMat4 = new THREE.Matrix4();
  const rotMat3 = new THREE.Matrix3();
  const splatSizeTemp = new THREE.Vector3();
  const proxyAutoPos = new THREE.Vector3();
  const proxyAutoScale = new THREE.Vector3();
  const proxyAutoMat = new THREE.Matrix4();
  const proxyDeltaMat = new THREE.Matrix4();
  const proxyFinalMat = new THREE.Matrix4();
  const proxyInvAutoMat = new THREE.Matrix4();
  const proxyCurrentMat = new THREE.Matrix4();
  const proxyDeltaPos = new THREE.Vector3();
  const proxyDeltaQuat = new THREE.Quaternion();
  const proxyDeltaScale = new THREE.Vector3();
  const proxyDecompPos = new THREE.Vector3();
  const proxyDecompQuat = new THREE.Quaternion();
  const proxyDecompScale = new THREE.Vector3();
  const reparentWorldPos = new THREE.Vector3();
  const reparentWorldQuat = new THREE.Quaternion();
  const reparentWorldScale = new THREE.Vector3();
  const reparentInvParent = new THREE.Matrix4();
  const reparentLocalMatrix = new THREE.Matrix4();

  type BaseTransform = {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3; // absolute scale (positive)
  };

  let splatBaseTransform: BaseTransform | null = null;
  let proxyBaseTransform: BaseTransform | null = null;
  const proxyAlignOffset = new THREE.Vector3();
  // User-authored delta applied on top of the auto-alignment transform for the proxy.
  proxyDeltaPos.fromArray(appState.proxyUserPosition);
  proxyDeltaQuat.set(...appState.proxyUserQuaternion);
  proxyDeltaScale.fromArray(appState.proxyUserScale);

  const proxyOrientationCandidates: Array<{ quat: THREE.Quaternion; label: string }> = (() => {
    const steps = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const candidates: Array<{ quat: THREE.Quaternion; label: string }> = [];
    const seen = new Set<string>();
    for (const rx of steps) {
      for (const ry of steps) {
        for (const rz of steps) {
          proxyCalibrationEuler.set(rx, ry, rz, 'XYZ');
          const q = new THREE.Quaternion().setFromEuler(proxyCalibrationEuler);
          const label = `rx${Math.round((rx * 180) / Math.PI)}_ry${Math.round((ry * 180) / Math.PI)}_rz${Math.round((rz * 180) / Math.PI)}`;
          // De-dupe (some combinations can collapse if gimbal aligned).
          const key = `${q.x.toFixed(6)},${q.y.toFixed(6)},${q.z.toFixed(6)},${q.w.toFixed(6)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ quat: q, label });
        }
      }
    }
    return candidates;
  })();

  const captureBaseTransform = (obj: THREE.Object3D): BaseTransform => {
    const scaleX = Math.abs(obj.scale.x) || 1;
    const scaleY = Math.abs(obj.scale.y) || 1;
    const scaleZ = Math.abs(obj.scale.z) || 1;
    return {
      position: obj.position.clone(),
      quaternion: obj.quaternion.clone(),
      scale: new THREE.Vector3(scaleX, scaleY, scaleZ)
    };
  };

  const applyFlipTransform = (obj: THREE.Object3D, base: BaseTransform, alignOffset?: THREE.Vector3): void => {
    baseQuatTemp.copy(base.quaternion);
    if (appState.flipUpDown) {
      flipQuat.setFromAxisAngle(unitX, Math.PI);
      baseQuatTemp.multiply(flipQuat);
    }
    obj.quaternion.copy(baseQuatTemp);

    obj.scale.copy(base.scale);
    if (appState.flipLeftRight) {
      obj.scale.x = -obj.scale.x;
    }

    obj.position.copy(base.position);
    if (alignOffset) {
      obj.position.add(alignOffset);
    }

    obj.updateMatrixWorld(true);
  };

  const computeAutoProxyTransform = (base: BaseTransform, alignOffset?: THREE.Vector3): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } => {
    baseQuatTemp.copy(base.quaternion);
    if (proxyKind === 'external') {
      baseQuatTemp.multiply(proxyCalibrationQuat);
    }
    if (appState.proxyFlipUpDown) {
      flipQuat.setFromAxisAngle(unitX, Math.PI);
      baseQuatTemp.multiply(flipQuat);
    }
    if (appState.flipUpDown) {
      flipQuat.setFromAxisAngle(unitX, Math.PI);
      baseQuatTemp.multiply(flipQuat);
    }

    proxyAutoScale.copy(base.scale);
    if (proxyKind === 'external') {
      proxyAutoScale.multiplyScalar(proxyCalibrationScale);
    }
    if (appState.proxyMirrorX) {
      proxyAutoScale.x = -proxyAutoScale.x;
    }
    if (appState.proxyMirrorZ) {
      proxyAutoScale.z = -proxyAutoScale.z;
    }
    if (appState.flipLeftRight) {
      proxyAutoScale.x = -proxyAutoScale.x;
    }

    proxyAutoPos.copy(base.position);
    if (alignOffset) {
      proxyAutoPos.add(alignOffset);
    }

    return { pos: proxyAutoPos, quat: baseQuatTemp, scale: proxyAutoScale };
  };

  const applyProxyTransform = (
    proxy: THREE.Object3D,
    base: BaseTransform,
    alignOffset?: THREE.Vector3,
    includeUserDelta = true
  ): void => {
    const auto = computeAutoProxyTransform(base, alignOffset);
    proxyAutoMat.compose(auto.pos, auto.quat, auto.scale);
    if (includeUserDelta) {
      proxyDeltaMat.compose(proxyDeltaPos, proxyDeltaQuat, proxyDeltaScale);
      proxyFinalMat.multiplyMatrices(proxyAutoMat, proxyDeltaMat);
      proxyFinalMat.decompose(proxy.position, proxy.quaternion, proxy.scale);
    } else {
      proxyAutoMat.decompose(proxy.position, proxy.quaternion, proxy.scale);
    }
    proxy.updateMatrixWorld(true);
  };

  const computeBoundsInRootSpace = (root: THREE.Object3D, out: THREE.Box3): boolean => {
    // Compute bounds in the proxy root's local space (includes child transforms but excludes root transform).
    proxySavedPos.copy(root.position);
    proxySavedQuat.copy(root.quaternion);
    proxySavedScale.copy(root.scale);

    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);

    out.setFromObject(root);

    root.position.copy(proxySavedPos);
    root.quaternion.copy(proxySavedQuat);
    root.scale.copy(proxySavedScale);
    root.updateMatrixWorld(true);

    return !out.isEmpty();
  };

  const median3 = (a: number, b: number, c: number): number => {
    if (a > b) [a, b] = [b, a];
    if (b > c) [b, c] = [c, b];
    if (a > b) [a, b] = [b, a];
    return b;
  };

  const autoCalibrateProxyToSplat = (): void => {
    proxyCalibrationQuat.identity();
    proxyCalibrationScale = 1;
    proxyCalibrationLabel = '';

    if (proxyKind !== 'external') {
      return;
    }

    const proxy = viewer.getProxyMesh();
    if (!currentMesh || !proxy) {
      return;
    }

    const splatBounds = getSplatBounds();
    if (!splatBounds || splatBounds.isEmpty()) {
      return;
    }

    if (!computeBoundsInRootSpace(proxy, proxyRootBounds)) {
      return;
    }

    splatBounds.getSize(splatSizeTemp);
    proxyRootBounds.getSize(proxyRootSize);
    proxyRootHalf.copy(proxyRootSize).multiplyScalar(0.5);

    const splatMax = Math.max(splatSizeTemp.x, splatSizeTemp.y, splatSizeTemp.z, 1e-6);
    let bestScore = Number.POSITIVE_INFINITY;
    let bestScale = 1;
    let bestCandidate: { quat: THREE.Quaternion; label: string } | null = null;

    for (const candidate of proxyOrientationCandidates) {
      rotMat4.makeRotationFromQuaternion(candidate.quat);
      rotMat3.setFromMatrix4(rotMat4);
      const e = rotMat3.elements;

      const m11 = Math.abs(e[0]);
      const m12 = Math.abs(e[3]);
      const m13 = Math.abs(e[6]);
      const m21 = Math.abs(e[1]);
      const m22 = Math.abs(e[4]);
      const m23 = Math.abs(e[7]);
      const m31 = Math.abs(e[2]);
      const m32 = Math.abs(e[5]);
      const m33 = Math.abs(e[8]);

      proxyRotHalf.set(
        m11 * proxyRootHalf.x + m12 * proxyRootHalf.y + m13 * proxyRootHalf.z,
        m21 * proxyRootHalf.x + m22 * proxyRootHalf.y + m23 * proxyRootHalf.z,
        m31 * proxyRootHalf.x + m32 * proxyRootHalf.y + m33 * proxyRootHalf.z
      );

      proxyCandidateSize.copy(proxyRotHalf).multiplyScalar(2);
      const pMax = Math.max(proxyCandidateSize.x, proxyCandidateSize.y, proxyCandidateSize.z, 1e-6);

      const rx = splatSizeTemp.x / Math.max(proxyCandidateSize.x, 1e-6);
      const ry = splatSizeTemp.y / Math.max(proxyCandidateSize.y, 1e-6);
      const rz = splatSizeTemp.z / Math.max(proxyCandidateSize.z, 1e-6);
      let s = median3(rx, ry, rz);
      if (!Number.isFinite(s) || s <= 0) {
        s = splatMax / pMax;
      }

      s = THREE.MathUtils.clamp(s, 1e-6, 1e6);

      const sx = Math.abs(proxyCandidateSize.x * s - splatSizeTemp.x) / splatMax;
      const sy = Math.abs(proxyCandidateSize.y * s - splatSizeTemp.y) / splatMax;
      const sz = Math.abs(proxyCandidateSize.z * s - splatSizeTemp.z) / splatMax;
      const score = sx + sy + sz;

      if (score < bestScore) {
        bestScore = score;
        bestScale = s;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      proxyCalibrationQuat.copy(bestCandidate.quat);
      proxyCalibrationScale = bestScale;
      proxyCalibrationLabel = bestCandidate.label;
    }
  };

  const computeProxyAlignOffset = (): void => {
    proxyAlignOffset.set(0, 0, 0);
    const proxy = viewer.getProxyMesh();
    if (!currentMesh || !proxy) {
      return;
    }

    const splatBounds = getSplatBounds();
    if (!splatBounds) {
      return;
    }

    workingBounds.copy(splatBounds);
    if (workingBounds.isEmpty()) {
      return;
    }

    workingBounds.getCenter(workingCenter);
    workingProxyBounds.setFromObject(proxy);
    if (workingProxyBounds.isEmpty()) {
      return;
    }
    workingProxyBounds.getCenter(workingProxyCenter);

    // Align X/Z by center, but align Y by "floor" so collision proxies tend to sit on the splat's base.
    proxyAlignOffset.set(
      workingCenter.x - workingProxyCenter.x,
      workingBounds.min.y - workingProxyBounds.min.y,
      workingCenter.z - workingProxyCenter.z
    );
  };

  const syncContentTransforms = (recomputeProxyAlign: boolean, recomputeProxyCalibration = false): void => {
    if (currentMesh) {
      if (!splatBaseTransform) {
        splatBaseTransform = captureBaseTransform(currentMesh);
      }
      applyFlipTransform(currentMesh, splatBaseTransform);
    }

    const proxy = viewer.getProxyMesh();
    if (proxy) {
      if (!proxyBaseTransform) {
        proxyBaseTransform = captureBaseTransform(proxy);
      }

      if (recomputeProxyCalibration && proxyKind === 'external') {
        autoCalibrateProxyToSplat();
      }

      // Apply auto-only (no user delta) so bounds-based alignment isn't skewed by manual edits.
      applyProxyTransform(proxy, proxyBaseTransform, undefined, false);

      if (recomputeProxyAlign) {
        computeProxyAlignOffset();
      }

      applyProxyTransform(proxy, proxyBaseTransform, proxyAlignOffset, true);
    }
  };

  const getSplatBounds = (): THREE.Box3 | null => {
    if (!currentMesh) {
      return null;
    }

    if (typeof currentMesh.getBoundingBox === 'function') {
      const bounds = currentMesh.getBoundingBox(false);
      if (!bounds.isEmpty()) {
        // Spark often reports bounds in local space; proxy alignment needs world-space bounds.
        workingBounds.copy(bounds).applyMatrix4(currentMesh.matrixWorld);
        if (!workingBounds.isEmpty()) {
          return workingBounds;
        }
      }
    }

    workingBounds.setFromObject(currentMesh);
    if (workingBounds.isEmpty()) {
      return null;
    }
    return workingBounds;
  };

  const applySplatLightResponse = (): void => {
    if (!currentMesh || !currentMesh.recolor) {
      return;
    }

    const bounds = getSplatBounds();
    if (!bounds) {
      return;
    }

    bounds.getCenter(workingCenter);

    let accumR = 0;
    let accumG = 0;
    let accumB = 0;

    for (const light of sceneLights) {
      if (!light.enabled) {
        continue;
      }

      lightingColor.set(light.color).convertSRGBToLinear();
      let influence = 0;

      if (light.type === 'ambient') {
        influence = light.intensity;
      } else if (light.type === 'directional') {
        workingVecC.fromArray(light.position);
        workingVecA.fromArray(light.target).sub(workingVecC);
        if (workingVecA.lengthSq() > 0) {
          workingVecA.normalize();
        }
        workingVecB.copy(workingCenter).sub(workingVecC);
        if (workingVecB.lengthSq() > 0) {
          workingVecB.normalize();
        }
        influence = light.intensity * Math.max(0.05, workingVecA.dot(workingVecB));
      } else if (light.type === 'point') {
        const dist = Math.max(0.001, workingVecA.fromArray(light.position).distanceTo(workingCenter));
        const atten = 1 / (1 + Math.pow(dist, Math.max(1, light.decay)));
        const distanceCutoff = light.distance > 0 ? Math.max(0, 1 - dist / light.distance) : 1;
        influence = light.intensity * atten * distanceCutoff;
      } else {
        workingVecC.fromArray(light.position);
        const dist = Math.max(0.001, workingVecC.distanceTo(workingCenter));
        const baseAtten = 1 / (1 + Math.pow(dist, Math.max(1, light.decay)));
        const distanceCutoff = light.distance > 0 ? Math.max(0, 1 - dist / light.distance) : 1;

        const spotDirection = workingVecA.fromArray(light.target).sub(workingVecC);
        if (spotDirection.lengthSq() > 0) {
          spotDirection.normalize();
        }
        const toCenter = workingVecB.copy(workingCenter).sub(workingVecC);
        if (toCenter.lengthSq() > 0) {
          toCenter.normalize();
        }
        const theta = spotDirection.dot(toCenter);
        const outerCos = Math.cos(light.angle);
        const innerCos = Math.cos(light.angle * (1 - light.penumbra));
        const cone = smoothstep(outerCos, innerCos, theta);

        influence = light.intensity * baseAtten * distanceCutoff * cone;
      }

      if (influence <= 0) {
        continue;
      }

      accumR += lightingColor.r * influence;
      accumG += lightingColor.g * influence;
      accumB += lightingColor.b * influence;
    }

    const total = accumR + accumG + accumB;
    if (total <= 0.0001) {
      currentMesh.recolor.setRGB(1, 1, 1);
      return;
    }

    const avg = total / 3;
    const gain = THREE.MathUtils.clamp(avg * 0.45, 0.1, 4.5);
    const invMax = 1 / Math.max(accumR, accumG, accumB, 0.0001);
    currentMesh.recolor.setRGB(accumR * invMax * gain, accumG * invMax * gain, accumB * invMax * gain);
  };

  const alignProbeRigToSplat = (): void => {
    if (!currentMesh) {
      probeRoot.position.set(0, 0, 0);
      probeRoot.scale.setScalar(1);
      return;
    }

    const bounds = getSplatBounds();
    if (!bounds) {
      return;
    }

    bounds.getCenter(workingCenter);
    bounds.getSize(workingSize);
    const maxSize = Math.max(workingSize.x, workingSize.y, workingSize.z, 1);
    const scale = THREE.MathUtils.clamp(maxSize * 0.08, 0.5, 12);

    probeRoot.scale.setScalar(scale);
    probeRoot.position.copy(workingCenter);
    probeRoot.position.y = bounds.min.y + scale * 0.9;
  };

  const MAX_DETAIL_MIN_COUNT = 12_000_000;
  const MAX_DETAIL_COUNT_CAP = 50_000_000;
  const MAX_DETAIL_FALLBACK_SCALE = 0.2;

  const meshSupportsSourceQualityToggle = (): boolean => {
    if (!currentMesh) {
      return false;
    }

    return 'enableLod' in currentMesh || 'enableLoD' in currentMesh;
  };

  const setMeshSourceQualityMode = (enabled: boolean): boolean => {
    if (!currentMesh) {
      return false;
    }

    if ('enableLod' in currentMesh) {
      currentMesh.enableLod = enabled ? false : undefined;
      return true;
    }

    if ('enableLoD' in currentMesh) {
      currentMesh.enableLoD = enabled ? false : undefined;
      return true;
    }

    return false;
  };

  const applyQualityProfile = (): void => {
    const strongQuality = appState.improvedQuality && !appState.sourceQualityMode;

    const deviceRatio = window.devicePixelRatio || 1;
    const pixelRatioCap = appState.sourceQualityMode ? 3 : strongQuality ? 2.75 : 2;
    viewer.renderer.setPixelRatio(Math.min(deviceRatio, pixelRatioCap));
    viewer.sparkRenderer.enableLod = true;

    if (appState.sourceQualityMode) {
      const forcedSourceQuality = setMeshSourceQualityMode(true);
      if (forcedSourceQuality) {
        viewer.sparkRenderer.lodSplatCount = Math.min(
          Math.max(Math.floor(appState.lodSplatCount * 2), 6_000_000),
          MAX_DETAIL_COUNT_CAP
        );
        viewer.sparkRenderer.lodSplatScale = Math.max(appState.lodSplatScale * 0.6, 0.08);
        return;
      }

      const maxDetailCount = Math.min(
        Math.max(Math.floor(appState.lodSplatCount * 8), MAX_DETAIL_MIN_COUNT),
        MAX_DETAIL_COUNT_CAP
      );
      const maxDetailScale = Math.max(appState.lodSplatScale * MAX_DETAIL_FALLBACK_SCALE, 0.05);

      viewer.sparkRenderer.lodSplatCount = maxDetailCount;
      viewer.sparkRenderer.lodSplatScale = maxDetailScale;
      return;
    }

    setMeshSourceQualityMode(false);
    const qualityLodCount = strongQuality ? Math.floor(appState.lodSplatCount * 3) : appState.lodSplatCount;
    const qualityLodScale = strongQuality ? Math.max(appState.lodSplatScale * 0.7, 0.1) : appState.lodSplatScale;
    viewer.sparkRenderer.lodSplatCount = qualityLodCount;
    viewer.sparkRenderer.lodSplatScale = qualityLodScale;
  };

  const applySplatTransforms = (mesh: THREE.Object3D): void => {
    // Backwards-compatible entrypoint: keep existing call sites, but ensure proxy follows too.
    if (!splatBaseTransform) {
      splatBaseTransform = captureBaseTransform(mesh);
    }
    // If an external proxy is present, keep it calibrated to the active splat.
    syncContentTransforms(true, true);
  };

  const syncMissingSplatPrompt = (): void => {
    if (!pendingSplatRef) {
      panel.setMissingSplatPrompt(null);
      return;
    }

    if (hasMatchingSplatRef(currentSplatRef, pendingSplatRef)) {
      pendingSplatRef = null;
      panel.setMissingSplatPrompt(null);
      return;
    }

    panel.setLoadMode(pendingSplatRef.loadMode);
    panel.setMissingSplatPrompt(pendingSplatRef);
  };

  const refreshSceneSlotList = (selected?: string | null): void => {
    try {
      panel.setSceneSlotNames(listSceneSlotNames(), selected);
    } catch (error) {
      console.warn('Could not access scene slot storage.', error);
      panel.setSceneSlotNames([]);
    }
  };

  const syncRendererLightingSettings = (): void => {
    const anyShadowCaster = sceneLights.some((light) => light.type !== 'ambient' && light.enabled && light.castShadow);
    viewer.applyRendererLightingSettings({
      physicallyCorrectLights: appState.physicallyCorrectLights,
      toneMapping: appState.toneMapping,
      toneMappingExposure: appState.toneMappingExposure,
      shadowsEnabled: appState.shadowsEnabled && anyShadowCaster
    });
  };

  const ensureSelectionForEditMode = (): void => {
    if (!appState.lightEditMode) {
      return;
    }

    const selected = selectedLightId ? sceneLights.find((light) => light.id === selectedLightId) : null;
    if (selected && selected.type !== 'ambient') {
      return;
    }

    const fallback = sceneLights.find((light) => light.type !== 'ambient') ?? null;
    selectedLightId = fallback?.id ?? null;
    panel.setSelectedLight(selectedLightId);
  };

  const detachGizmo = (): void => {
    activeGizmoLightId = null;
    lightTransform.detach();
    lightTransformHelper.visible = false;
    panel.setActiveGizmoLight(null);
  };

  const updateTransformSnap = (): void => {
    if (!lightTransform.object) {
      return;
    }

    lightTransform.setTranslationSnap(adaptiveTranslationSnap(viewer.camera, lightTransform.object));
  };

  const syncTransformBinding = (): void => {
    if (!appState.lightEditMode || !appState.showLightGizmos) {
      lightTransform.enabled = false;
      detachGizmo();
      return;
    }

    lightTransform.enabled = true;

    if (!selectedLightId) {
      detachGizmo();
      return;
    }

    const selected = sceneLights.find((light) => light.id === selectedLightId);
    if (!selected || selected.type === 'ambient') {
      detachGizmo();
      return;
    }

    if (gizmoSubmode === 'target' && !canUseTargetSubmode(selected)) {
      gizmoSubmode = 'position';
      panel.setLightGizmoSubmode('position');
    }

    const object = getLightObjectForGizmo(lightReconcileState, selectedLightId, gizmoSubmode);
    if (!object) {
      detachGizmo();
      return;
    }

    activeGizmoLightId = selectedLightId;
    lightTransform.attach(object);
    lightTransformHelper.visible = true;
    panel.setActiveGizmoLight(selectedLightId);
    updateTransformSnap();
  };

  const syncInteractionMode = (): void => {
    const isEditMode = appState.lightEditMode || appState.voxelEditMode || proxyEditMode || outlinerEditMode;
    const mode = outlinerEditMode
      ? 'outliner-edit'
      : (proxyEditMode ? 'proxy-edit' : (appState.lightEditMode ? 'light-edit' : (appState.voxelEditMode ? 'voxel-edit' : 'view')));

    if (mode === 'light-edit') {
      ensureSelectionForEditMode();
    }

    viewer.setInteractionMode(mode);
    viewer.setPointerLockEnabled(!isEditMode);

    if (mode === 'voxel-edit') {
      viewer.setVoxelEditState(voxelEditState, currentMesh);
    } else {
      viewer.setVoxelEditState(null, currentMesh);
    }

    if (mode === 'proxy-edit') {
      const proxy = viewer.getProxyMesh();
      if (proxy) {
        viewer.transformControls.setMode(proxyGizmoMode);
        viewer.transformControls.attach(proxy);
      } else {
        viewer.transformControls.detach();
      }
    } else if (mode === 'outliner-edit') {
      const runtime = selectedOutlinerId ? outlinerRuntime.get(selectedOutlinerId) : null;
      if (runtime && runtime.editable) {
        viewer.transformControls.setMode(outlinerGizmoMode);
        viewer.transformControls.attach(runtime.object);
      } else {
        viewer.transformControls.detach();
      }
    } else if (mode !== 'voxel-edit') {
      viewer.transformControls.detach();
    } else {
      // Voxel edit always uses translate mode.
      viewer.transformControls.setMode('translate');
    }

    syncTransformBinding();
  };

  const syncLights = (): void => {
    reconcileSceneLights(viewer.lightRoot, lightHelperRoot, lightMarkerRoot, lightReconcileState, sceneLights, {
      showHelpers: appState.showLightHelpers,
      selectedLightId,
      selectedSubmode: gizmoSubmode,
      shadowsEnabled: appState.shadowsEnabled
    });
    syncRendererLightingSettings();
    applySplatLightResponse();
    syncTransformBinding();
    rebuildOutliner();
  };

  const wouldCreateOutlinerCycle = (childId: string, parentId: string | null): boolean => {
    let cursor = parentId;
    while (cursor) {
      if (cursor === childId) {
        return true;
      }
      cursor = outlinerParentMap.get(cursor) ?? null;
    }
    return false;
  };

  const reparentKeepWorldTransform = (object: THREE.Object3D, nextParent: THREE.Object3D): void => {
    object.updateMatrixWorld(true);
    nextParent.updateMatrixWorld(true);
    object.getWorldPosition(reparentWorldPos);
    object.getWorldQuaternion(reparentWorldQuat);
    object.getWorldScale(reparentWorldScale);

    nextParent.add(object);

    reparentInvParent.copy(nextParent.matrixWorld).invert();
    reparentLocalMatrix.compose(reparentWorldPos, reparentWorldQuat, reparentWorldScale);
    reparentLocalMatrix.premultiply(reparentInvParent);
    reparentLocalMatrix.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrixWorld(true);
  };

  const rebuildOutliner = (): void => {
    outlinerRuntime.clear();
    const items: OutlinerItem[] = [];

    const add = (
      item: Omit<OutlinerItem, 'parentId' | 'canReparent'>,
      runtime: OutlinerRuntimeItem
    ): void => {
      if (!outlinerParentMap.has(item.id)) {
        outlinerParentMap.set(item.id, null);
      }
      items.push({
        ...item,
        parentId: outlinerParentMap.get(item.id) ?? null,
        canReparent: runtime.canReparent
      });
      outlinerRuntime.set(item.id, runtime);
    };

    if (currentMesh) {
      const splat = currentMesh;
      add(
        {
          id: 'splat',
          label: currentSplatRef?.name || 'Splat Mesh',
          typeLabel: 'Splat',
          visible: splat.visible
        },
        {
          id: 'splat',
          object: splat,
          editable: false,
          exportable: false,
          canReparent: false,
          setVisible: (visible) => {
            splat.visible = visible;
          }
        }
      );
    }

    const proxy = viewer.getProxyMesh();
    if (proxy) {
      add(
        {
          id: 'proxy',
          label: proxy.name || 'Proxy Mesh',
          typeLabel: proxyKind === 'voxel' ? 'Voxel Proxy' : 'Proxy',
          visible: proxy.visible
        },
        {
          id: 'proxy',
          object: proxy,
          editable: true,
          exportable: true,
          canReparent: true,
          setVisible: (visible) => {
            appState.showProxyMesh = visible;
            panel.setShowProxyMeshEnabled(visible);
            applyProxyVisibility(visible, { reportBlocked: true });
          }
        }
      );
    }

    add(
      {
        id: 'probe-rig',
        label: 'Lighting Probe Rig',
        typeLabel: 'Group',
        visible: probeRoot.visible
      },
      {
        id: 'probe-rig',
        object: probeRoot,
        editable: false,
        exportable: true,
        canReparent: true,
        setVisible: (visible) => {
          probeRoot.visible = visible;
          appState.showLightingProbes = visible;
          panel.setLightingProbeEnabled(visible);
        }
      }
    );

    add(
      {
        id: 'lights-root',
        label: 'Lights',
        typeLabel: 'Group',
        visible: viewer.lightRoot.visible
      },
      {
        id: 'lights-root',
        object: viewer.lightRoot,
        editable: false,
        exportable: true,
        canReparent: false,
        setVisible: (visible) => {
          viewer.lightRoot.visible = visible;
        }
      }
    );

    for (const light of sceneLights) {
      const node = getLightNode(lightReconcileState, light.id);
      if (!node) {
        continue;
      }
      outlinerParentMap.set(`light:${light.id}`, 'lights-root');
      add(
        {
          id: `light:${light.id}`,
          label: light.name,
          typeLabel: light.type,
          visible: light.enabled
        },
        {
          id: `light:${light.id}`,
          object: node.light,
          editable: false,
          exportable: true,
          canReparent: false,
          setVisible: (visible) => {
            sceneLights = sceneLights.map((entry) => (entry.id === light.id ? { ...entry, enabled: visible } : entry));
            panel.setLightList(sceneLights);
            syncLights();
          }
        }
      );
    }

    for (const key of [...outlinerParentMap.keys()]) {
      if (!outlinerRuntime.has(key)) {
        outlinerParentMap.delete(key);
      }
    }

    for (const item of items) {
      const runtime = outlinerRuntime.get(item.id);
      if (!runtime) {
        continue;
      }
      if (!runtime.canReparent) {
        if (item.id !== 'lights-root' && item.id.startsWith('light:')) {
          outlinerParentMap.set(item.id, 'lights-root');
          item.parentId = 'lights-root';
        } else if (item.parentId !== null) {
          outlinerParentMap.set(item.id, null);
          item.parentId = null;
        }
        continue;
      }

      const parentId = outlinerParentMap.get(item.id) ?? null;
      if (!parentId || !outlinerRuntime.has(parentId) || wouldCreateOutlinerCycle(item.id, parentId)) {
        outlinerParentMap.set(item.id, null);
        item.parentId = null;
      } else {
        item.parentId = parentId;
      }
    }

    for (const item of items) {
      const runtime = outlinerRuntime.get(item.id);
      if (!runtime || !runtime.canReparent) {
        continue;
      }

      const parentId = outlinerParentMap.get(item.id) ?? null;
      const nextParent = parentId ? outlinerRuntime.get(parentId)?.object ?? viewer.scene : viewer.scene;
      if (runtime.object.parent !== nextParent) {
        reparentKeepWorldTransform(runtime.object, nextParent);
      }
    }

    if (selectedOutlinerId && !outlinerRuntime.has(selectedOutlinerId)) {
      selectedOutlinerId = null;
      panel.setSelectedOutlinerItem(null);
    }

    panel.setOutlinerItems(items);
    panel.setSelectedOutlinerItem(selectedOutlinerId);
  };

  const focusSelectedOutlinerItem = (): void => {
    if (!selectedOutlinerId) {
      panel.setStatus('Select an outliner object first.', 'warning');
      return;
    }

    const runtime = outlinerRuntime.get(selectedOutlinerId);
    if (!runtime) {
      panel.setStatus('Selected outliner object is no longer available.', 'warning');
      return;
    }

    const focusPoint = new THREE.Vector3();
    runtime.object.getWorldPosition(focusPoint);
    const offset = viewer.camera.position.clone().sub(focusPoint);
    if (offset.length() < 2) {
      offset.set(3, 3, 3);
    }
    viewer.orbitControls.target.copy(focusPoint);
    viewer.camera.position.copy(focusPoint).add(offset.setLength(Math.max(3, offset.length())));
    viewer.camera.lookAt(focusPoint);
    viewer.orbitControls.update();
    panel.setStatus(`Focused ${selectedOutlinerId}.`, 'info');
  };

  const buildSceneSnapshot = (): SceneFileV2 => {
    appState.sceneName = panel.getSceneName() || 'Untitled Scene';

    return createSceneFile({
      sceneName: appState.sceneName,
      splatRef: currentSplatRef ? { ...currentSplatRef } : null,
      camera: toSceneCamera(viewer.camera),
      settings: {
        lodSplatCount: appState.lodSplatCount,
        lodSplatScale: appState.lodSplatScale,
        improvedQuality: appState.improvedQuality,
        sourceQualityMode: appState.sourceQualityMode,
        flipUpDown: appState.flipUpDown,
        flipLeftRight: appState.flipLeftRight,
        proxyFlipUpDown: appState.proxyFlipUpDown,
        proxyMirrorX: appState.proxyMirrorX,
        proxyMirrorZ: appState.proxyMirrorZ,
        proxyUserPosition: appState.proxyUserPosition,
        proxyUserQuaternion: appState.proxyUserQuaternion,
        proxyUserScale: appState.proxyUserScale,
        outlinerParents: [...outlinerParentMap.entries()].map(([id, parentId]) => ({ id, parentId })),
        selectedOutlinerId,
        physicallyCorrectLights: appState.physicallyCorrectLights,
        toneMapping: appState.toneMapping,
        toneMappingExposure: appState.toneMappingExposure,
        shadowsEnabled: appState.shadowsEnabled,
        lightEditMode: appState.lightEditMode,
        showLightHelpers: appState.showLightHelpers,
        showLightGizmos: appState.showLightGizmos,
        showMovementControls: appState.showMovementControls,
        showLightingProbes: appState.showLightingProbes,
        collisionEnabled: appState.collisionEnabled,
        showProxyMesh: appState.showProxyMesh,
        voxelEditMode: appState.voxelEditMode
      },
      lights: cloneSceneLights(sceneLights)
    });
  };

  const applyLoadedScene = (scene: SceneFileV2, sourceLabel: string): void => {
    const settings = applySceneSettingsDefaults(scene.settings);

    appState.sceneName = scene.sceneName || 'Untitled Scene';
    panel.setSceneName(appState.sceneName);

    appState.lodSplatCount = settings.lodSplatCount;
    appState.lodSplatScale = settings.lodSplatScale;
    appState.improvedQuality = settings.improvedQuality;
    appState.sourceQualityMode = settings.sourceQualityMode;
    appState.flipUpDown = settings.flipUpDown;
    appState.flipLeftRight = settings.flipLeftRight;
    appState.proxyFlipUpDown = settings.proxyFlipUpDown;
    appState.proxyMirrorX = settings.proxyMirrorX;
    appState.proxyMirrorZ = settings.proxyMirrorZ;
    appState.proxyUserPosition = settings.proxyUserPosition;
    appState.proxyUserQuaternion = settings.proxyUserQuaternion;
    appState.proxyUserScale = settings.proxyUserScale;
    appState.physicallyCorrectLights = settings.physicallyCorrectLights;
    appState.toneMapping = settings.toneMapping;
    appState.toneMappingExposure = settings.toneMappingExposure;
    appState.shadowsEnabled = settings.shadowsEnabled;
    appState.lightEditMode = settings.lightEditMode;
    appState.showLightHelpers = settings.showLightHelpers;
    appState.showLightGizmos = settings.showLightGizmos;
    appState.showMovementControls = settings.showMovementControls;
    appState.showLightingProbes = settings.showLightingProbes;
    appState.collisionEnabled = settings.collisionEnabled;
    appState.showProxyMesh = settings.showProxyMesh;
    appState.voxelEditMode = settings.voxelEditMode;
    outlinerParentMap.clear();
    for (const link of settings.outlinerParents) {
      outlinerParentMap.set(link.id, link.parentId);
    }
    selectedOutlinerId = settings.selectedOutlinerId;

    panel.setLodCountValue(appState.lodSplatCount);
    panel.setLodScaleValue(appState.lodSplatScale);
    panel.setImprovedQualityEnabled(appState.improvedQuality);
    panel.setMaxDetailEnabled(appState.sourceQualityMode);
    panel.setFlipUpDownEnabled(appState.flipUpDown);
    panel.setFlipLeftRightEnabled(appState.flipLeftRight);
    panel.setProxyFlipUpDownEnabled(appState.proxyFlipUpDown);
    panel.setProxyMirrorXEnabled(appState.proxyMirrorX);
    panel.setProxyMirrorZEnabled(appState.proxyMirrorZ);
    panel.setLightEditModeEnabled(appState.lightEditMode);
    panel.setLightHelpersEnabled(appState.showLightHelpers);
    panel.setLightGizmosEnabled(appState.showLightGizmos);
    panel.setMovementControlsEnabled(appState.showMovementControls);
    panel.setLightingProbeEnabled(appState.showLightingProbes);
    panel.setCollisionEnabled(appState.collisionEnabled);
    panel.setShowProxyMeshEnabled(appState.showProxyMesh);
    panel.setVoxelEditMode(appState.voxelEditMode);
    viewer.setCollisionEnabled(appState.collisionEnabled);
    applyProxyVisibility(appState.showProxyMesh, { silentNoProxy: true });
    panel.setRendererLightingSettings({
      physicallyCorrectLights: appState.physicallyCorrectLights,
      toneMapping: appState.toneMapping,
      toneMappingExposure: appState.toneMappingExposure,
      shadowsEnabled: appState.shadowsEnabled
    });

    sceneLights = cloneSceneLights(scene.lights);
    selectedLightId = null;
    panel.setSelectedLight(null);
    panel.setLightList(sceneLights);
    probeRoot.visible = appState.showLightingProbes;
    syncLights();

    applySceneCamera(viewer.camera, scene.camera);
    applyQualityProfile();

    // Scene load should never trap controls in an edit mode.
    proxyEditMode = false;
    panel.setProxyEditModeEnabled(false);
    outlinerEditMode = false;
    panel.setOutlinerEditModeEnabled(false);
    viewer.transformControls.detach();

    proxyDeltaPos.fromArray(appState.proxyUserPosition);
    proxyDeltaQuat.set(...appState.proxyUserQuaternion);
    proxyDeltaScale.fromArray(appState.proxyUserScale);
    syncInteractionMode();

    if (currentMesh) {
      // Scene files store flip flags; re-apply to both splat + proxy.
      splatBaseTransform = captureBaseTransform(currentMesh);
      syncContentTransforms(true, true);
      alignProbeRigToSplat();
      applySplatLightResponse();
    }

    pendingSplatRef = scene.splatRef ? { ...scene.splatRef } : null;
    syncMissingSplatPrompt();
    rebuildOutliner();

    if (pendingSplatRef && !hasMatchingSplatRef(currentSplatRef, pendingSplatRef)) {
      panel.setStatus(
        `${sourceLabel} loaded. Scene settings applied. Select splat ${pendingSplatRef.name} and click Load file.`,
        'warning'
      );
      return;
    }

    panel.setStatus(`${sourceLabel} loaded successfully.`, 'success');
  };

  const focusSelectedLight = (id: string): void => {
    const node = getLightNode(lightReconcileState, id);
    if (!node) {
      panel.setStatus('Light not found for focus.', 'warning');
      return;
    }

    const focusPoint = new THREE.Vector3();
    if (gizmoSubmode === 'target' && node.targetObject) {
      node.targetObject.getWorldPosition(focusPoint);
    } else {
      node.light.getWorldPosition(focusPoint);
    }

    if (appState.lightEditMode) {
      const offset = viewer.camera.position.clone().sub(focusPoint);
      if (offset.length() < 2) {
        offset.set(3, 3, 3);
      }
      viewer.orbitControls.target.copy(focusPoint);
      viewer.camera.position.copy(focusPoint).add(offset.setLength(Math.max(3, offset.length())));
      viewer.camera.lookAt(focusPoint);
      viewer.orbitControls.update();
    } else {
      viewer.camera.lookAt(focusPoint);
    }

    panel.setStatus('Focused selected light.', 'info');
    updateTransformSnap();
  };

  panel.setLightList(sceneLights);
  panel.setSelectedLight(null);
  panel.setActiveGizmoLight(null);
  panel.setLightGizmoSubmode(gizmoSubmode);
  probeRoot.visible = appState.showLightingProbes;
  syncLights();
  applyQualityProfile();
  refreshSceneSlotList();
  syncInteractionMode();
  syncMissingSplatPrompt();

  viewer.orbitControls.addEventListener('change', () => {
    updateTransformSnap();
  });

  // Persist proxy manual transform (delta relative to auto alignment) while dragging the proxy gizmo.
  viewer.transformControls.addEventListener('objectChange', () => {
    const mode = viewer.getInteractionMode();
    if (mode !== 'proxy-edit' && mode !== 'outliner-edit') {
      return;
    }

    const proxy = viewer.getProxyMesh();
    if (!proxy || !proxyBaseTransform || viewer.transformControls.object !== proxy) {
      return;
    }

    proxyCurrentMat.compose(proxy.position, proxy.quaternion, proxy.scale);
    const auto = computeAutoProxyTransform(proxyBaseTransform, proxyAlignOffset);
    proxyAutoMat.compose(auto.pos, auto.quat, auto.scale);
    proxyInvAutoMat.copy(proxyAutoMat).invert();
    proxyDeltaMat.multiplyMatrices(proxyInvAutoMat, proxyCurrentMat);
    proxyDeltaMat.decompose(proxyDecompPos, proxyDecompQuat, proxyDecompScale);

    proxyDeltaPos.copy(proxyDecompPos);
    proxyDeltaQuat.copy(proxyDecompQuat);
    proxyDeltaScale.copy(proxyDecompScale);

    appState.proxyUserPosition = [proxyDeltaPos.x, proxyDeltaPos.y, proxyDeltaPos.z];
    appState.proxyUserQuaternion = [proxyDeltaQuat.x, proxyDeltaQuat.y, proxyDeltaQuat.z, proxyDeltaQuat.w];
    appState.proxyUserScale = [proxyDeltaScale.x, proxyDeltaScale.y, proxyDeltaScale.z];
  });

  lightTransform.addEventListener('dragging-changed', (event) => {
    const dragging = Boolean(event.value as boolean);
    viewer.orbitControls.enabled = appState.lightEditMode && !dragging;
    viewer.setPointerLockEnabled(!dragging && !appState.lightEditMode);
  });

  lightTransform.addEventListener('objectChange', () => {
    if (!selectedLightId) {
      return;
    }

    const node = getLightNode(lightReconcileState, selectedLightId);
    if (!node) {
      return;
    }

    sceneLights = sceneLights.map((entry) => {
      if (entry.id !== selectedLightId) {
        return entry;
      }

      const updated = threeNodeToSceneLight(node, entry.id);
      updated.name = entry.name;
      updated.enabled = entry.enabled;
      return updated;
    });

    panel.setLightList(sceneLights);
    panel.setSelectedLight(selectedLightId);
    syncLights();
  });

  panel.onLoadRequested(async () => {
    const selected = panel.getSelectedFile();
    if (!selected) {
      panel.setStatus('Select a file first (.spz, .ply, .splat, .ksplat).', 'warning');
      return;
    }

    panel.setLoading(true);

    try {
      const loaded = await loadFromFile(selected, {
        mode: panel.getLoadMode(),
        enforcePreviewApi: true,
        scene: viewer.scene,
        sparkRenderer: viewer.sparkRenderer,
        previousMesh: currentMesh,
        sparkModule,
        requirePlyConfirm: panel.confirmRawPly,
        onStatus: (message) => panel.setStatus(message)
      });

      // New mesh: reset transform bases so flips are applied relative to this file's original pose.
      splatBaseTransform = null;
      proxyAlignOffset.set(0, 0, 0);

      currentMesh = loaded.mesh;
      currentSplatRef = {
        name: selected.name,
        ext: getExtension(selected.name),
        loadMode: panel.getLoadMode()
      };

      applyQualityProfile();
      // Capture base pose before applying any flips.
      splatBaseTransform = captureBaseTransform(currentMesh);
      // If an external proxy is already loaded, recompute its calibration against the new splat.
      syncContentTransforms(true, true);
      fitCameraToObject(viewer.camera, currentMesh);
      alignProbeRigToSplat();
      applySplatLightResponse();
      rebuildOutliner();

      syncMissingSplatPrompt();

      if (pendingSplatRef) {
        panel.setStatus(
          `Loaded ${selected.name}, but scene expects ${pendingSplatRef.name}. Pick the expected splat and click Load file.`,
          'warning'
        );
      } else {
        panel.setStatus(
          `Loaded ${selected.name} (${(loaded.numBytes / (1024 * 1024)).toFixed(1)} MB) in ${(loaded.loadMs / 1000).toFixed(2)}s.`,
          'success'
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Load failed: ${detail}`, 'error');
      console.error(error);
    } finally {
      panel.setLoading(false);
    }
  });

  panel.onPickMissingSplatRequested(() => {
    if (!pendingSplatRef) {
      panel.setStatus('No pending splat reference from a loaded scene.', 'info');
      return;
    }

    panel.setLoadMode(pendingSplatRef.loadMode);
    panel.openSplatFilePicker();
    panel.setStatus(`Pick ${pendingSplatRef.name} and click Load file.`, 'warning');
  });

  panel.onClearRequested(() => {
    if (!currentMesh) {
      panel.setStatus('Scene is already clear.', 'info');
      return;
    }

    viewer.scene.remove(currentMesh);
    currentMesh.dispose?.();
    currentMesh = null;
    currentSplatRef = null;
    splatBaseTransform = null;
    proxyAlignOffset.set(0, 0, 0);
    alignProbeRigToSplat();
    rebuildOutliner();
    panel.setStatus('Scene cleared.', 'info');
  });

  panel.onLodScaleChanged((value) => {
    if (!Number.isFinite(value) || value <= 0) {
      panel.setStatus('LoD scale must be a positive number.', 'warning');
      return;
    }

    appState.lodSplatScale = value;
    applyQualityProfile();

    if (appState.sourceQualityMode) {
      panel.setStatus(
        meshSupportsSourceQualityToggle()
          ? 'LoD scale saved. Source-quality mode is active for this mesh.'
          : `LoD scale set to ${viewer.sparkRenderer.lodSplatScale.toFixed(2)} (source-quality fallback profile active).`,
        'info'
      );
      return;
    }

    panel.setStatus(
      `LoD scale set to ${viewer.sparkRenderer.lodSplatScale.toFixed(2)}${appState.improvedQuality ? ' (quality boost active)' : ''}.`,
      'info'
    );
  });

  panel.onLodCountChanged((value) => {
    if (!Number.isFinite(value) || value < 10_000) {
      panel.setStatus('LoD splat count must be >= 10000.', 'warning');
      return;
    }

    appState.lodSplatCount = Math.floor(value);
    applyQualityProfile();

    if (appState.sourceQualityMode) {
      panel.setStatus(
        meshSupportsSourceQualityToggle()
          ? 'LoD splat count saved. Source-quality mode is active for this mesh.'
          : `LoD splat count set to ${viewer.sparkRenderer.lodSplatCount.toLocaleString()} (source-quality fallback profile active).`,
        'info'
      );
      return;
    }

    panel.setStatus(
      `LoD splat count set to ${viewer.sparkRenderer.lodSplatCount.toLocaleString()}${appState.improvedQuality ? ' (quality boost active)' : ''}.`,
      'info'
    );
  });

  panel.onImprovedQualityChanged((enabled) => {
    appState.improvedQuality = enabled;
    applyQualityProfile();
    panel.setStatus(
      appState.sourceQualityMode
        ? `Improved render quality ${enabled ? 'enabled' : 'disabled'} (source quality mode currently overrides this).`
        : `Improved render quality ${enabled ? 'enabled' : 'disabled'}${enabled ? ' (higher GPU load)' : ''}.`,
      'info'
    );
  });

  panel.onMaxDetailChanged((enabled) => {
    appState.sourceQualityMode = enabled;
    applyQualityProfile();
    panel.setStatus(
      enabled
        ? meshSupportsSourceQualityToggle()
          ? 'Source-quality mode enabled for current mesh (LoD bypassed on mesh, highest fidelity).'
          : `Source-quality mode enabled with fallback LoD profile: ${viewer.sparkRenderer.lodSplatCount.toLocaleString()} splats.`
        : 'Source-quality mode disabled: LoD-based rendering restored.',
      enabled ? 'warning' : 'info'
    );
  });

  panel.onFlipUpDownChanged((enabled) => {
    appState.flipUpDown = enabled;
    if (currentMesh) {
      syncContentTransforms(true);
      fitCameraToObject(viewer.camera, currentMesh);
      alignProbeRigToSplat();
      applySplatLightResponse();
    }
    panel.setStatus(`Flip upside down ${enabled ? 'enabled' : 'disabled'}.`, 'info');
  });

  panel.onFlipLeftRightChanged((enabled) => {
    appState.flipLeftRight = enabled;
    if (currentMesh) {
      syncContentTransforms(true);
      fitCameraToObject(viewer.camera, currentMesh);
      alignProbeRigToSplat();
      applySplatLightResponse();
    }
    panel.setStatus(`Flip left-right ${enabled ? 'enabled' : 'disabled'}.`, 'info');
  });

  panel.onRealignProxyRequested(() => {
    if (!viewer.getProxyMesh()) {
      panel.setStatus('Load a proxy mesh first.', 'warning');
      return;
    }

    proxyAlignOffset.set(0, 0, 0);
    syncContentTransforms(true, true);

    panel.setStatus(
      proxyKind === 'external'
        ? `Proxy re-aligned${proxyCalibrationLabel ? `: ${proxyCalibrationLabel}, scale ${proxyCalibrationScale.toFixed(3)}` : ''}.`
        : 'Proxy re-aligned.',
      'success'
    );
  });

  panel.onProxyFlipUpDownChanged((enabled) => {
    appState.proxyFlipUpDown = enabled;
    syncContentTransforms(true);
    rebuildOutliner();
    panel.setStatus(`Proxy flip upside down ${enabled ? 'enabled' : 'disabled'}.`, 'info');
  });

  panel.onProxyMirrorXChanged((enabled) => {
    appState.proxyMirrorX = enabled;
    syncContentTransforms(true);
    rebuildOutliner();
    panel.setStatus(`Proxy mirror X ${enabled ? 'enabled' : 'disabled'}.`, 'info');
  });

  panel.onProxyMirrorZChanged((enabled) => {
    appState.proxyMirrorZ = enabled;
    syncContentTransforms(true);
    panel.setStatus(`Proxy mirror Z ${enabled ? 'enabled' : 'disabled'}.`, 'info');
    rebuildOutliner();
  });

  panel.onOutlinerSelected((id) => {
    selectedOutlinerId = id;
    panel.setSelectedOutlinerItem(selectedOutlinerId);
    if (outlinerEditMode) {
      syncInteractionMode();
    }
  });

  panel.onOutlinerVisibilityChanged((id, visible) => {
    const runtime = outlinerRuntime.get(id);
    if (!runtime) {
      panel.setStatus('Outliner item not found.', 'warning');
      return;
    }
    runtime.setVisible?.(visible);
    runtime.object.visible = visible;
    rebuildOutliner();
  });

  panel.onOutlinerParentChanged((id, parentId) => {
    const runtime = outlinerRuntime.get(id);
    if (!runtime) {
      panel.setStatus('Outliner item not found.', 'warning');
      return;
    }

    if (!runtime.canReparent) {
      panel.setStatus('This item cannot be re-parented.', 'warning');
      rebuildOutliner();
      return;
    }

    if (parentId && !outlinerRuntime.has(parentId)) {
      panel.setStatus('Selected parent is no longer available.', 'warning');
      rebuildOutliner();
      return;
    }

    if (parentId === id || wouldCreateOutlinerCycle(id, parentId)) {
      panel.setStatus('Invalid parent selection (would create a cycle).', 'warning');
      rebuildOutliner();
      return;
    }

    outlinerParentMap.set(id, parentId);
    rebuildOutliner();

    if (outlinerEditMode && selectedOutlinerId === id && viewer.getInteractionMode() === 'outliner-edit') {
      const selected = outlinerRuntime.get(id);
      if (selected?.editable) {
        viewer.transformControls.setMode(outlinerGizmoMode);
        viewer.transformControls.attach(selected.object);
      } else {
        viewer.transformControls.detach();
      }
    }

    panel.setStatus(parentId ? 'Outliner parent updated.' : 'Outliner parent reset to root.', 'info');
  });

  panel.onOutlinerEditModeChanged((enabled) => {
    if (enabled && outlinerRuntime.size === 0) {
      panel.setStatus('No outliner objects available yet.', 'warning');
      panel.setOutlinerEditModeEnabled(false);
      outlinerEditMode = false;
      return;
    }

    outlinerEditMode = enabled;

    if (enabled) {
      if (appState.lightEditMode) {
        appState.lightEditMode = false;
        panel.setLightEditModeEnabled(false);
      }
      if (appState.voxelEditMode) {
        appState.voxelEditMode = false;
        panel.setVoxelEditMode(false);
      }
      if (proxyEditMode) {
        proxyEditMode = false;
        panel.setProxyEditModeEnabled(false);
      }

      const selected = selectedOutlinerId ? outlinerRuntime.get(selectedOutlinerId) : null;
      if (!selected || !selected.editable) {
        const firstEditable = [...outlinerRuntime.values()].find((item) => item.editable) ?? null;
        selectedOutlinerId = firstEditable?.id ?? null;
        panel.setSelectedOutlinerItem(selectedOutlinerId);
      }
    } else {
      viewer.transformControls.detach();
    }

    syncInteractionMode();
    panel.setStatus(
      enabled
        ? 'Outliner Edit Mode enabled. Use gizmo to transform selected object.'
        : 'Outliner Edit Mode disabled.',
      'info'
    );
  });

  panel.onOutlinerGizmoModeChanged((mode) => {
    outlinerGizmoMode = mode;
    if (outlinerEditMode && viewer.getInteractionMode() === 'outliner-edit') {
      viewer.transformControls.setMode(mode);
    }
    panel.setStatus(`Outliner gizmo set to ${mode}.`, 'info');
  });

  panel.onOutlinerFocusRequested(() => {
    focusSelectedOutlinerItem();
  });

  panel.onExportSceneGlbRequested(async () => {
    try {
      const exportObjects: THREE.Object3D[] = [];
      const proxy = viewer.getProxyMesh();
      if (proxy) {
        exportObjects.push(proxy);
      }
      if (probeRoot.visible) {
        exportObjects.push(probeRoot);
      }
      exportObjects.push(viewer.lightRoot);

      if (exportObjects.length === 0) {
        panel.setStatus('Nothing exportable in the current standard scene.', 'warning');
        return;
      }

      await exportObjectsAsGlb(exportObjects, `${appState.sceneName || 'scene'}_standard`);
      panel.setStatus('Exported standard scene as .glb.', 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Scene export failed: ${detail}`, 'error');
      console.error(error);
    }
  });

  panel.onProxyEditModeChanged((enabled) => {
    const proxy = viewer.getProxyMesh();
    if (enabled && !proxy) {
      panel.setStatus('Load a proxy mesh first before entering Proxy Edit Mode.', 'warning');
      panel.setProxyEditModeEnabled(false);
      proxyEditMode = false;
      syncInteractionMode();
      return;
    }

    proxyEditMode = enabled;

    if (enabled) {
      // Keep modes exclusive to avoid control conflicts.
      if (appState.lightEditMode) {
        appState.lightEditMode = false;
        panel.setLightEditModeEnabled(false);
      }
      if (appState.voxelEditMode) {
        appState.voxelEditMode = false;
        panel.setVoxelEditMode(false);
      }
      if (outlinerEditMode) {
        outlinerEditMode = false;
        panel.setOutlinerEditModeEnabled(false);
      }

      // Ensure proxy is visible while positioning.
      if (!appState.showProxyMesh) {
        appState.showProxyMesh = true;
        panel.setShowProxyMeshEnabled(true);
        applyProxyVisibility(true, { reportBlocked: true });
      }
    } else {
      viewer.transformControls.detach();
    }

    syncInteractionMode();
    panel.setStatus(
      enabled
        ? 'Proxy Edit Mode enabled. Use orbit + gizmo to position/rotate/scale the proxy.'
        : 'Proxy Edit Mode disabled.',
      'info'
    );
  });

  panel.onProxyGizmoModeChanged((mode) => {
    proxyGizmoMode = mode;
    if (proxyEditMode && viewer.getInteractionMode() === 'proxy-edit') {
      viewer.transformControls.setMode(proxyGizmoMode);
    }
    panel.setStatus(`Proxy gizmo set to ${mode}.`, 'info');
  });

  panel.onResetProxyTransformRequested(() => {
    proxyDeltaPos.set(0, 0, 0);
    proxyDeltaQuat.set(0, 0, 0, 1);
    proxyDeltaScale.set(1, 1, 1);
    appState.proxyUserPosition = [0, 0, 0];
    appState.proxyUserQuaternion = [0, 0, 0, 1];
    appState.proxyUserScale = [1, 1, 1];
    syncContentTransforms(false);
    rebuildOutliner();
    panel.setStatus('Proxy transform reset (auto alignment preserved).', 'success');
  });

  panel.onAddLightRequested((type) => {
    const index = sceneLights.filter((light) => light.type === type).length + 1;
    const light = createDefaultSceneLight(type, generateLightId(type), index);
    sceneLights = [...sceneLights, light];
    panel.setLightList(sceneLights);

    if (!selectedLightId && light.type !== 'ambient') {
      selectedLightId = light.id;
      panel.setSelectedLight(selectedLightId);
    }

    syncLights();
    panel.setStatus(`Added ${type} light. Select it and use focus/gizmo controls to position it.`, 'success');
  });

  panel.onLightChanged((light) => {
    sceneLights = sceneLights.map((entry) => (entry.id === light.id ? light : entry));
    syncLights();
  });

  panel.onLightRemoved((id) => {
    const nextLights = sceneLights.filter((entry) => entry.id !== id);
    if (nextLights.length === sceneLights.length) {
      panel.setStatus('Light not found for removal.', 'warning');
      return;
    }

    sceneLights = nextLights;
    if (selectedLightId === id) {
      selectedLightId = null;
      panel.setSelectedLight(null);
    }

    panel.setLightList(sceneLights);
    syncLights();
    if (appState.lightEditMode) {
      ensureSelectionForEditMode();
    }
    syncInteractionMode();

    panel.setStatus('Light removed.', 'info');
  });

  panel.onLightSelected((id) => {
    selectedLightId = id;
    panel.setSelectedLight(selectedLightId);
    syncLights();
  });

  panel.onLightFocusRequested((id) => {
    selectedLightId = id;
    panel.setSelectedLight(selectedLightId);
    syncLights();
    focusSelectedLight(id);
  });

  panel.onLightGizmoRequested((id) => {
    selectedLightId = id;
    panel.setSelectedLight(selectedLightId);

    if (!appState.lightEditMode) {
      appState.lightEditMode = true;
      panel.setLightEditModeEnabled(true);
    }

    if (!appState.showLightGizmos) {
      appState.showLightGizmos = true;
      panel.setLightGizmosEnabled(true);
    }

    syncInteractionMode();
    syncLights();
    panel.setStatus('Gizmo attached. Use drag handles to position the light.', 'success');
  });

  panel.onLightGizmoSubmodeChanged((submode) => {
    gizmoSubmode = submode;
    syncLights();
    panel.setStatus(`Gizmo submode set to ${submode}.`, 'info');
  });

  panel.onLightHelpersChanged((enabled) => {
    appState.showLightHelpers = enabled;
    syncLights();
    panel.setStatus(`Light helpers ${enabled ? 'shown' : 'hidden'}.`, 'info');
  });

  panel.onLightEditModeChanged((enabled) => {
    appState.lightEditMode = enabled;
    if (enabled && outlinerEditMode) {
      outlinerEditMode = false;
      panel.setOutlinerEditModeEnabled(false);
    }
    if (enabled && proxyEditMode) {
      proxyEditMode = false;
      panel.setProxyEditModeEnabled(false);
    }
    syncInteractionMode();
    syncLights();
    panel.setStatus(
      enabled
        ? 'Light Edit Mode enabled. Orbit the camera and move selected lights with gizmos.'
        : 'Light Edit Mode disabled. Camera FPS controls restored.',
      'info'
    );
  });

  panel.onLightGizmosChanged((enabled) => {
    appState.showLightGizmos = enabled;
    syncTransformBinding();
    panel.setStatus(`Light gizmos ${enabled ? 'shown' : 'hidden'}.`, 'info');
  });

  panel.onMovementControlsChanged((enabled) => {
    appState.showMovementControls = enabled;
    panel.setStatus(`Movement controls ${enabled ? 'shown' : 'hidden'}.`, 'info');
  });

  panel.onLightingProbeToggled((enabled) => {
    appState.showLightingProbes = enabled;
    probeRoot.visible = enabled;
    rebuildOutliner();
    panel.setStatus(`Lighting probes ${enabled ? 'shown' : 'hidden'}.`, 'info');
  });

  panel.onCollisionEnabledChanged((enabled) => {
    appState.collisionEnabled = enabled;
    viewer.setCollisionEnabled(enabled);
    panel.setStatus(`Collision ${enabled ? 'enabled' : 'disabled'}.`, 'info');
  });

  panel.onShowProxyMeshChanged((enabled) => {
    appState.showProxyMesh = enabled;
    const applied = applyProxyVisibility(enabled, { reportBlocked: true });
    if (!applied) {
      rebuildOutliner();
      return;
    }
    rebuildOutliner();
    panel.setStatus(`Proxy mesh ${enabled ? 'shown' : 'hidden'}.`, 'info');
  });

  panel.onProxyFileRequested((file) => {
    const ext = getExtension(file.name);
    if (!['obj', 'glb', 'gltf'].includes(ext)) {
      panel.setStatus(`Unsupported proxy format ".${ext || 'unknown'}". Use .obj, .glb, or .gltf.`, 'error');
      return;
    }
    if (file.size > MAX_PROXY_FILE_BYTES) {
      panel.setStatus('Proxy file is too large for browser loading. Use a smaller mesh or convert to a lighter GLB.', 'error');
      return;
    }
    if (ext === 'obj' && file.size > MAX_OBJ_PROXY_FILE_BYTES) {
      panel.setStatus('OBJ proxy is too large for stable runtime loading. Use a decimated .glb or a smaller OBJ.', 'error');
      return;
    }

    const url = URL.createObjectURL(file);
    panel.setStatus(`Loading proxy mesh ${file.name}...`, 'info');
    viewer.setProxyMesh(url, file.name).then(() => {
      viewer.setVoxelCollisionData(null);
      proxyKind = 'external';
      proxyBaseTransform = null;
      proxyAlignOffset.set(0, 0, 0);
      proxyDeltaPos.set(0, 0, 0);
      proxyDeltaQuat.set(0, 0, 0, 1);
      proxyDeltaScale.set(1, 1, 1);
      appState.proxyUserPosition = [0, 0, 0];
      appState.proxyUserQuaternion = [0, 0, 0, 1];
      appState.proxyUserScale = [1, 1, 1];
      // Leaving voxel edit enabled while swapping to an external proxy is confusing and can trap controls.
      if (appState.voxelEditMode) {
        appState.voxelEditMode = false;
        panel.setVoxelEditMode(false);
        syncInteractionMode();
      }
      if (proxyEditMode) {
        proxyEditMode = false;
        panel.setProxyEditModeEnabled(false);
        viewer.transformControls.detach();
        syncInteractionMode();
      }
      syncContentTransforms(true, true);
      const visibleApplied = applyProxyVisibility(appState.showProxyMesh, { reportBlocked: true });
      viewer.setCollisionEnabled(appState.collisionEnabled);
      rebuildOutliner();
      panel.setStatus(
        visibleApplied
          ? `Loaded proxy mesh from ${file.name}${proxyCalibrationLabel ? ` (auto aligned: ${proxyCalibrationLabel}, scale ${proxyCalibrationScale.toFixed(3)})` : ''}.`
          : `Loaded proxy mesh from ${file.name}, but kept hidden for stability.`,
        visibleApplied ? 'success' : 'warning'
      );
      URL.revokeObjectURL(url);
    }).catch(err => {
      console.error('Failed to load proxy mesh:', err);
      panel.setStatus(`Failed to load proxy mesh: ${err.message}`, 'error');
      URL.revokeObjectURL(url);
    });
  });

  // --- Voxel Edit Mode ---

  const voxelEditState = new VoxelEditState();

  voxelEditState.onChange(() => {
    panel.setVoxelSelectionCount(voxelEditState.getSelectedCount());
  });

  panel.onExportVoxelGlbRequested(async () => {
    const voxelData = voxelEditState.getVoxelData();
    if (!voxelData) {
      panel.setStatus('Generate or load a voxel proxy mesh first.', 'warning');
      return;
    }

    try {
      const exportMesh = createExportableVoxelMesh(voxelData);
      const baseName = currentSplatRef?.name ? currentSplatRef.name.replace(/\.[^.]+$/, '') : 'voxel_proxy';
      await exportObjectAsGlb(exportMesh, `${baseName}.voxel_proxy`);
      panel.setStatus(`Exported voxel proxy .glb (${exportMesh.count.toLocaleString()} active voxels).`, 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Voxel proxy export failed: ${detail}`, 'error');
      console.error(error);
    }
  });

  panel.onGenerateVoxelRequested(async () => {
    if (!currentMesh) {
      panel.setStatus('Load a splat scene first to generate proxy collision.', 'warning');
      return;
    }

    panel.setLoading(true);
    try {
      const resolution = panel.getVoxelResolution();
      const densityThreshold = panel.getVoxelDensity();

      const voxelData = await generateVoxelMesh(currentMesh, {
        resolution,
        densityThreshold,
        onProgress: (progress, status) => {
          panel.setStatus(`Generating collision: ${status} (${Math.round(progress * 100)}%)`, 'info');
        }
      });

      if (!voxelData) {
        panel.setStatus('No solid voxels found. Try lowering density threshold or increasing voxel size.', 'warning');
        return;
      }

      voxelEditState.setVoxelData(voxelData);
      viewer.setVoxelProxy(voxelData.mesh);
      viewer.setVoxelCollisionData(voxelData);
      proxyKind = 'voxel';
      proxyBaseTransform = null;
      proxyAlignOffset.set(0, 0, 0);
      proxyDeltaPos.set(0, 0, 0);
      proxyDeltaQuat.set(0, 0, 0, 1);
      proxyDeltaScale.set(1, 1, 1);
      appState.proxyUserPosition = [0, 0, 0];
      appState.proxyUserQuaternion = [0, 0, 0, 1];
      appState.proxyUserScale = [1, 1, 1];
      if (proxyEditMode) {
        proxyEditMode = false;
        panel.setProxyEditModeEnabled(false);
        viewer.transformControls.detach();
        syncInteractionMode();
      }
      syncContentTransforms(true);
      applyProxyVisibility(appState.showProxyMesh, { reportBlocked: true });
      viewer.setCollisionEnabled(appState.collisionEnabled);
      rebuildOutliner();
      // If edit mode is already on, sync immediately
      if (panel.isVoxelEditMode()) {
        viewer.setVoxelEditState(voxelEditState, currentMesh);
      }
      panel.setStatus(`Auto-generated ${voxelData.activeCount} voxels. Toggle Voxel Edit Mode to select and delete.`, 'success');
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      panel.setStatus(`Collision generation failed: ${detail}`, 'error');
    } finally {
      panel.setLoading(false);
    }
  });

  panel.onVoxelEditModeChanged((enabled) => {
    if (enabled && !voxelEditState.getVoxelData()) {
      panel.setStatus('Generate a voxel proxy mesh first before entering edit mode.', 'warning');
      panel.setVoxelEditMode(false);
      return;
    }
    appState.voxelEditMode = enabled;
    if (enabled && proxyEditMode) {
      proxyEditMode = false;
      panel.setProxyEditModeEnabled(false);
    }
    if (enabled && outlinerEditMode) {
      outlinerEditMode = false;
      panel.setOutlinerEditModeEnabled(false);
    }
    syncInteractionMode();
    if (enabled) {
      panel.setStatus('Voxel Edit Mode: Click voxels to select. Shift+click for multi-select. Press Delete or use button to remove.', 'info');
    } else {
      panel.setStatus('Exited Voxel Edit Mode.', 'info');
    }
  });

  // --- Voxel Dragging (TransformControls) ---
  const dragHelper = new THREE.Object3D();
  viewer.scene.add(dragHelper);
  let dragStartPos = new THREE.Vector3();

  // Hide controls if nothing selected
  viewer.transformControls.detach();

  // Sync transform controls with selection
  voxelEditState.onChange(() => {
    if (viewer.getInteractionMode() !== 'voxel-edit') return;

    panel.setVoxelSelectionCount(voxelEditState.getSelectedCount());

    // Position drag helper at center of selection
    const selected = voxelEditState.getSelected();
    const data = voxelEditState.getVoxelData();
    if (selected.size > 0 && data) {
      const center = new THREE.Vector3();
      const tempObj = new THREE.Object3D();
      for (const idx of selected) {
        data.mesh.getMatrixAt(idx, tempObj.matrix);
        tempObj.matrix.decompose(tempObj.position, tempObj.quaternion, tempObj.scale);
        center.add(tempObj.position);
      }
      center.divideScalar(selected.size);

      // Update drag helper without triggering drag events
      dragHelper.position.copy(center);
      if (viewer.transformControls.object !== dragHelper) {
        viewer.transformControls.attach(dragHelper);
      }
    } else {
      viewer.transformControls.detach();
    }
  });

  // Track dragging to update voxels visually and commit on end
  let lastDragPos = new THREE.Vector3();
  let isDraggingVoxels = false;

  viewer.transformControls.addEventListener('dragging-changed', (event) => {
    if (viewer.getInteractionMode() !== 'voxel-edit') {
      return;
    }
    if (viewer.transformControls.object !== dragHelper) {
      return;
    }
    if (event.value) {
      // Drag started
      isDraggingVoxels = true;
      dragStartPos.copy(dragHelper.position);
      lastDragPos.copy(dragHelper.position);
    } else {
      // Drag ended: commit the net delta to the edit state
      isDraggingVoxels = false;
      const netDelta = new THREE.Vector3().subVectors(dragHelper.position, dragStartPos);

      // Because we moved the instances visually during the drag, 
      // VoxelEditState.moveSelected will move them AGAIN if we don't reset them first.
      // So we revert the visual-only move before committing the real move.
      const data = voxelEditState.getVoxelData();
      if (data) {
        const reverseDelta = netDelta.clone().negate();
        for (const idx of voxelEditState.getSelected()) {
          data.mesh.getMatrixAt(idx, dragHelper.matrix);
          dragHelper.matrix.decompose(dragHelper.position, dragHelper.quaternion, dragHelper.scale);
          dragHelper.position.add(reverseDelta);
          dragHelper.updateMatrix();
          data.mesh.setMatrixAt(idx, dragHelper.matrix);
        }
        data.mesh.instanceMatrix.needsUpdate = true;
      }

      if (netDelta.lengthSq() > 1e-6) {
        voxelEditState.moveSelected(netDelta);
      }
    }
  });

  viewer.transformControls.addEventListener('change', () => {
    if (viewer.getInteractionMode() !== 'voxel-edit') {
      return;
    }
    if (viewer.transformControls.object !== dragHelper) {
      return;
    }
    if (!isDraggingVoxels) return;

    // Visual-only real-time update of instances during drag
    const delta = new THREE.Vector3().subVectors(dragHelper.position, lastDragPos);
    lastDragPos.copy(dragHelper.position);

    const data = voxelEditState.getVoxelData();
    if (data && delta.lengthSq() > 1e-6) {
      const tempObj = new THREE.Object3D();
      for (const idx of voxelEditState.getSelected()) {
        data.mesh.getMatrixAt(idx, tempObj.matrix);
        tempObj.matrix.decompose(tempObj.position, tempObj.quaternion, tempObj.scale);
        tempObj.position.add(delta);
        tempObj.updateMatrix();
        data.mesh.setMatrixAt(idx, tempObj.matrix);
      }
      data.mesh.instanceMatrix.needsUpdate = true;
    }
  });

  // Voxel click handler
  const onVoxelClick = (event: MouseEvent): void => {
    if (viewer.getInteractionMode() !== 'voxel-edit') return;
    // Don't select if clicking on the transform controls!
    if (viewer.transformControls.dragging) return;

    // Optional: check if mouse is hitting transform controls gizmo
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, viewer.camera);

    // We check if the transform controls were hit (its children)
    const gizmoHits = raycaster.intersectObject(viewer.transformControls.getHelper(), true);
    if (gizmoHits.length > 0) return; // Ignore clicks on the arrows

    const instanceId = viewer.raycastVoxel(event);
    if (instanceId === null) {
      if (!event.shiftKey) voxelEditState.clearSelection();
      return;
    }

    if (event.shiftKey) {
      voxelEditState.toggleSelect(instanceId);
    } else {
      voxelEditState.selectOnly(instanceId);
    }
  };

  viewer.renderer.domElement.addEventListener('click', onVoxelClick);

  panel.onVoxelDeleteRequested(() => {
    const deleted = voxelEditState.deleteSelected();
    if (deleted.length === 0) {
      panel.setStatus('No voxels selected to delete.', 'warning');
      return;
    }
    panel.setStatus(`Deleted ${deleted.length} voxel(s). Use Undo to restore.`, 'info');
  });

  panel.onVoxelUndoRequested(() => {
    const undone = voxelEditState.undo();
    if (!undone) {
      panel.setStatus('Nothing to undo.', 'warning');
      return;
    }
    panel.setStatus('Undo applied.', 'info');
  });

  // Keyboard shortcuts for voxel edit mode
  window.addEventListener('keydown', (event) => {
    if (viewer.getInteractionMode() !== 'voxel-edit') return;
    if (event.code === 'Delete' || event.code === 'Backspace') {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      event.preventDefault();
      const deleted = voxelEditState.deleteSelected();
      if (deleted.length > 0) {
        panel.setStatus(`Deleted ${deleted.length} voxel(s). Use Undo to restore.`, 'info');
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
      event.preventDefault();
      const undone = voxelEditState.undo();
      if (undone) {
        panel.setStatus('Undo applied.', 'info');
      }
    }
  });

  panel.onRendererLightingSettingsChanged((settings: RendererLightingSettings) => {
    appState.physicallyCorrectLights = settings.physicallyCorrectLights;
    appState.toneMapping = settings.toneMapping;
    appState.toneMappingExposure = settings.toneMappingExposure;
    appState.shadowsEnabled = settings.shadowsEnabled;
    syncLights();
    panel.setStatus('Renderer lighting settings updated.', 'info');
  });

  panel.onSaveSceneFileRequested(() => {
    try {
      const snapshot = buildSceneSnapshot();
      triggerSceneDownload(snapshot, snapshot.sceneName);
      panel.setStatus(`Scene exported to .sparkscene.json (${snapshot.sceneName}).`, 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Scene export failed: ${detail}`, 'error');
    }
  });

  panel.onLoadSceneFileRequested(async (file) => {
    try {
      const loadedScene = await loadSceneFileFromUpload(file);
      applyLoadedScene(loadedScene, `Scene file ${file.name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Scene file load failed: ${detail}`, 'error');
      console.error(error);
    }
  });

  panel.onSaveSceneSlotRequested((slotName) => {
    try {
      const snapshot = buildSceneSnapshot();
      saveSceneSlot(slotName, snapshot);
      panel.setSceneSlotName(slotName);
      refreshSceneSlotList(slotName);
      panel.setStatus(`Saved scene slot "${slotName}".`, 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Save slot failed: ${detail}`, 'error');
    }
  });

  panel.onLoadSceneSlotRequested((slotName) => {
    try {
      const scene = loadSceneSlot(slotName);
      applyLoadedScene(scene, `Scene slot "${slotName}"`);
      panel.setSceneSlotName(slotName);
      refreshSceneSlotList(slotName);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Load slot failed: ${detail}`, 'error');
      console.error(error);
    }
  });

  panel.onDeleteSceneSlotRequested((slotName) => {
    try {
      const deleted = deleteSceneSlot(slotName);
      if (!deleted) {
        panel.setStatus(`Scene slot "${slotName}" was not found.`, 'warning');
        return;
      }

      refreshSceneSlotList();
      panel.setStatus(`Deleted scene slot "${slotName}".`, 'info');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      panel.setStatus(`Delete slot failed: ${detail}`, 'error');
    }
  });
}

bootstrap().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  const status = document.getElementById('status');
  if (status) {
    status.textContent = `Startup failed: ${detail}`;
    status.className = 'error';
  }
  console.error(error);
});
