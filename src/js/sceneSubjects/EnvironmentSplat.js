import { disposeObject3D } from '../internal/disposeThree';
import { EnvironmentTransforms } from '../internal/environmentTransforms';
import { computeProxyAlignOffset } from '../internal/proxyAlign';
import { loadSplatFromFile, loadSplatFromUrl } from '../internal/splatLoaders';
import { generateStableVoxelData } from '../internal/voxelGeneration';
import { exportVoxelProxyGlb } from '../internal/voxelExport';
import { ExternalProxyRuntime } from '../internal/externalProxyRuntime';
import { frameCameraToSplat } from '../internal/cameraFrame';
import { DEFAULT_BOOT_PROXY_URL, DEFAULT_BOOT_SPLAT_URL, FALLBACK_SPLAT_URL, fetchAssetAsFile } from '../internal/startupAssets';
const DEFAULT_ENVIRONMENT_SPLAT = DEFAULT_BOOT_SPLAT_URL, removeObject = (scene, object) => { if (!object) return; scene.remove(object); object.removeFromParent(); }, setLoadedName = (id, name) => { const n = document.getElementById(id); if (n) n.textContent = name || ''; };
// NEW PROXY ANIMATION
export class EnvironmentSplat {
  constructor() { this.unsubscribers = []; this.colliderOwner = 'environment'; this.proxyKind = 'none'; this.transforms = new EnvironmentTransforms(); }
  async init(context) {
    this.context = context;
    this.proxyCollisionMode = 'bone';
    this.proxyDeformSplat = true;
    this.external = new ExternalProxyRuntime({ context, owner: this.colliderOwner });
    const on = (event, handler) => this.unsubscribers.push(context.eventBus.on(event, handler));
    [
      ['environment:loadDefault', () => this.loadDefault()],
      ['environment:loadFile', (file) => this.loadFile(file)],
      ['environment:proxyFile', (file) => this.loadProxy(file)],
      ['environment:showProxy', (enabled) => this.setProxyVisible(enabled)],
      ['environment:proxyEditMode', (enabled) => enabled && this.setProxyVisible(true)],
      ['environment:generateVoxel', () => this.generateVoxel()],
      ['environment:exportVoxelGlb', () => exportVoxelProxyGlb({ voxelData: this.voxelData, baseName: this.splatMesh?.name || 'environment', setStatus: this.context.setStatus })],
      ['environment:clear', () => this.clear()],
      ['environment:realignProxy', () => this.realignProxy()],
      ['environment:flipUpDown', (enabled) => this.setTransformFlag('flipUpDown', enabled)],
      ['environment:flipLeftRight', (enabled) => this.setTransformFlag('flipLeftRight', enabled)],
      ['environment:proxyFlipUpDown', (enabled) => this.setTransformFlag('proxyFlipUpDown', enabled)],
      ['environment:proxyMirrorX', (enabled) => this.setTransformFlag('proxyMirrorX', enabled)],
      ['environment:proxyMirrorZ', (enabled) => this.setTransformFlag('proxyMirrorZ', enabled)],
      ['environment:proxyAnimPlay', (enabled) => this.external?.animator.setPlaying(enabled)],
      ['environment:proxyAnimClip', (clip) => this.external?.animator.playClip(clip)],
      ['environment:proxyAnimSpeed', (speed) => this.external?.animator.setSpeed(speed)],
      ['environment:proxyAnimRestart', () => this.external?.animator.restart()],
      ['environment:proxyCollisionMode', (mode) => { this.proxyCollisionMode = mode; this.external?.setCollisionMode(mode); }],
      ['environment:proxyDeformSplat', (enabled) => { this.proxyDeformSplat = Boolean(enabled); this.external?.setDeformEnabled(this.proxyDeformSplat, this.splatMesh); }]
    ].forEach(([event, handler]) => on(event, handler));
    await this.loadDefault();
    try { await this.loadProxy(await fetchAssetAsFile(DEFAULT_BOOT_PROXY_URL, 'sean_proxy_animated.glb'), { forceAutoAlign: true }); setLoadedName('proxy-loaded-name', 'Loaded: sean_proxy_animated.glb'); } catch {}
  }
  setTransformFlag(flag, enabled) {
    this.transforms.setFlag(flag, enabled);
    if (this.splatMesh) this.transforms.applySplat(this.splatMesh);
    this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
    this.external?.rebindDeformer(this.splatMesh);
    if (this.proxyKind === 'voxel' && (flag === 'flipUpDown' || flag === 'flipLeftRight')) this.generateVoxel();
  }
  syncExternalProxy({ autoAlign = true } = {}) {
    if (!this.splatMesh || !this.proxyRoot || this.proxyKind !== 'external') return;
    if (autoAlign) {
      this.transforms.proxyAlignOffset.set(0, 0, 0);
      this.transforms.applyProxy(this.proxyRoot);
      computeProxyAlignOffset(this.splatMesh, this.proxyRoot, this.transforms.proxyAlignOffset);
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
  async loadDefault() { try { await this.loadSplat(() => loadSplatFromUrl({ url: DEFAULT_ENVIRONMENT_SPLAT, scene: this.context.scene, sparkModule: this.context.sparkModule, previousMesh: this.splatMesh }), 'Loading canonical environment splat...', 'Environment splat loaded.'); setLoadedName('splat-loaded-name', 'Loaded: Sean_Sheep.spz'); } catch { await this.loadSplat(() => loadSplatFromUrl({ url: FALLBACK_SPLAT_URL, scene: this.context.scene, sparkModule: this.context.sparkModule, previousMesh: this.splatMesh }), 'Loading fallback environment splat...', 'Environment splat loaded.'); setLoadedName('splat-loaded-name', 'Loaded: environment-lod.spz'); } }
  async loadFile(file) {
    if (!file) return;
    setLoadedName('splat-loaded-name', `Loaded: ${file.name}`);
    await this.loadSplat(() => loadSplatFromFile({ file, scene: this.context.scene, sparkRenderer: this.context.sparkRenderer, sparkModule: this.context.sparkModule, previousMesh: this.splatMesh, setStatus: (message) => this.context.setStatus(message, 'info') }), `Loading ${file.name}...`, `Loaded ${file.name}.`);
  }
  async loadProxy(file, options = {}) {
    if (!file) return;
    this.context.setStatus(`Loading proxy mesh ${file.name}...`, 'info');
    try {
      this.removeProxy();
      this.proxyKind = 'external';
      this.proxyRoot = await this.external.load(file, this.splatMesh);
      this.externalAutoAlign = options.forceAutoAlign === true ? true : !(this.external?.asset?.animations?.length > 0);
      this.transforms.captureProxy(this.proxyRoot);
      this.transforms.proxyAlignOffset.set(0, 0, 0);
      this.syncExternalProxy({ autoAlign: this.externalAutoAlign });
      const showProxyInput = document.getElementById('show-proxy-mesh');
      if (showProxyInput && 'checked' in showProxyInput) showProxyInput.checked = true;
      setLoadedName('proxy-loaded-name', `Loaded: ${file.name}`);
      this.external.setDeformEnabled(this.proxyDeformSplat, this.splatMesh);
      this.external.setCollisionMode(this.proxyCollisionMode);
      this.external.setVisible(true);
      this.context.setStatus(`Proxy mesh ${file.name} loaded.`, 'success');
    } catch (error) {
      this.proxyKind = 'none'; this.proxyRoot = null;
      this.context.setStatus(`Proxy mesh load failed: ${error.message}`, 'error');
      console.error(error);
    }
  }
  setProxyVisible(enabled) { if (this.proxyKind === 'external') this.external?.setVisible(enabled); else if (this.proxyRoot) this.proxyRoot.visible = enabled; }
  realignProxy() { if (this.proxyKind !== 'external') return; this.syncExternalProxy({ autoAlign: true }); this.external?.rebindDeformer(this.splatMesh); this.context.setStatus('Proxy re-aligned.', 'info'); }
  async generateVoxel() {
    if (!this.splatMesh) return this.context.setStatus('Load an environment splat before generating voxels.', 'warning');
    try {
      this.context.setStatus('Generating voxel proxy...', 'info');
      const voxelData = await generateStableVoxelData({ splatMesh: this.splatMesh, sparkRenderer: this.context.sparkRenderer, setStatus: this.context.setStatus });
      if (!voxelData) return this.context.setStatus('No solid voxels found for current settings.', 'warning');
      this.removeProxy();
      const mesh = voxelData.mesh;
      this.proxyKind = 'voxel'; this.proxyRoot = mesh; this.proxyDispose = () => disposeObject3D(mesh);
      mesh.frustumCulled = false; mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1); mesh.updateMatrixWorld(true);
      this.context.scene.add(mesh);
      const showProxyInput = document.getElementById('show-proxy-mesh');
      if (showProxyInput && 'checked' in showProxyInput) showProxyInput.checked = true;
      mesh.visible = true;
      this.context.setVoxelCollisionData(voxelData); this.voxelData = voxelData;
      this.context.replaceColliders(this.colliderOwner, []);
      this.context.setStatus(`Voxel proxy generated (${voxelData.activeCount.toLocaleString()} voxels).`, 'success');
    } catch (error) {
      this.context.setStatus(`Voxel generation failed: ${error.message}`, 'error');
      console.error(error);
    }
  }
  removeProxy() {
    if (this.proxyKind === 'external') { this.external?.dispose(); this.proxyKind = 'none'; this.proxyRoot = null; this.transforms.clearProxy(); this.context.replaceColliders(this.colliderOwner, []); this.context.setVoxelCollisionData(null); this.voxelData = null; return; }
    removeObject(this.context.scene, this.proxyRoot);
    this.proxyDispose?.(); this.proxyRelease?.();
    this.proxyKind = 'none'; this.proxyRoot = null; this.proxyDispose = null; this.proxyRelease = null;
    this.transforms.clearProxy();
    this.context.replaceColliders(this.colliderOwner, []);
    this.context.setVoxelCollisionData(null); this.voxelData = null;
  }
  clear() { removeObject(this.context.scene, this.splatMesh); this.splatMesh?.dispose?.(); this.splatMesh = null; this.transforms.clearSplat(); this.removeProxy(); }
  update(delta) { this.external?.update(delta); }
  dispose() { for (const unbind of this.unsubscribers.splice(0)) unbind(); this.external?.dispose(); this.external = null; this.clear(); }
}
