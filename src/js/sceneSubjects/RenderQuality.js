function applySourceQualityToSplat(mesh, enabled) {
  if (!mesh || typeof mesh !== 'object') return false;
  if (typeof mesh.forEachSplat !== 'function') return false;
  if ('enableLod' in mesh) {
    mesh.enableLod = enabled ? false : undefined;
    return true;
  }
  if ('enableLoD' in mesh) {
    mesh.enableLoD = enabled ? false : undefined;
    return true;
  }
  return false;
}

function applySceneSourceQuality(scene, enabled) {
  scene.traverse((object) => applySourceQualityToSplat(object, enabled));
}

// NEW PROXY ANIMATION
export class RenderQuality {
  constructor() {
    this.unsubscribers = [];
    this.improvedQuality = false;
    this.maxDetail = false;
  }

  async init(context) {
    this.context = context;
    this.baseLodCount = context.sparkRenderer.lodSplatCount ?? 1500000;
    this.baseLodScale = context.sparkRenderer.lodSplatScale ?? 1;
    const on = (event, handler) => this.unsubscribers.push(context.eventBus.on(event, handler));
    on('quality:improved', (enabled) => this.setImprovedQuality(enabled));
    on('quality:maxDetail', (enabled) => this.setMaxDetail(enabled));
    on('environment:splatLoaded', () => this.applyProfile(false));
    this.applyProfile(false);
  }

  setImprovedQuality(enabled) {
    this.improvedQuality = Boolean(enabled);
    this.applyProfile(true);
  }

  setMaxDetail(enabled) {
    this.maxDetail = Boolean(enabled);
    this.applyProfile(true);
  }

  applyProfile(reportStatus) {
    const strongQuality = this.improvedQuality && !this.maxDetail;
    const deviceRatio = window.devicePixelRatio || 1;
    const cap = this.maxDetail ? 3 : strongQuality ? 2.75 : 2;
    this.context.renderer.setPixelRatio(Math.min(deviceRatio, cap));
    this.context.sparkRenderer.enableLod = true;

    let lodCount = this.baseLodCount;
    let lodScale = this.baseLodScale;
    if (this.maxDetail) {
      lodCount = Math.min(Math.max(Math.floor(this.baseLodCount * 8), 2000000), 8000000);
      lodScale = Math.max(this.baseLodScale * 0.35, 0.05);
    } else if (strongQuality) {
      lodCount = Math.floor(this.baseLodCount * 3);
      lodScale = Math.max(this.baseLodScale * 0.7, 0.1);
    }

    this.context.sparkRenderer.lodSplatCount = lodCount;
    this.context.sparkRenderer.lodSplatScale = lodScale;
    applySceneSourceQuality(this.context.scene, this.maxDetail);

    if (!reportStatus) return;
    if (this.maxDetail) {
      this.context.setStatus('Source-quality mode toggled for splat meshes.', 'info');
      return;
    }
    this.context.setStatus(`Improved render quality ${this.improvedQuality ? 'enabled' : 'disabled'}.`, 'info');
  }

  update() {}

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
  }
}
