import { loadProxyFromFile } from '../internal/proxyLoader';
import { disposeObject3D } from '../internal/disposeThree';
import { EnvironmentTransforms } from '../internal/environmentTransforms';
import { computeProxyAlignOffset } from '../internal/proxyAlign';
import { loadSplatFromFile, loadSplatFromUrl } from '../internal/splatLoaders';
import { generateStableVoxelData } from '../internal/voxelGeneration';
import { exportVoxelProxyGlb } from '../internal/voxelExport';
const DEFAULT_ENVIRONMENT_SPLAT = '/assets/splats/environment-lod.spz';
const isProxyVisible = () => Boolean(document.getElementById('show-proxy-mesh')?.checked);
const removeObject = (scene, object) => { if (!object) return; scene.remove(object); object.removeFromParent(); };
// NEW PROXY ANIMATION
export class EnvironmentSplat {
  constructor() {
    this.unsubscribers = [];
    this.colliderOwner = 'environment';
    this.proxyKind = 'none';
    this.transforms = new EnvironmentTransforms();
  }
  async init(context) {
    this.context = context;
    const on = (event, handler) => this.unsubscribers.push(context.eventBus.on(event, handler));
    on('environment:loadDefault', () => this.loadDefault());
    on('environment:loadFile', (file) => this.loadFile(file));
    on('environment:proxyFile', (file) => this.loadProxy(file));
    on('environment:showProxy', (enabled) => this.setProxyVisible(enabled));
    on('environment:proxyEditMode', (enabled) => enabled && this.setProxyVisible(true));
    on('environment:generateVoxel', () => this.generateVoxel());
    on('environment:exportVoxelGlb', () => exportVoxelProxyGlb({ voxelData: this.voxelData, baseName: this.splatMesh?.name || 'environment', setStatus: this.context.setStatus }));
    on('environment:clear', () => this.clear());
    on('environment:realignProxy', () => this.realignProxy());
    on('environment:flipUpDown', (enabled) => this.setTransformFlag('flipUpDown', enabled));
    on('environment:flipLeftRight', (enabled) => this.setTransformFlag('flipLeftRight', enabled));
    on('environment:proxyFlipUpDown', (enabled) => this.setTransformFlag('proxyFlipUpDown', enabled));
    on('environment:proxyMirrorX', (enabled) => this.setTransformFlag('proxyMirrorX', enabled));
    on('environment:proxyMirrorZ', (enabled) => this.setTransformFlag('proxyMirrorZ', enabled));
    await this.loadDefault();
  }
  setTransformFlag(flag, enabled) {
    this.transforms.setFlag(flag, enabled);
    if (this.splatMesh) this.transforms.applySplat(this.splatMesh);
    this.syncExternalProxy();
    if (this.proxyKind === 'voxel' && (flag === 'flipUpDown' || flag === 'flipLeftRight')) {
      this.generateVoxel();
    }
  }
  syncExternalProxy() {
    if (!this.splatMesh || !this.proxyRoot || this.proxyKind !== 'external') return;
    this.transforms.proxyAlignOffset.set(0, 0, 0);
    this.transforms.applyProxy(this.proxyRoot);
    computeProxyAlignOffset(this.splatMesh, this.proxyRoot, this.transforms.proxyAlignOffset);
    this.transforms.applyProxy(this.proxyRoot);
  }
  async loadDefault() {
    try {
      if (this.proxyKind === 'voxel') this.removeProxy();
      this.context.setStatus('Loading canonical environment splat...', 'info');
      this.splatMesh = await loadSplatFromUrl({ url: DEFAULT_ENVIRONMENT_SPLAT, scene: this.context.scene, sparkModule: this.context.sparkModule, previousMesh: this.splatMesh });
      this.transforms.captureSplat(this.splatMesh);
      this.transforms.applySplat(this.splatMesh);
      this.syncExternalProxy();
      this.context.eventBus.emit('environment:splatLoaded', this.splatMesh);
      this.context.setStatus('Environment splat loaded.', 'success');
    } catch (error) {
      this.context.setStatus(`Environment splat missing at ${DEFAULT_ENVIRONMENT_SPLAT}. Add canonical assets to /public/assets/splats.`, 'warning');
      console.warn(error);
    }
  }
  async loadFile(file) {
    if (!file) return;
    try {
      if (this.proxyKind === 'voxel') this.removeProxy();
      this.context.setStatus(`Loading ${file.name}...`, 'info');
      this.splatMesh = await loadSplatFromFile({ file, scene: this.context.scene, sparkRenderer: this.context.sparkRenderer, sparkModule: this.context.sparkModule, previousMesh: this.splatMesh, setStatus: (message) => this.context.setStatus(message, 'info') });
      this.transforms.captureSplat(this.splatMesh);
      this.transforms.applySplat(this.splatMesh);
      this.syncExternalProxy();
      this.context.eventBus.emit('environment:splatLoaded', this.splatMesh);
      this.context.setStatus(`Loaded ${file.name}.`, 'success');
    } catch (error) {
      this.context.setStatus(`Failed to load ${file.name}: ${error.message}`, 'error');
      console.error(error);
    }
  }
  async loadProxy(file) {
    if (!file) return;
    this.context.setStatus(`Loading proxy mesh ${file.name}...`, 'info');
    try {
      this.removeProxy();
      const { root, dispose, release, colliders } = await loadProxyFromFile(file);
      this.proxyKind = 'external'; this.proxyRelease = release; this.proxyRoot = root; this.proxyDispose = dispose;
      this.context.scene.add(root);
      this.transforms.captureProxy(root);
      this.syncExternalProxy();
      root.visible = isProxyVisible();
      this.context.replaceColliders(this.colliderOwner, colliders);
      this.context.setStatus(`Proxy mesh ${file.name} loaded.`, 'success');
    } catch (error) {
      this.context.setStatus(`Proxy mesh load failed: ${error.message}`, 'error');
      console.error(error);
    }
  }
  setProxyVisible(enabled) { if (this.proxyRoot) this.proxyRoot.visible = enabled; }
  realignProxy() { if (this.proxyKind !== 'external') return; this.syncExternalProxy(); this.context.setStatus('Proxy re-aligned.', 'info'); }
  async generateVoxel() {
    if (!this.splatMesh) return this.context.setStatus('Load an environment splat before generating voxels.', 'warning');
    try {
      this.context.setStatus('Generating voxel proxy...', 'info');
      const voxelData = await generateStableVoxelData({ splatMesh: this.splatMesh, sparkRenderer: this.context.sparkRenderer, setStatus: this.context.setStatus });
      if (!voxelData) return this.context.setStatus('No solid voxels found for current settings.', 'warning');
      this.removeProxy();
      this.proxyKind = 'voxel';
      const mesh = voxelData.mesh;
      mesh.frustumCulled = false; // Keep debug voxels visible even when instance bounds are stale.
      this.proxyRoot = mesh;
      this.proxyDispose = () => disposeObject3D(mesh);
      mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1); mesh.updateMatrixWorld(true);
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
    removeObject(this.context.scene, this.proxyRoot);
    this.proxyDispose?.();
    this.proxyRelease?.();
    this.proxyKind = 'none';
    this.proxyRoot = null;
    this.proxyDispose = null;
    this.proxyRelease = null;
    this.transforms.clearProxy();
    this.context.replaceColliders(this.colliderOwner, []);
    this.context.setVoxelCollisionData(null); this.voxelData = null;
  }
  clear() {
    removeObject(this.context.scene, this.splatMesh);
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
    this.transforms.clearSplat();
    this.removeProxy();
  }
  update() {} dispose() { for (const unbind of this.unsubscribers.splice(0)) unbind(); this.clear(); }
}
