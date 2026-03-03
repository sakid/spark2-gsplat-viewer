import { disposeObject3D } from '../internal/disposeThree';
import { EnvironmentTransforms } from '../internal/environmentTransforms';
import { computeProxyAlignment } from '../internal/proxyAlign';
import { loadSplatFromFile, loadSplatFromUrl } from '../internal/splatLoaders';
import { generateStableVoxelData } from '../internal/voxelGeneration';
import { exportVoxelProxyGlb } from '../internal/voxelExport';
import { ExternalProxyRuntime } from '../internal/externalProxyRuntime';
import { VoxelAutoRigRuntime } from '../internal/voxelAutoRigRuntime';
import { frameCameraToSplat } from '../internal/cameraFrame';
import { DEFAULT_BOOT_PROXY_URL, DEFAULT_BOOT_SPLAT_URL, FALLBACK_SPLAT_URL, fetchAssetAsFile } from '../internal/startupAssets';

const DEFAULT_ENVIRONMENT_SPLAT = DEFAULT_BOOT_SPLAT_URL;

const removeObject = (scene, object) => {
  if (!object) return;
  scene.remove(object);
  object.removeFromParent();
};

const setLoadedName = (id, name) => {
  const node = document.getElementById(id);
  if (node) node.textContent = name || '';
};

// NEW PROXY ANIMATION
export class EnvironmentSplat {
  constructor() {
    this.unsubscribers = [];
    this.colliderOwner = 'environment';
    this.proxyKind = 'none';
    this.transforms = new EnvironmentTransforms();
    this.proxyCollisionMode = 'bone';
    this.proxyDeformSplat = true;
    this.proxyAlignProfile = 'auto';
    this.externalAutoAlign = true;
  }

  async init(context) {
    this.context = context;
    this.external = new ExternalProxyRuntime({ context, owner: this.colliderOwner });
    this.voxelRuntime = new VoxelAutoRigRuntime({ context, owner: this.colliderOwner });
    const on = (event, handler) => this.unsubscribers.push(context.eventBus.on(event, handler));

    on('environment:loadDefault', () => this.loadDefault());
    on('environment:loadFile', (file) => this.loadFile(file));
    on('environment:proxyFile', (file) => this.loadProxy(file));
    on('environment:showProxy', (enabled) => this.setProxyVisible(enabled));
    on('environment:proxyEditMode', (enabled) => enabled && this.setProxyVisible(true));
    on('environment:generateVoxel', () => this.generateVoxel());
    on('environment:exportVoxelGlb', () => exportVoxelProxyGlb({
      voxelData: this.voxelData,
      baseName: this.splatMesh?.name || 'environment',
      setStatus: this.context.setStatus
    }));
    on('environment:clear', () => this.clear());
    on('environment:realignProxy', () => this.realignProxy());
    on('environment:flipUpDown', (enabled) => this.setTransformFlag('flipUpDown', enabled));
    on('environment:flipLeftRight', (enabled) => this.setTransformFlag('flipLeftRight', enabled));
    on('environment:proxyFlipUpDown', (enabled) => this.setTransformFlag('proxyFlipUpDown', enabled));
    on('environment:proxyMirrorX', (enabled) => this.setTransformFlag('proxyMirrorX', enabled));
    on('environment:proxyMirrorZ', (enabled) => this.setTransformFlag('proxyMirrorZ', enabled));
    on('environment:proxyAlignProfile', (profile) => this.setProxyAlignProfile(profile));
    on('environment:proxyAnimPlay', (enabled) => this.setProxyAnimationPlaying(enabled));
    on('environment:proxyAnimClip', (clip) => this.setProxyAnimationClip(clip));
    on('environment:proxyAnimSpeed', (speed) => this.setProxyAnimationSpeed(speed));
    on('environment:proxyAnimRestart', () => this.restartProxyAnimation());
    on('environment:proxyCollisionMode', (mode) => this.setProxyCollisionMode(mode));
    on('environment:proxyDeformSplat', (enabled) => this.setProxyDeformEnabled(enabled));
    on('environment:requestProxyClipList', () => this.emitProxyClipList());

    await this.loadDefault();

    try {
      await this.loadProxy(await fetchAssetAsFile(DEFAULT_BOOT_PROXY_URL, 'sean_proxy_animated.glb'), { forceAutoAlign: true });
      setLoadedName('proxy-loaded-name', 'Loaded: sean_proxy_animated.glb');
    } catch {
      // Boot proxy is optional.
    }
  }

  setTransformFlag(flag, enabled) {
    this.transforms.setFlag(flag, enabled);
    if (this.splatMesh) this.transforms.applySplat(this.splatMesh);
    this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
    this.external?.rebindDeformer(this.splatMesh);
    if (this.proxyKind === 'voxel' && (flag === 'flipUpDown' || flag === 'flipLeftRight')) this.generateVoxel();
  }

  findAlignmentAnchorNode() {
    const bones = this.external?.asset?.skinnedMeshes?.[0]?.skeleton?.bones ?? [];
    if (!bones.length) return null;
    const preferred = [/hips/i, /pelvis/i, /root/i, /spine/i];
    for (const pattern of preferred) {
      const match = bones.find((bone) => pattern.test(bone?.name || ''));
      if (match) return match;
    }
    return bones[0] ?? null;
  }
  normalizeProxyAlignProfile(value) {
    if (value === 'character' || value === 'generic') return value;
    return 'auto';
  }

  setProxyAlignProfile(profile) {
    const next = this.normalizeProxyAlignProfile(profile);
    if (next === this.proxyAlignProfile) return;
    this.proxyAlignProfile = next;
    if (this.proxyKind !== 'external' || !this.proxyRoot || !this.splatMesh) return;
    this.syncExternalProxy({ autoAlign: true });
    this.external?.rebindDeformer(this.splatMesh);
    this.context.setStatus(`Proxy alignment profile: ${next}.`, 'info');
  }
  getProxyAlignmentOptions() {
    const asset = this.external?.asset;
    const hasSkeleton = Boolean(asset?.skinnedMeshes?.length);
    const hasAnimations = Boolean(asset?.animations?.length);
    const resolvedProfile = this.proxyAlignProfile === 'auto'
      ? (hasSkeleton ? 'character' : 'generic')
      : this.proxyAlignProfile;
    return {
      profile: resolvedProfile,
      preferUpright: hasSkeleton || hasAnimations,
      anchorNode: hasSkeleton ? this.findAlignmentAnchorNode() : null,
      anchorBlend: hasSkeleton ? 0.85 : 0
    };
  }

  syncExternalProxy({ autoAlign = true } = {}) {
    if (!this.splatMesh || !this.proxyRoot || this.proxyKind !== 'external') return;
    if (autoAlign) {
      this.transforms.setProxyAutoAlignment({ offset: { x: 0, y: 0, z: 0 }, scale: 1, quaternion: null });
      this.transforms.applyProxy(this.proxyRoot);
      const alignment = computeProxyAlignment(this.splatMesh, this.proxyRoot, this.getProxyAlignmentOptions());
      this.transforms.setProxyAutoAlignment(alignment);
    }
    this.transforms.applyProxy(this.proxyRoot);
  }

  async loadSplat(loader, loadingStatus, successStatus) {
    try {
      if (this.proxyKind === 'voxel') this.removeProxy();
      this.context.setStatus(loadingStatus, 'info');
      this.splatMesh = await loader();
      this.transforms.captureSplat(this.splatMesh);
      this.transforms.applySplat(this.splatMesh);
      this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
      this.external?.rebindDeformer(this.splatMesh);
      frameCameraToSplat(this.context.camera, this.splatMesh);
      this.context.eventBus.emit('environment:splatLoaded', this.splatMesh);
      this.context.setStatus(successStatus, 'success');
    } catch (error) {
      this.context.setStatus(`${successStatus.replace('loaded.', 'load failed:')} ${error.message}`, 'error');
      console.error(error);
    }
  }

  async loadDefault() {
    try {
      await this.loadSplat(
        () => loadSplatFromUrl({
          url: DEFAULT_ENVIRONMENT_SPLAT,
          scene: this.context.scene,
          sparkModule: this.context.sparkModule,
          previousMesh: this.splatMesh
        }),
        'Loading canonical environment splat...',
        'Environment splat loaded.'
      );
      setLoadedName('splat-loaded-name', 'Loaded: Sean_Sheep.spz');
    } catch {
      await this.loadSplat(
        () => loadSplatFromUrl({
          url: FALLBACK_SPLAT_URL,
          scene: this.context.scene,
          sparkModule: this.context.sparkModule,
          previousMesh: this.splatMesh
        }),
        'Loading fallback environment splat...',
        'Environment splat loaded.'
      );
      setLoadedName('splat-loaded-name', 'Loaded: environment-lod.spz');
    }
  }

  async loadFile(file) {
    if (!file) return;
    setLoadedName('splat-loaded-name', `Loaded: ${file.name}`);
    await this.loadSplat(
      () => loadSplatFromFile({
        file,
        scene: this.context.scene,
        sparkRenderer: this.context.sparkRenderer,
        sparkModule: this.context.sparkModule,
        previousMesh: this.splatMesh,
        setStatus: (message) => this.context.setStatus(message, 'info')
      }),
      `Loading ${file.name}...`,
      `Loaded ${file.name}.`
    );
  }

  async loadProxy(file, options = {}) {
    if (!file) return;
    this.context.setStatus(`Loading proxy mesh ${file.name}...`, 'info');
    try {
      this.removeProxy();
      this.proxyKind = 'external';
      this.proxyRoot = await this.external.load(file, this.splatMesh);
      this.externalAutoAlign = options.forceAutoAlign !== false;
      this.transforms.captureProxy(this.proxyRoot);
      this.transforms.setProxyAutoAlignment({ offset: { x: 0, y: 0, z: 0 }, scale: 1, quaternion: null });
      this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
      const showProxyInput = document.getElementById('show-proxy-mesh');
      if (showProxyInput && 'checked' in showProxyInput) showProxyInput.checked = true;
      setLoadedName('proxy-loaded-name', `Loaded: ${file.name}`);
      this.external.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
      this.external.setCollisionMode(this.proxyCollisionMode);
      this.external.animator.setPlaying(true);
      this.external.setVisible(true);
      this.emitProxyClipList();
      this.context.setStatus(`Proxy mesh ${file.name} loaded.`, 'success');
    } catch (error) {
      this.proxyKind = 'none';
      this.proxyRoot = null;
      this.emitProxyClipList();
      this.context.setStatus(`Proxy mesh load failed: ${error.message}`, 'error');
      console.error(error);
    }
  }

  setProxyAnimationPlaying(enabled) {
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setPlaying(enabled);
      return;
    }
    this.external?.animator.setPlaying(enabled);
  }

  setProxyAnimationClip(clip) {
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.playClip(clip);
      return;
    }
    this.external?.animator.playClip(clip);
  }

  setProxyAnimationSpeed(speed) {
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setSpeed(speed);
      return;
    }
    this.external?.animator.setSpeed(speed);
  }

  restartProxyAnimation() {
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.restart();
      return;
    }
    this.external?.animator.restart();
  }

  setProxyCollisionMode(mode) {
    this.proxyCollisionMode = mode;
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setCollisionMode(mode);
      return;
    }
    this.external?.setCollisionMode(mode);
  }

  setProxyDeformEnabled(enabled) {
    this.proxyDeformSplat = Boolean(enabled);
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
      return;
    }
    this.external?.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
  }

  setProxyVisible(enabled) {
    if (this.proxyKind === 'external') {
      this.external?.setVisible(enabled);
      return;
    }
    if (this.proxyKind === 'voxel') {
      this.voxelRuntime?.setVisible(enabled);
      return;
    }
    if (this.proxyRoot) {
      this.proxyRoot.visible = enabled;
    }
  }

  realignProxy() {
    if (this.proxyKind !== 'external') return;
    this.syncExternalProxy({ autoAlign: true });
    this.external?.rebindDeformer(this.splatMesh);
    const { proxyAlignScale, proxyAlignOffset } = this.transforms;
    const profile = this.getProxyAlignmentOptions()?.profile ?? this.proxyAlignProfile;
    this.context.setStatus(
      `Proxy re-aligned (${profile}, scale ${proxyAlignScale.toFixed(3)}, offset ${proxyAlignOffset.x.toFixed(2)}, ${proxyAlignOffset.y.toFixed(2)}, ${proxyAlignOffset.z.toFixed(2)}).`,
      'info'
    );
  }

  async generateVoxel() {
    if (!this.splatMesh) return this.context.setStatus('Load an environment splat before generating voxels.', 'warning');

    try {
      this.context.setStatus('Generating voxel proxy and auto-rigging bones...', 'info');
      const voxelData = await generateStableVoxelData({
        splatMesh: this.splatMesh,
        sparkRenderer: this.context.sparkRenderer,
        setStatus: this.context.setStatus
      });
      if (!voxelData) return this.context.setStatus('No solid voxels found for current settings.', 'warning');

      this.removeProxy();
      const root = this.voxelRuntime.bind({
        voxelData,
        splatMesh: this.splatMesh,
        collisionMode: this.proxyCollisionMode,
        deformEnabled: this.proxyDeformSplat
      });
      this.proxyKind = 'voxel';
      this.proxyRoot = root;
      this.proxyDispose = () => {
        this.voxelRuntime.dispose();
        disposeObject3D(root);
      };
      root.frustumCulled = false;
      root.position.set(0, 0, 0);
      root.quaternion.identity();
      root.scale.set(1, 1, 1);
      root.updateMatrixWorld(true);
      this.context.scene.add(root);

      const showProxyInput = document.getElementById('show-proxy-mesh');
      if (showProxyInput && 'checked' in showProxyInput) showProxyInput.checked = true;
      this.voxelRuntime.setVisible(true);
      this.voxelRuntime.setPlaying(true);

      this.voxelData = voxelData;
      this.context.replaceColliders(this.colliderOwner, []);
      setLoadedName('proxy-loaded-name', `Loaded: AutoRig Voxel (${voxelData.activeCount.toLocaleString()} voxels)`);
      this.emitProxyClipList();
      this.context.setStatus(
        `Voxel proxy generated (${voxelData.activeCount.toLocaleString()} voxels), auto-rigged (${this.voxelRuntime.boneCount} bones), and procedural animation is playing.`,
        'success'
      );
    } catch (error) {
      this.context.setStatus(`Voxel generation failed: ${error.message}`, 'error');
      console.error(error);
    }
  }

  removeProxy() {
    if (this.proxyKind === 'external') {
      this.external?.dispose();
      this.proxyKind = 'none';
      this.proxyRoot = null;
      this.transforms.clearProxy();
      this.context.replaceColliders(this.colliderOwner, []);
      this.context.setVoxelCollisionData(null);
      this.context.clearDynamicColliders(this.colliderOwner);
      this.voxelData = null;
      this.emitProxyClipList();
      return;
    }

    removeObject(this.context.scene, this.proxyRoot);
    this.proxyDispose?.();
    this.proxyRelease?.();
    this.proxyKind = 'none';
    this.proxyRoot = null;
    this.proxyDispose = null;
    this.proxyRelease = null;
    this.transforms.clearProxy();
    this.context.replaceColliders(this.colliderOwner, []);
    this.context.setVoxelCollisionData(null);
    this.context.clearDynamicColliders(this.colliderOwner);
    this.voxelData = null;
    this.emitProxyClipList();
  }

  emitProxyClipList() {
    const clips = this.proxyKind === 'voxel'
      ? (this.voxelRuntime?.clipNames ?? [])
      : (this.external?.clipNames ?? []);
    this.context?.eventBus?.emit('environment:proxyClipList', clips);
  }

  clear() {
    removeObject(this.context.scene, this.splatMesh);
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
    this.transforms.clearSplat();
    this.removeProxy();
  }

  update(delta) {
    this.external?.update(delta);
    this.voxelRuntime?.update(delta);
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    this.external?.dispose();
    this.external = null;
    this.voxelRuntime?.dispose();
    this.voxelRuntime = null;
    this.clear();
  }
}
