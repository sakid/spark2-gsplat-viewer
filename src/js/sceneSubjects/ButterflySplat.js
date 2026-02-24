import * as THREE from 'three';
import { loadSplatFromUrl } from '../internal/splatLoaders';
import { SkinnedMeshProxyRig } from '../proxy/SkinnedMeshProxyRig';
import { bindSplatToBones } from '../proxy/skinBinding';

const BUTTERFLY_SPLAT = '/assets/splats/butterfly-lod.spz';

// NEW PROXY ANIMATION
export class ButterflySplat {
  constructor() {
    this.unsubscribers = [];
    this.boundSplats = 0;
  }

  async init(context) {
    this.context = context;
    this.rig = new SkinnedMeshProxyRig({ name: 'ButterflyProxyRig' });
    this.rig.root.position.set(-1.4, 1.2, -2.5);
    this.rig.root.visible = false;
    this.context.scene.add(this.rig.root);

    try {
      this.splatMesh = await loadSplatFromUrl({
        url: BUTTERFLY_SPLAT,
        scene: this.context.scene,
        sparkModule: this.context.sparkModule,
        previousMesh: null
      });
      this.splatMesh.position.copy(this.rig.root.position);
      this.splatMesh.scale.setScalar(0.45);
      await this.bindSkinning();
      this.context.setStatus('Butterfly proxy-driven skinning initialized.', 'success');
    } catch (error) {
      this.context.setStatus(
        `Butterfly splat missing at ${BUTTERFLY_SPLAT}. Add canonical assets to /public/assets/splats.`,
        'warning'
      );
      console.warn(error);
    }
  }

  async bindSkinning() {
    const spark = this.context.sparkModule;
    if (!this.splatMesh || !spark.SplatSkinning) {
      return;
    }

    try {
      this.skinning = new spark.SplatSkinning({
        mesh: this.splatMesh,
        numBones: this.rig.bones.length,
        mode: spark.SplatSkinningMode?.LINEAR_BLEND
      });

      this.boundSplats = bindSplatToBones({
        splatMesh: this.splatMesh,
        skinning: this.skinning,
        bones: this.rig.bones
      });

      this.splatMesh.skinning = this.skinning;
    } catch (error) {
      this.context.setStatus('Butterfly skinning fallback: using group animation only.', 'warning');
      console.warn(error);
    }
  }

  update(delta) {
    if (!this.rig) return;
    this.rig.update(delta);

    if (!this.splatMesh) return;
    this.splatMesh.position.copy(this.rig.root.position);
    this.splatMesh.quaternion.copy(this.rig.root.quaternion);

    if (!this.skinning) return;
    this.rig.mesh.updateMatrixWorld(true);
    for (let i = 0; i < this.rig.bones.length; i += 1) {
      this.skinning.setBoneMatrix(i, this.rig.bones[i].matrixWorld);
    }
    this.skinning.updateBones();
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    this.skinning?.dispose?.();
    this.skinning = null;
    this.rig?.dispose();
    this.splatMesh?.removeFromParent();
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
  }
}
