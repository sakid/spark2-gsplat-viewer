import * as THREE from 'three';
import { loadSplatFromUrl } from '../internal/splatLoaders';
import { MorphProxyRig } from '../proxy/MorphProxyRig';

const DYNO_SPLAT = '/assets/splats/dyno-lod.spz';

function buildDynoModifier(spark, timeUniform, offsetUniform) {
  const d = spark.dyno;
  return d.dynoBlock({ gsplat: d.Gsplat }, { gsplat: d.Gsplat }, ({ gsplat }) => {
    const wave = d.mul(d.sin(timeUniform), d.float(0.07));
    const wobble = d.vec3(wave, d.float(0), d.float(0));
    const totalOffset = d.add(wobble, offsetUniform);
    return { gsplat: d.transformGsplat(gsplat, { translate: totalOffset }) };
  });
}

// NEW PROXY ANIMATION
export class DynoEffectSplat {
  constructor() {
    this.unsubscribers = [];
    this.elapsed = 0;
    this.actorIsolationActive = false;
  }

  async init(context) {
    this.context = context;
    this.rig = new MorphProxyRig({ name: 'DynoProxyRig' });
    this.rig.mesh.position.set(1.6, 1.0, -2.1);
    this.rig.mesh.visible = false;
    this.context.scene.add(this.rig.mesh);

    try {
      this.splatMesh = await loadSplatFromUrl({
        url: DYNO_SPLAT,
        scene: this.context.scene,
        sparkModule: this.context.sparkModule,
        previousMesh: null
      });
      this.splatMesh.position.copy(this.rig.mesh.position);
      this.splatMesh.quaternion.copy(this.rig.mesh.quaternion);
      this.splatMesh.scale.setScalar(0.5);
      this.enableDynoModifier();
      this.context.setStatus('Dyno proxy effects initialized.', 'success');
    } catch (error) {
      this.context.setStatus(`Dyno splat missing at ${DYNO_SPLAT}.`, 'warning');
      console.warn(error);
    }
  }

  enableDynoModifier() {
    const spark = this.context.sparkModule;
    if (!spark?.dyno || !spark.SplatModifier || !this.splatMesh) {
      return;
    }

    try {
      const d = spark.dyno;
      this.timeUniform = new d.DynoFloat({ value: 0 });
      this.offsetUniform = new d.DynoVec3({ value: new THREE.Vector3() });
      this.modifier = new spark.SplatModifier(buildDynoModifier(spark, this.timeUniform, this.offsetUniform));
      this.splatMesh.objectModifier = this.modifier;
    } catch (error) {
      console.warn('Dyno graph build failed, falling back to recolor pulse.', error);
      this.modifier = null;
    }
  }

  applyVisibility() {
    if (this.splatMesh) {
      this.splatMesh.visible = !this.actorIsolationActive;
    }
    if (this.rig?.mesh) {
      this.rig.mesh.visible = false;
    }
  }

  update(delta) {
    this.elapsed += delta;
    this.rig.update(delta);
    if (!this.splatMesh) return;

    this.splatMesh.position.copy(this.rig.mesh.position);
    this.splatMesh.quaternion.copy(this.rig.mesh.quaternion);
    if (this.timeUniform && this.offsetUniform) {
      this.timeUniform.value = this.elapsed;
      this.offsetUniform.value.set(
        Math.sin(this.elapsed * 1.5) * 0.03,
        Math.cos(this.elapsed * 1.2) * 0.01,
        0
      );
      return;
    }

    if (this.splatMesh.recolor) {
      const glow = 0.55 + 0.45 * Math.sin(this.elapsed * 2.5);
      this.splatMesh.recolor.setRGB(glow, 1 - glow * 0.3, 1);
    }
  }

  applySceneRenderState({ isolateActors } = {}) {
    this.actorIsolationActive = Boolean(isolateActors);
    this.applyVisibility();
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    this.rig?.dispose();
    if (this.splatMesh) this.splatMesh.objectModifier = null;
    this.modifier?.dispose?.();
    this.modifier = null;
    this.timeUniform = null;
    this.offsetUniform = null;
    this.splatMesh?.removeFromParent();
    this.splatMesh?.dispose?.();
    this.splatMesh = null;
  }
}
