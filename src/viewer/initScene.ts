import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader, OBJLoader } from 'three-stdlib';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  assertSparkPreviewApi,
  createSparkRenderer,
  type SparkModuleLike,
  type SparkRendererLike,
  type SplatMeshLike,
  type SplatEditLike,
  type SplatEditSdfLike,
  type SplatModifierLike
} from '../spark/previewAdapter';
import type { SceneSettingsV2 } from '../scene/sceneState';
import type { VoxelEditState } from './voxelEditState';
import type { VoxelData } from './voxelizer';
import { installBvhRaycastExtensions } from './setup/bvh';
import { resolveToneMapping } from './setup/renderer';
import { detectWebGPUSupport, type RenderBackendCapabilities } from './unifiedRenderer';

export type InteractionMode = 'view' | 'light-edit' | 'voxel-edit' | 'proxy-edit' | 'outliner-edit';

export interface ViewerContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sparkRenderer: SparkRendererLike;
  lightRoot: THREE.Group;
  defaultLights: {
    ambient: THREE.AmbientLight;
    key: THREE.DirectionalLight;
  };
  controls: PointerLockControls;
  pointerLockControls: PointerLockControls;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  renderBackend: RenderBackendCapabilities | null;

  setProxyMesh: (url: string | null, fileName?: string | null) => Promise<void>;
  getProxyMesh: () => THREE.Object3D | null;
  setVoxelProxy: (mesh: THREE.Object3D | null) => void;
  setVoxelCollisionData: (data: VoxelData | null) => void;
  setCollisionEnabled: (enabled: boolean) => void;
  setShowProxyMesh: (show: boolean) => { applied: boolean; reason?: string };
  setDynamicResolution: (enabled: boolean) => void;
  raycastVoxel: (event: MouseEvent) => number | null;

  setPointerLockEnabled: (enabled: boolean) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  applyRendererLightingSettings: (settings: Pick<SceneSettingsV2, 'physicallyCorrectLights' | 'toneMapping' | 'toneMappingExposure' | 'shadowsEnabled'>) => void;
  getInteractionMode: () => InteractionMode;
  setVoxelEditState: (state: VoxelEditState | null, mesh: SplatMeshLike | null) => void;
  debugStep: (deltaTime?: number) => void;
  debugGetState: () => {
    interactionMode: InteractionMode;
    pointerLockEnabled: boolean;
    collisionEnabled: boolean;
    hasVoxelCollision: boolean;
    meshColliderCount: number;
    verticalVelocity: number;
    isGrounded: boolean;
    lastUseGravity: boolean;
    lastHadColliders: boolean;
    lastDelta: { x: number; y: number; z: number };
    cameraPosition: { x: number; y: number; z: number };
    lastBeforePosition: { x: number; y: number; z: number };
    lastAfterPosition: { x: number; y: number; z: number };
    lastCollisionPath: 'none' | 'voxel' | 'mesh';
  };
  debugVoxelProbe: (position?: { x: number; y: number; z: number }) => {
    enabled: boolean;
    colliding: boolean;
    capsuleCenter: { x: number; y: number; z: number };
    aabbMin: { x: number; y: number; z: number };
    aabbMax: { x: number; y: number; z: number };
    minIndex: { x: number; y: number; z: number };
    maxIndex: { x: number; y: number; z: number };
    resolution: number;
    origin: { x: number; y: number; z: number };
  };
  isVrSupported: () => Promise<boolean>;
  createVrButton: () => Promise<HTMLElement | null>;
  isVrSessionActive: () => boolean;
  dispose: () => void;
}

export function initViewer(
  container: HTMLElement,
  sparkModule: SparkModuleLike,
  onContextLost?: (message: string) => void
): ViewerContext {
  installBvhRaycastExtensions();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030712');

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(2, 1.5, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  container.appendChild(renderer.domElement);

  const DYNAMIC_RESOLUTION = {
    enabled: false,
    minFps: 30,
    maxFps: 60,
    scaleFactors: [1.0, 0.875, 0.75, 0.625, 0.5],
    currentIndex: 0,
    fpsHistory: [] as number[],
    historySize: 60,
    lastFrameTime: performance.now(),
    checkIntervalMs: 500
  };

  let renderBackend: RenderBackendCapabilities | null = null;

  detectWebGPUSupport().then(({ supported, adapter }) => {
    if (supported && adapter) {
      renderBackend = {
        backend: 'webgpu',
        maxTextureSize: 8192,
        maxComputeWorkgroupSize: 256,
        supportsComputeShaders: true,
        supportsStorageBuffers: true,
        supportsRaytracing: false
      };
      console.log('[Renderer] WebGPU available - splat rendering can leverage GPU compute');
    } else {
      renderBackend = {
        backend: 'webgl',
        maxTextureSize: renderer.capabilities.maxTextureSize,
        maxComputeWorkgroupSize: 0,
        supportsComputeShaders: false,
        supportsStorageBuffers: false,
        supportsRaytracing: false
      };
      console.log('[Renderer] Using WebGL2 backend');
    }
  }).catch(() => {
    renderBackend = {
      backend: 'webgl',
      maxTextureSize: renderer.capabilities.maxTextureSize,
      maxComputeWorkgroupSize: 0,
      supportsComputeShaders: false,
      supportsStorageBuffers: false,
      supportsRaytracing: false
    };
    console.log('[Renderer] Using WebGL2 backend');
  });

  let vrSessionActive = false;
  renderer.xr.addEventListener('sessionstart', () => {
    vrSessionActive = true;
    if (pointerLockControls.isLocked) {
      pointerLockControls.unlock();
    }
    orbitControls.enabled = false;
  });
  renderer.xr.addEventListener('sessionend', () => {
    vrSessionActive = false;
  });

  const isVrSupported = async (): Promise<boolean> => {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      return false;
    }
  };

  const createVrButton = async (): Promise<HTMLElement | null> => {
    try {
      const supported = await isVrSupported();
      if (!supported) return null;
      const vrButton = VRButton.createButton(renderer);
      return vrButton;
    } catch {
      return null;
    }
  };

  const pointerLockControls = new PointerLockControls(camera, renderer.domElement);
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.enabled = false;

  const transformControls = new TransformControls(camera, renderer.domElement);
  const transformHelper = transformControls.getHelper();
  transformControls.enabled = false;
  transformHelper.visible = false;
  scene.add(transformHelper);

  let pointerLockEnabled = true;
  let interactionMode: InteractionMode = 'view';
  let isTransformDragging = false;

  const syncControlActivation = (): void => {
    if (interactionMode === 'voxel-edit' || interactionMode === 'proxy-edit' || interactionMode === 'outliner-edit') {
      transformControls.enabled = true;
      transformHelper.visible = true;
      orbitControls.enabled = !isTransformDragging;
      return;
    }

    transformControls.enabled = false;
    transformHelper.visible = false;
    orbitControls.enabled = interactionMode === 'light-edit';
  };

  transformControls.addEventListener('dragging-changed', (event) => {
    isTransformDragging = Boolean(event.value);
    syncControlActivation();
  });

  const onCanvasClick = (): void => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== renderer.domElement) {
      active.blur();
    }
    if (interactionMode === 'view' && pointerLockEnabled) {
      pointerLockControls.lock();
    }
  };
  renderer.domElement.addEventListener('click', onCanvasClick);

  const movementKeys = new Set<string>();
  const frameClock = new THREE.Clock();
  const MOVE_SPEED = 5;
  const BOOST_MULTIPLIER = 3;
  const PLAYER_RADIUS = 0.3;
  const GRAVITY = -15;
  const JUMP_SPEED = 6;
  const PLAYER_HEIGHT = 1.6;
  const COLLISION_RADIUS = PLAYER_RADIUS * 0.6;
  const COLLISION_HEIGHT = PLAYER_HEIGHT * 0.75;
  const CAPSULE_HALF_SEGMENT = Math.max((COLLISION_HEIGHT * 0.5) - COLLISION_RADIUS, 0.03);
  const CAPSULE_HALF_EXTENT = CAPSULE_HALF_SEGMENT + COLLISION_RADIUS;
  const COLLISION_SKIN = 0.02;
  const STEP_HEIGHT = 0.35;
  const MAX_UNSTUCK_HEIGHT = 8;
  const UNSTUCK_MAX_RADIUS_STEPS = 12;

  let verticalVelocity = 0;
  let isGrounded = false;
  let lastUseGravity = false;
  let lastHadColliders = false;
  const lastDelta = new THREE.Vector3();
  const lastBeforePosition = new THREE.Vector3();
  const lastAfterPosition = new THREE.Vector3();
  let lastCollisionPath: 'none' | 'voxel' | 'mesh' = 'none';

  let collisionEnabled = true;
  let proxyMesh: THREE.Object3D | null = null;
  let colliderMeshes: THREE.Mesh[] = [];
  let voxelCollisionData: VoxelData | null = null;
  const MAX_PROXY_TRIANGLES_FOR_BVH = 1_500_000;
  const MAX_PROXY_TRIANGLES_FOR_VISIBLE_DEBUG = 6_000_000;
  let proxyTriangleCount = 0;
  let proxyDebugMaterial: THREE.Material | null = null;
  const proxyVertexColorMaterials: THREE.Material[] = [];

  const tempForward = new THREE.Vector3();
  const tempRight = new THREE.Vector3();
  const tempMove = new THREE.Vector3();
  const tempDelta = new THREE.Vector3();
  const tempPosition = new THREE.Vector3();
  const tempTarget = new THREE.Vector3();
  // Dedicated "desired end position" to avoid aliasing with tempTarget (which is also used as scratch).
  const tempDesired = new THREE.Vector3();
  const tempResolve = new THREE.Vector3();
  const tempClosestPoint = new THREE.Vector3();
  const tempNormal = new THREE.Vector3();
  const tempLocalSphere = new THREE.Sphere(new THREE.Vector3(), COLLISION_RADIUS);
  const tempWorldSphere = new THREE.Sphere(new THREE.Vector3(), COLLISION_RADIUS);
  const tempLocalBox = new THREE.Box3();
  const tempWorldBox = new THREE.Box3();
  const tempBoxSize = new THREE.Vector3();
  const tempInverseMatrix = new THREE.Matrix4();
  const groundRayDirection = new THREE.Vector3(0, -1, 0);
  const groundRaycaster = new THREE.Raycaster();
  const voxelAabbMin = new THREE.Vector3();
  const voxelAabbMax = new THREE.Vector3();
  const tempCapsuleCenter = new THREE.Vector3();

  const lightRoot = new THREE.Group();
  lightRoot.name = 'light-root';
  scene.add(lightRoot);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(5, 8, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  lightRoot.add(ambient, key, key.target);

  const sparkRenderer = createSparkRenderer(renderer, sparkModule);
  scene.add(sparkRenderer);

  const onResize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const onContextLostInternal = (event: Event): void => {
    event.preventDefault();
    onContextLost?.('WebGL context was lost. Reload the page to recover rendering.');
  };

  const shouldCaptureKeyboard = (): boolean => {
    const active = document.activeElement;
    if (!active) {
      return true;
    }

    if (active instanceof HTMLTextAreaElement || (active as HTMLElement).isContentEditable) {
      return false;
    }

    if (active instanceof HTMLInputElement) {
      const type = active.type.toLowerCase();
      const textEntryTypes = new Set([
        'text',
        'number',
        'search',
        'email',
        'password',
        'tel',
        'url'
      ]);
      return !textEntryTypes.has(type);
    }

    return true;
  };

  const handledKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'Space',
    'ShiftLeft',
    'ShiftRight'
  ]);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      interactionMode !== 'view' ||
      !pointerLockEnabled ||
      !handledKeys.has(event.code) ||
      !shouldCaptureKeyboard()
    ) {
      return;
    }

    movementKeys.add(event.code);
    event.preventDefault();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!handledKeys.has(event.code)) {
      return;
    }

    movementKeys.delete(event.code);
  };

  const onWindowBlur = (): void => {
    movementKeys.clear();
  };

  const hasVoxelCollision = (): boolean => {
    return Boolean(voxelCollisionData && voxelCollisionData.occupiedKeys.size > 0);
  };

  const getCapsuleCenter = (eyePosition: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => {
    return out.set(eyePosition.x, eyePosition.y - (COLLISION_HEIGHT * 0.5), eyePosition.z);
  };

  const isVoxelCapsuleColliding = (eyePosition: THREE.Vector3, ignoreGround = false): boolean => {
    if (!voxelCollisionData) {
      return false;
    }

    getCapsuleCenter(eyePosition, tempCapsuleCenter);
    const radius = Math.max(COLLISION_RADIUS - COLLISION_SKIN, 0.01);
    const groundIgnoreOffset = ignoreGround
      ? Math.max(COLLISION_SKIN * 3, voxelCollisionData.resolution * 0.2)
      : 0;
    voxelAabbMin.set(
      tempCapsuleCenter.x - radius,
      tempCapsuleCenter.y - CAPSULE_HALF_SEGMENT - radius + groundIgnoreOffset,
      tempCapsuleCenter.z - radius
    );
    voxelAabbMax.set(
      tempCapsuleCenter.x + radius,
      tempCapsuleCenter.y + CAPSULE_HALF_SEGMENT + radius,
      tempCapsuleCenter.z + radius
    );

    const origin = voxelCollisionData.origin;
    const resolution = voxelCollisionData.resolution;
    const minX = Math.floor((voxelAabbMin.x - origin.x) / resolution);
    const minY = Math.floor((voxelAabbMin.y - origin.y) / resolution);
    const minZ = Math.floor((voxelAabbMin.z - origin.z) / resolution);
    const maxX = Math.floor((voxelAabbMax.x - origin.x) / resolution);
    const maxY = Math.floor((voxelAabbMax.y - origin.y) / resolution);
    const maxZ = Math.floor((voxelAabbMax.z - origin.z) / resolution);

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (voxelCollisionData.occupiedKeys.has(`${x},${y},${z}`)) {
            return true;
          }
        }
      }
    }

    return false;
  };

  const resolveWithMeshColliders = (targetPosition: THREE.Vector3): void => {
    tempPosition.copy(targetPosition);
    isGrounded = false;

    const maxIterations = 3;
    for (let i = 0; i < maxIterations; i++) {
      let maxPenetration = 0;
      tempResolve.set(0, 0, 0);

      getCapsuleCenter(tempPosition, tempCapsuleCenter);
      tempBoxSize.set(COLLISION_RADIUS * 2, CAPSULE_HALF_EXTENT * 2, COLLISION_RADIUS * 2);
      tempWorldSphere.center.copy(tempCapsuleCenter);
      tempWorldSphere.radius = COLLISION_RADIUS;
      tempWorldBox.setFromCenterAndSize(tempCapsuleCenter, tempBoxSize);

      for (const mesh of colliderMeshes) {
        if (!mesh.geometry.boundsTree) {
          continue;
        }

        mesh.updateMatrixWorld();
        tempInverseMatrix.copy(mesh.matrixWorld).invert();
        tempLocalSphere.center.copy(tempWorldSphere.center).applyMatrix4(tempInverseMatrix);
        tempLocalSphere.radius = tempWorldSphere.radius;
        tempLocalBox.copy(tempWorldBox).applyMatrix4(tempInverseMatrix);

        mesh.geometry.boundsTree.shapecast({
          intersectsBounds: (box: THREE.Box3) => box.intersectsBox(tempLocalBox),
          intersectsTriangle: (tri: THREE.Triangle) => {
            tri.closestPointToPoint(tempLocalSphere.center, tempClosestPoint);
            const distSq = tempClosestPoint.distanceToSquared(tempLocalSphere.center);
            const radiusSq = tempLocalSphere.radius * tempLocalSphere.radius;
            if (distSq >= radiusSq) {
              return;
            }

            const depth = tempLocalSphere.radius - Math.sqrt(Math.max(distSq, 1e-12));
            if (depth <= maxPenetration) {
              return;
            }

            tempNormal.subVectors(tempLocalSphere.center, tempClosestPoint);
            if (tempNormal.lengthSq() <= 1e-12) {
              return;
            }

            tempNormal.normalize();
            tempResolve.copy(tempNormal).transformDirection(mesh.matrixWorld).normalize().multiplyScalar(depth);
            maxPenetration = depth;
        }
      });
      proxyMesh = null;
      colliderMeshes = [];
      proxyTriangleCount = 0;
      if (proxyDebugMaterial) {
        proxyDebugMaterial.dispose();
        proxyDebugMaterial = null;
      }
      proxyVertexColorMaterials.forEach(mat => mat.dispose());
      proxyVertexColorMaterials.length = 0;
    }

      if (maxPenetration <= 0.001) {
        break;
      }

      tempPosition.add(tempResolve);
      if (tempResolve.y > 0.001) {
        isGrounded = true;
        if (verticalVelocity < 0) {
          verticalVelocity = 0;
        }
      }
    }

    if (!isGrounded) {
      getCapsuleCenter(tempPosition, tempCapsuleCenter);
      groundRaycaster.set(tempCapsuleCenter, groundRayDirection);
      groundRaycaster.near = 0;
      groundRaycaster.far = CAPSULE_HALF_EXTENT + 0.05;
      for (const mesh of colliderMeshes) {
        if (groundRaycaster.intersectObject(mesh, false).length > 0) {
          isGrounded = true;
          if (verticalVelocity < 0) {
            verticalVelocity = 0;
          }
          break;
        }
      }
    }

    camera.position.copy(tempPosition);
  };

  const resolveWithVoxelColliders = (targetPosition: THREE.Vector3): void => {
    const tryFindNearestFree = (position: THREE.Vector3): boolean => {
      if (!voxelCollisionData) {
        return true;
      }

      if (!isVoxelCapsuleColliding(position)) {
        return true;
      }

      const resolution = voxelCollisionData.resolution;
      const stepSize = Math.max(0.05, resolution * 0.5);
      const maxLift = Math.max(MAX_UNSTUCK_HEIGHT, resolution * 32);

      // Search upward first (cheap).
      for (let offsetY = stepSize; offsetY <= maxLift + 1e-3; offsetY += stepSize) {
        tempTarget.copy(position);
        tempTarget.y += offsetY;
        if (!isVoxelCapsuleColliding(tempTarget)) {
          position.copy(tempTarget);
          return true;
        }
      }

      // Spiral out in XZ, also trying modest step-up to escape tight spots.
      const angleSteps = 12;
      for (let ring = 1; ring <= UNSTUCK_MAX_RADIUS_STEPS; ring++) {
        const radius = ring * resolution;
        for (let a = 0; a < angleSteps; a++) {
          const theta = (a / angleSteps) * Math.PI * 2;
          const dx = Math.cos(theta) * radius;
          const dz = Math.sin(theta) * radius;

          // Try a few vertical offsets (0..stepHeight..maxLift)
          for (let offsetY = 0; offsetY <= Math.min(maxLift, STEP_HEIGHT * 3) + 1e-3; offsetY += stepSize) {
            tempTarget.set(position.x + dx, position.y + offsetY, position.z + dz);
            if (!isVoxelCapsuleColliding(tempTarget)) {
              position.copy(tempTarget);
              return true;
            }
          }
        }
      }

      return false;
    };

    const tryUnstuckUpward = (position: THREE.Vector3): boolean => {
      const resolution = voxelCollisionData?.resolution ?? 0.2;
      const stepSize = Math.max(0.05, resolution * 0.5);
      const maxLift = Math.max(MAX_UNSTUCK_HEIGHT, resolution * 32);

      if (!isVoxelCapsuleColliding(position)) {
        return true;
      }

      for (let offset = stepSize; offset <= maxLift + 1e-3; offset += stepSize) {
        tempTarget.copy(position);
        tempTarget.y += offset;
        if (!isVoxelCapsuleColliding(tempTarget)) {
          position.copy(tempTarget);
          return true;
        }
      }

      return false;
    };

    tempPosition.copy(camera.position);
    isGrounded = false;

    if (!tryFindNearestFree(tempPosition)) {
      camera.position.copy(targetPosition);
      return;
    }

    tempTarget.copy(tempPosition);
    tempTarget.x = targetPosition.x;
    if (!isVoxelCapsuleColliding(tempTarget, true)) {
      tempPosition.x = tempTarget.x;
    }

    tempTarget.copy(tempPosition);
    tempTarget.z = targetPosition.z;
    if (!isVoxelCapsuleColliding(tempTarget, true)) {
      tempPosition.z = tempTarget.z;
    }

    tempTarget.copy(tempPosition);
    tempTarget.y = targetPosition.y;
    if (!isVoxelCapsuleColliding(tempTarget)) {
      tempPosition.y = tempTarget.y;
      isGrounded = false;
    } else if (targetPosition.y < tempPosition.y) {
      isGrounded = true;
      if (verticalVelocity < 0) {
        verticalVelocity = 0;
      }
    }

    // Small step-up for ledges so forward motion does not dead-stop.
    if (isVoxelCapsuleColliding(tempPosition)) {
      const stepSize = Math.max(0.05, (voxelCollisionData?.resolution ?? 0.2) * 0.25);
      let stepped = false;
      for (let offset = stepSize; offset <= STEP_HEIGHT + 1e-3; offset += stepSize) {
        tempTarget.copy(tempPosition);
        tempTarget.y += offset;
        if (!isVoxelCapsuleColliding(tempTarget)) {
          tempPosition.copy(tempTarget);
          stepped = true;
          break;
        }
      }

      if (!stepped && !tryUnstuckUpward(tempPosition)) {
        camera.position.copy(targetPosition);
        return;
      }
    }

    camera.position.copy(tempPosition);
  };

  const applyWasdMovement = (deltaTime: number, force = false): void => {
    if (interactionMode !== 'view' || !pointerLockEnabled) {
      return;
    }

    // In normal runtime, movement requires pointer lock for true FPS feel.
    // `force` exists for deterministic/headless testing via `debugStep()`.
    if (!force && !pointerLockControls.isLocked) {
      return;
    }

    let forwardAxis = 0;
    let rightAxis = 0;
    let verticalAxis = 0;
    if (movementKeys.has('KeyW')) {
      forwardAxis += 1;
    }
    if (movementKeys.has('KeyS')) {
      forwardAxis -= 1;
    }
    if (movementKeys.has('KeyD')) {
      rightAxis += 1;
    }
    if (movementKeys.has('KeyA')) {
      rightAxis -= 1;
    }
    if (movementKeys.has('KeyQ')) {
      verticalAxis += 1;
    }
    if (movementKeys.has('KeyE')) {
      verticalAxis -= 1;
    }

    const hasColliders = colliderMeshes.length > 0 || hasVoxelCollision();
    const useGravity = collisionEnabled && hasColliders;
    lastUseGravity = useGravity;
    lastHadColliders = hasColliders;

    if (movementKeys.has('Space') && isGrounded && useGravity) {
      verticalVelocity = JUMP_SPEED;
      isGrounded = false;
    }

    if (useGravity) {
      verticalVelocity += GRAVITY * deltaTime;
    }

    const boosted = movementKeys.has('ShiftLeft') || movementKeys.has('ShiftRight');
    const speed = MOVE_SPEED * (boosted ? BOOST_MULTIPLIER : 1) * deltaTime;

    // FPS-style movement: use yaw-consistent horizontal basis (ignore pitch).
    tempForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tempForward.y = 0;
    if (tempForward.lengthSq() < 1e-8) {
      // Looking straight up/down: fall back to yaw only.
      tempForward.set(0, 0, -1).applyAxisAngle(camera.up, camera.rotation.y);
      tempForward.y = 0;
    }
    tempForward.normalize();
    tempRight.crossVectors(tempForward, camera.up).normalize();

    tempMove.set(0, 0, 0);
    if (forwardAxis !== 0) {
      tempMove.addScaledVector(tempForward, forwardAxis);
    }
    if (rightAxis !== 0) {
      tempMove.addScaledVector(tempRight, rightAxis);
    }
    if (tempMove.lengthSq() > 0) {
      tempMove.normalize().multiplyScalar(speed);
    }

    let verticalMove = 0;
    if (useGravity) {
      verticalMove = verticalVelocity * deltaTime;
    } else {
      verticalMove = verticalAxis * speed;
    }

    tempDelta.set(tempMove.x, verticalMove, tempMove.z);
    lastDelta.copy(tempDelta);
    if (tempDelta.lengthSq() === 0) {
      return;
    }

    lastBeforePosition.copy(camera.position);

    tempDesired.copy(camera.position).add(tempDelta);

    if (!collisionEnabled || !hasColliders) {
      camera.position.copy(tempDesired);
      lastCollisionPath = 'none';
      lastAfterPosition.copy(camera.position);
      return;
    }

    if (hasVoxelCollision()) {
      resolveWithVoxelColliders(tempDesired);
      lastCollisionPath = 'voxel';
      lastAfterPosition.copy(camera.position);
      return;
    }

    resolveWithMeshColliders(tempDesired);
    lastCollisionPath = 'mesh';
    lastAfterPosition.copy(camera.position);
  };

  const setInteractionMode = (mode: InteractionMode): void => {
    interactionMode = mode;
    movementKeys.clear();

    if (interactionMode !== 'view') {
      pointerLockControls.unlock();
    }

    syncControlActivation();
  };

  const setPointerLockEnabled = (enabled: boolean): void => {
    pointerLockEnabled = enabled;
    movementKeys.clear();
    if (!pointerLockEnabled || interactionMode !== 'view') {
      pointerLockControls.unlock();
    }
    syncControlActivation();
  };

  const applyRendererLightingSettings = (
    settings: Pick<SceneSettingsV2, 'physicallyCorrectLights' | 'toneMapping' | 'toneMappingExposure' | 'shadowsEnabled'>
  ): void => {
    if ('useLegacyLights' in renderer) {
      (renderer as unknown as { useLegacyLights: boolean }).useLegacyLights = !settings.physicallyCorrectLights;
    }

    renderer.toneMapping = resolveToneMapping(settings.toneMapping);
    renderer.toneMappingExposure = Math.max(0.05, settings.toneMappingExposure);
    renderer.shadowMap.enabled = settings.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  };

  const setProxyMesh = async (url: string | null, fileName?: string | null): Promise<void> => {
    voxelCollisionData = null;

    if (proxyMesh) {
      scene.remove(proxyMesh);
      colliderMeshes.forEach(mesh => {
        if (mesh.geometry.boundsTree) {
          mesh.geometry.disposeBoundsTree();
        }
      });
      proxyMesh = null;
      colliderMeshes = [];
      proxyTriangleCount = 0;
      if (proxyDebugMaterial) {
        proxyDebugMaterial.dispose();
        proxyDebugMaterial = null;
      }
    }

    if (!url) {
      return;
    }

    const extSource = (fileName ?? url).split('?')[0].split('#')[0];
    const ext = extSource.includes('.') ? extSource.split('.').pop()!.toLowerCase() : '';

    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      // Needed for proxies produced by gltfpack (-c) and other EXT_meshopt_compression assets.
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      proxyMesh = gltf.scene;
    } else if (ext === 'obj') {
      const loader = new OBJLoader();
      proxyMesh = await loader.loadAsync(url);
    } else {
      throw new Error(`Unsupported proxy mesh format "${ext || 'unknown'}". Supported: .glb, .gltf, .obj`);
    }

    // Keep proxy rendering cheap/stable for high-poly meshes.
    proxyDebugMaterial = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      wireframe: false
    });

    const hasVertexColors = (geometry: THREE.BufferGeometry): boolean => {
      return geometry.getAttribute('color') !== undefined;
    };

    const getProxyMaterial = (geometry: THREE.BufferGeometry): THREE.Material => {
      if (hasVertexColors(geometry)) {
        const mat = new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          wireframe: false
        });
        proxyVertexColorMaterials.push(mat);
        return mat;
      }
      return proxyDebugMaterial!;
    };

    // Prevent the proxy mesh from fighting with splat colors or shadows.
    proxyMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.geometry instanceof THREE.BufferGeometry 
          ? getProxyMaterial(child.geometry) 
          : proxyDebugMaterial;
        child.material = mat;
        child.castShadow = false;
        child.receiveShadow = false;

        if (child.geometry instanceof THREE.BufferGeometry) {
          const indexCount = child.geometry.index?.count ?? 0;
          const posCount = child.geometry.attributes.position?.count ?? 0;
          const triCount = indexCount > 0 ? indexCount / 3 : posCount / 3;
          proxyTriangleCount += Number.isFinite(triCount) && triCount > 0 ? triCount : 0;

          if (Number.isFinite(triCount) && triCount > 0 && triCount <= MAX_PROXY_TRIANGLES_FOR_BVH) {
            try {
              child.geometry.computeBoundsTree!();
              colliderMeshes.push(child);
            } catch (err) {
              console.warn('Failed to build BVH for proxy mesh child; skipping collision for that part.', err);
            }
          } else if (triCount > MAX_PROXY_TRIANGLES_FOR_BVH) {
            console.warn(
              `Proxy mesh part has ~${Math.round(triCount).toLocaleString()} triangles; skipping BVH collision to avoid stalls.`
            );
          }
        }
      }
    });

    proxyMesh.visible = false;
    scene.add(proxyMesh);
  };

  const getProxyMesh = (): THREE.Object3D | null => proxyMesh;

  const setVoxelProxy = (mesh: THREE.Object3D | null): void => {
    if (proxyMesh) {
      scene.remove(proxyMesh);
      colliderMeshes.forEach(m => {
        if (m.geometry.boundsTree) {
          m.geometry.disposeBoundsTree();
        }
      });
      proxyMesh = null;
      colliderMeshes = [];
      proxyTriangleCount = 0;
      if (proxyDebugMaterial) {
        proxyDebugMaterial.dispose();
        proxyDebugMaterial = null;
      }
    }

    if (!mesh) {
      voxelCollisionData = null;
      return;
    }

    proxyMesh = mesh;
    proxyTriangleCount = 0;

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.geometry instanceof THREE.BufferGeometry)) {
        return;
      }
      const indexCount = child.geometry.index?.count ?? 0;
      const posCount = child.geometry.attributes.position?.count ?? 0;
      const triCount = indexCount > 0 ? indexCount / 3 : posCount / 3;
      proxyTriangleCount += Number.isFinite(triCount) && triCount > 0 ? triCount : 0;
    });

    // Only regular mesh proxies participate in BVH collisions.
    if (!(mesh instanceof THREE.InstancedMesh) && mesh instanceof THREE.Mesh && mesh.geometry instanceof THREE.BufferGeometry) {
      mesh.geometry.computeBoundsTree!();
      colliderMeshes.push(mesh);
    }

    // Set visibility according to the current UI state
    // We'll let setShowProxyMesh handle the actual state, but we initialize to false
    if (proxyMesh) proxyMesh.visible = false;
    if (proxyMesh) scene.add(proxyMesh);
  };

  const raycastVoxel = (event: MouseEvent): number | null => {
    if (!proxyMesh) return null;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(proxyMesh, true);
    if (intersects.length > 0) {
      const hit = intersects[0];
      // For InstancedMesh, instanceId is set on the intersection
      if (hit.instanceId !== undefined && hit.instanceId !== null) {
        return hit.instanceId;
      }
    }

    return null;
  };

  const setCollisionEnabled = (enabled: boolean): void => {
    collisionEnabled = enabled;
  };

  const setVoxelCollisionData = (data: VoxelData | null): void => {
    voxelCollisionData = data;
  };

  const setShowProxyMesh = (show: boolean): { applied: boolean; reason?: string } => {
    if (!proxyMesh) {
      return { applied: false, reason: 'No proxy mesh is loaded.' };
    }
    if (show && proxyTriangleCount > MAX_PROXY_TRIANGLES_FOR_VISIBLE_DEBUG) {
      proxyMesh.visible = false;
      return {
        applied: false,
        reason: `Proxy has ~${Math.round(proxyTriangleCount).toLocaleString()} triangles. Visibility is blocked to avoid GPU context loss.`
      };
    }
    proxyMesh.visible = show;
    return { applied: true };
  };

  const setDynamicResolution = (enabled: boolean): void => {
    DYNAMIC_RESOLUTION.enabled = enabled;
    if (!enabled) {
      DYNAMIC_RESOLUTION.currentIndex = 0;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  renderer.domElement.addEventListener('webglcontextlost', onContextLostInternal, false);

  renderer.setAnimationLoop(() => {
    const deltaTime = Math.min(frameClock.getDelta(), 0.05);
    applyWasdMovement(deltaTime);
    if (orbitControls.enabled) {
      orbitControls.update();
    }
    renderer.render(scene, camera);

    if (DYNAMIC_RESOLUTION.enabled) {
      const now = performance.now();
      const frameMs = now - DYNAMIC_RESOLUTION.lastFrameTime;
      DYNAMIC_RESOLUTION.lastFrameTime = now;
      const fps = 1000 / frameMs;

      DYNAMIC_RESOLUTION.fpsHistory.push(fps);
      if (DYNAMIC_RESOLUTION.fpsHistory.length > DYNAMIC_RESOLUTION.historySize) {
        DYNAMIC_RESOLUTION.fpsHistory.shift();
      }

      if (now % DYNAMIC_RESOLUTION.checkIntervalMs < frameMs) {
        const avgFps = DYNAMIC_RESOLUTION.fpsHistory.reduce((a, b) => a + b, 0) / DYNAMIC_RESOLUTION.fpsHistory.length;

        if (avgFps < DYNAMIC_RESOLUTION.minFps && DYNAMIC_RESOLUTION.currentIndex < DYNAMIC_RESOLUTION.scaleFactors.length - 1) {
          DYNAMIC_RESOLUTION.currentIndex++;
          const scale = DYNAMIC_RESOLUTION.scaleFactors[DYNAMIC_RESOLUTION.currentIndex];
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
        } else if (avgFps > DYNAMIC_RESOLUTION.maxFps && DYNAMIC_RESOLUTION.currentIndex > 0) {
          DYNAMIC_RESOLUTION.currentIndex--;
          const scale = DYNAMIC_RESOLUTION.scaleFactors[DYNAMIC_RESOLUTION.currentIndex];
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
        }
      }
    }
  });

  const debugStep = (deltaTime = 1 / 60): void => {
    applyWasdMovement(Math.max(0, Math.min(deltaTime, 0.05)), true);
  };

  const debugGetState = (): ViewerContext['debugGetState'] extends () => infer T ? T : never => {
    return {
      interactionMode,
      pointerLockEnabled,
      collisionEnabled,
      hasVoxelCollision: hasVoxelCollision(),
      meshColliderCount: colliderMeshes.length,
      verticalVelocity,
      isGrounded,
      lastUseGravity,
      lastHadColliders,
      lastDelta: { x: lastDelta.x, y: lastDelta.y, z: lastDelta.z },
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      lastBeforePosition: { x: lastBeforePosition.x, y: lastBeforePosition.y, z: lastBeforePosition.z },
      lastAfterPosition: { x: lastAfterPosition.x, y: lastAfterPosition.y, z: lastAfterPosition.z },
      lastCollisionPath
    };
  };

  const debugVoxelProbe = (
    position: { x: number; y: number; z: number } = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
  ): ViewerContext['debugVoxelProbe'] extends (...args: any[]) => infer T ? T : never => {
    if (!voxelCollisionData) {
      return {
        enabled: false,
        colliding: false,
        capsuleCenter: { x: position.x, y: position.y, z: position.z },
        aabbMin: { x: position.x, y: position.y, z: position.z },
        aabbMax: { x: position.x, y: position.y, z: position.z },
        minIndex: { x: 0, y: 0, z: 0 },
        maxIndex: { x: 0, y: 0, z: 0 },
        resolution: 0,
        origin: { x: 0, y: 0, z: 0 }
      };
    }

    tempTarget.set(position.x, position.y, position.z);
    const colliding = isVoxelCapsuleColliding(tempTarget);

    getCapsuleCenter(tempTarget, tempCapsuleCenter);
    const radius = Math.max(COLLISION_RADIUS - COLLISION_SKIN, 0.01);
    voxelAabbMin.set(
      tempCapsuleCenter.x - radius,
      tempCapsuleCenter.y - CAPSULE_HALF_SEGMENT - radius,
      tempCapsuleCenter.z - radius
    );
    voxelAabbMax.set(
      tempCapsuleCenter.x + radius,
      tempCapsuleCenter.y + CAPSULE_HALF_SEGMENT + radius,
      tempCapsuleCenter.z + radius
    );

    const origin = voxelCollisionData.origin;
    const resolution = voxelCollisionData.resolution;
    const minX = Math.floor((voxelAabbMin.x - origin.x) / resolution);
    const minY = Math.floor((voxelAabbMin.y - origin.y) / resolution);
    const minZ = Math.floor((voxelAabbMin.z - origin.z) / resolution);
    const maxX = Math.floor((voxelAabbMax.x - origin.x) / resolution);
    const maxY = Math.floor((voxelAabbMax.y - origin.y) / resolution);
    const maxZ = Math.floor((voxelAabbMax.z - origin.z) / resolution);

    return {
      enabled: true,
      colliding,
      capsuleCenter: { x: tempCapsuleCenter.x, y: tempCapsuleCenter.y, z: tempCapsuleCenter.z },
      aabbMin: { x: voxelAabbMin.x, y: voxelAabbMin.y, z: voxelAabbMin.z },
      aabbMax: { x: voxelAabbMax.x, y: voxelAabbMax.y, z: voxelAabbMax.z },
      minIndex: { x: minX, y: minY, z: minZ },
      maxIndex: { x: maxX, y: maxY, z: maxZ },
      resolution,
      origin: { x: origin.x, y: origin.y, z: origin.z }
    };
  };

  // --- Splat Masking for Voxel Edits ---
  let activeSplatEdit: SplatEditLike | null = null;
  let activeSplatModifier: SplatModifierLike | null = null;
  let unregisterVoxelEditState: (() => void) | null = null;

  const syncSplatEdits = (editState: VoxelEditState, splatMesh: SplatMeshLike): void => {
    if (!splatMesh) return;

    // Reset old modifier if exists
    if (activeSplatModifier && splatMesh.objectModifier === activeSplatModifier) {
      splatMesh.objectModifier = undefined;
    }

    const { SplatEdit, SplatEditSdf, SplatModifier } = sparkModule;
    const deletedBoxes = editState.getDeletedBoxes();
    const movedBoxes = editState.getMovedBoxes();

    if (deletedBoxes.length === 0 && movedBoxes.length === 0) {
      activeSplatEdit = null;
      activeSplatModifier = null;
      return;
    }

    activeSplatEdit = new SplatEdit();

    // Add SDF boxes for deleted voxels (opacity = 0)
    for (const box of deletedBoxes) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) / 2;

      const sdf = new SplatEditSdf({
        type: 'BOX',
        opacity: 0,
        radius: radius * 1.05 // slight overlap
      });
      sdf.position.copy(center);
      sdf.scale.copy(size);
      sdf.updateMatrixWorld(true);

      activeSplatEdit.addSdf(sdf);
    }

    // Add SDF boxes for moved voxels (displace != 0)
    for (const { box, delta } of movedBoxes) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      const sdf = new SplatEditSdf({
        type: 'BOX',
        displace: delta,
        radius: 0
      });
      sdf.position.copy(center);
      // Ensure the box fully covers the original voxel un-displaced
      sdf.scale.copy(size).multiplyScalar(1.05);
      sdf.updateMatrixWorld(true);

      activeSplatEdit.addSdf(sdf);
    }

    activeSplatModifier = new SplatModifier(activeSplatEdit);
    splatMesh.objectModifier = activeSplatModifier;
  };

  const setVoxelEditState = (state: VoxelEditState | null, mesh: SplatMeshLike | null): void => {
    if (unregisterVoxelEditState) {
      unregisterVoxelEditState();
      unregisterVoxelEditState = null;
    }

    if (state && mesh) {
      // Sync immediately
      syncSplatEdits(state, mesh);

      // Subscribe to later changes
      const syncHandler = () => syncSplatEdits(state, mesh);
      unregisterVoxelEditState = state.onChange(syncHandler);
    } else if (mesh) {
      if (activeSplatModifier && mesh.objectModifier === activeSplatModifier) {
        mesh.objectModifier = undefined;
      }
      activeSplatModifier = null;
      activeSplatEdit = null;
    }
  };

  onResize();
  syncControlActivation();

  return {
    scene,
    camera,
    renderer,
    sparkRenderer,
    lightRoot,
    defaultLights: {
      ambient,
      key
    },
    controls: pointerLockControls,
    pointerLockControls,
    orbitControls,
    transformControls,
    renderBackend,
    setProxyMesh,
    getProxyMesh,
    setVoxelProxy,
    setVoxelCollisionData,
    setCollisionEnabled,
    setShowProxyMesh,
    setDynamicResolution,
    raycastVoxel,
    setPointerLockEnabled,
    setInteractionMode,
    applyRendererLightingSettings,
    getInteractionMode: (): InteractionMode => interactionMode,
    setVoxelEditState,
    debugStep,
    debugGetState,
    debugVoxelProbe,
    isVrSupported,
    createVrButton,
    isVrSessionActive: (): boolean => vrSessionActive,
    dispose: (): void => {
      if (unregisterVoxelEditState) {
        unregisterVoxelEditState();
        unregisterVoxelEditState = null;
      }
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLostInternal);
      renderer.domElement.removeEventListener('click', onCanvasClick);

      pointerLockControls.unlock();
      pointerLockControls.dispose();
      orbitControls.dispose();
      transformControls.dispose();
      sparkRenderer.dispose?.();
      renderer.dispose();
    }
  };
}
