import { VoxelAutoRigRuntime } from '../internal/voxelAutoRigRuntime';

const finiteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export class VoxelSplatActor {
  constructor({
    name = 'Extracted Actor',
    owner,
    splatMesh,
    voxelData,
    initialClipIndex = 1
  } = {}) {
    this.name = name;
    this.owner = owner || `extracted-${Date.now()}`;
    this.splatMesh = splatMesh ?? null;
    this.voxelData = voxelData ?? null;
    this.initialClipIndex = Math.max(0, Math.floor(finiteNumber(initialClipIndex, 1)));
    this.context = null;
    this.voxelRuntime = null;
    this.root = null;
  }

  async init(context) {
    this.context = context;
    if (!this.splatMesh || !this.voxelData) {
      throw new Error('VoxelSplatActor requires splatMesh and voxelData.');
    }

    this.voxelRuntime = new VoxelAutoRigRuntime({
      context,
      owner: this.owner
    });
    const root = this.voxelRuntime.bind({
      voxelData: this.voxelData,
      splatMesh: this.splatMesh,
      collisionMode: 'bone',
      deformEnabled: true
    });
    root.name = this.name;

    this.splatMesh.removeFromParent?.();
    root.add(this.splatMesh);
    context.scene.add(root);

    this.voxelRuntime.setSpeed(1.1);
    this.voxelRuntime.playClip(this.initialClipIndex);
    this.voxelRuntime.setPlaying(true);

    this.root = root;
  }

  update(delta) {
    this.voxelRuntime?.update(delta);
  }

  setProxyVisible(visible) {
    const show = Boolean(visible);
    this.voxelRuntime?.setVisible(show);
    if (!show) {
      this.voxelRuntime?.setBonesVisible(false);
    }
  }

  dispose() {
    this.voxelRuntime?.dispose();
    this.voxelRuntime = null;
    this.root?.removeFromParent?.();
    this.root = null;
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
    this.voxelData = null;
  }
}
