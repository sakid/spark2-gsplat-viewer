import * as THREE from 'three';

const tempBounds = new THREE.Box3();
const tempLocalBounds = new THREE.Box3();
const tempCenter = new THREE.Vector3();
const tempSize = new THREE.Vector3();
const tempInv = new THREE.Matrix4();

const MIN_SIZE = 0.01;
const MAX_SAMPLE_POINTS = 60000;
const MIN_OPACITY = 0.02;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampSize(value) {
  return Math.max(finite(value, 1), MIN_SIZE);
}

function computeQuantile(sorted, q) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, q * (sorted.length - 1)));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function getLocalBounds(mesh, out) {
  if (!mesh) return false;

  if (typeof mesh.getBoundingBox === 'function') {
    try {
      const box = mesh.getBoundingBox(false);
      if (box && !box.isEmpty()) {
        out.copy(box);
        return true;
      }
    } catch {
      // Fall through to object bounds fallback.
    }
  }

  out.setFromObject(mesh);
  if (out.isEmpty()) return false;
  mesh.updateMatrixWorld(true);
  tempInv.copy(mesh.matrixWorld).invert();
  out.applyMatrix4(tempInv);
  return !out.isEmpty();
}

function sampleDenseCoreBounds(mesh, out) {
  if (typeof mesh?.forEachSplat !== 'function') return false;

  const points = [];
  let seen = 0;

  mesh.forEachSplat((index, center, _scales, _quaternion, opacity) => {
    if (opacity < MIN_OPACITY) return;
    seen += 1;
    if (points.length < MAX_SAMPLE_POINTS) {
      points.push([center.x, center.y, center.z]);
      return;
    }

    // Reservoir sampling: maintain bounded memory while keeping a representative sample.
    const replacement = Math.floor(Math.random() * seen);
    if (replacement < MAX_SAMPLE_POINTS) {
      points[replacement][0] = center.x;
      points[replacement][1] = center.y;
      points[replacement][2] = center.z;
    }
  });

  if (points.length < 1000) return false;

  const xs = points.map((point) => point[0]).sort((a, b) => a - b);
  const ys = points.map((point) => point[1]).sort((a, b) => a - b);
  const zs = points.map((point) => point[2]).sort((a, b) => a - b);

  const x0 = computeQuantile(xs, 0.1);
  const x1 = computeQuantile(xs, 0.9);
  const y0 = computeQuantile(ys, 0.08);
  const y1 = computeQuantile(ys, 0.92);
  const z0 = computeQuantile(zs, 0.1);
  const z1 = computeQuantile(zs, 0.9);

  out.min.set(x0, y0, z0);
  out.max.set(x1, y1, z1);
  return !out.isEmpty();
}

function makeHelper() {
  const group = new THREE.Group();
  group.name = 'SheepCropHelper';

  const solid = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.08,
      depthWrite: false
    })
  );
  solid.renderOrder = 900;
  solid.frustumCulled = false;

  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    })
  );
  wire.renderOrder = 901;
  wire.frustumCulled = false;

  group.add(solid, wire);
  group.visible = false;
  return group;
}

function disposeHelper(helper) {
  if (!helper) return;
  helper.traverse((node) => {
    if (node.geometry?.dispose) node.geometry.dispose();
    if (Array.isArray(node.material)) {
      for (const material of node.material) material?.dispose?.();
      return;
    }
    node.material?.dispose?.();
  });
}

// Manual crop helper for the sheep workflow. It masks splats outside the box.
export class SplatCropTool {
  constructor({ sparkModule } = {}) {
    this.sparkModule = sparkModule ?? null;
    this.mesh = null;
    this.enabled = false;
    this.helperVisible = true;
    this.center = new THREE.Vector3();
    this.size = new THREE.Vector3(1, 1, 1);
    this.quaternion = new THREE.Quaternion();
    this.edit = null;
    this.sdf = null;
    this.modifier = null;
    this.helper = makeHelper();
  }

  bind(mesh) {
    if (this.mesh === mesh) return;
    this.clearModifier();
    this.mesh = mesh ?? null;
    this.helper.removeFromParent();

    if (!this.mesh) {
      this.helper.visible = false;
      return;
    }

    this.mesh.add(this.helper);
    if (!getLocalBounds(this.mesh, tempBounds)) {
      this.center.set(0, 0, 0);
      this.size.set(1, 1, 1);
      this.quaternion.identity();
    } else {
      tempBounds.getCenter(this.center);
      tempBounds.getSize(this.size);
      this.quaternion.identity();
      this.ensureMinimumSize();
    }

    this.syncHelperTransform();
    this.applyEnabledState();
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (next === this.enabled) return;
    this.enabled = next;
    this.applyEnabledState();
  }

  setHelperVisible(visible) {
    this.helperVisible = Boolean(visible);
    this.syncHelperTransform();
  }

  getState() {
    return {
      enabled: this.enabled,
      helperVisible: this.helperVisible,
      center: { x: this.center.x, y: this.center.y, z: this.center.z },
      size: { x: this.size.x, y: this.size.y, z: this.size.z },
      quaternion: {
        x: this.quaternion.x,
        y: this.quaternion.y,
        z: this.quaternion.z,
        w: this.quaternion.w
      }
    };
  }

  setCropBox(box = {}) {
    if ('center' in box) {
      this.center.set(
        finite(box.center?.x, this.center.x),
        finite(box.center?.y, this.center.y),
        finite(box.center?.z, this.center.z)
      );
    }

    if ('size' in box) {
      this.size.set(
        clampSize(box.size?.x),
        clampSize(box.size?.y),
        clampSize(box.size?.z)
      );
    }

    if ('quaternion' in box) {
      const next = box.quaternion;
      if (next instanceof THREE.Quaternion) {
        this.quaternion.copy(next);
      } else {
        this.quaternion.set(
          finite(next?.x, this.quaternion.x),
          finite(next?.y, this.quaternion.y),
          finite(next?.z, this.quaternion.z),
          finite(next?.w, this.quaternion.w || 1)
        );
        if (this.quaternion.lengthSq() <= 1e-6) {
          this.quaternion.identity();
        } else {
          this.quaternion.normalize();
        }
      }
    }

    this.ensureMinimumSize();
    this.syncHelperTransform();
    this.syncSdfTransform();
    return this.getState();
  }

  autoFit({ denseCore = true } = {}) {
    if (!this.mesh) return this.getState();

    let fitSucceeded = false;
    if (denseCore) {
      fitSucceeded = sampleDenseCoreBounds(this.mesh, tempLocalBounds);
    }
    if (!fitSucceeded) {
      fitSucceeded = getLocalBounds(this.mesh, tempLocalBounds);
    }
    if (!fitSucceeded) return this.getState();

    tempLocalBounds.getCenter(this.center);
    tempLocalBounds.getSize(this.size);
    this.quaternion.identity();
    this.ensureMinimumSize();
    this.syncHelperTransform();
    this.syncSdfTransform();
    return this.getState();
  }

  reset() {
    this.setEnabled(false);
    return this.autoFit({ denseCore: false });
  }

  clearModifier() {
    if (this.mesh && this.modifier && this.mesh.objectModifier === this.modifier) {
      this.mesh.objectModifier = undefined;
    }
    this.modifier = null;
    this.sdf = null;
    this.edit = null;
  }

  dispose() {
    this.clearModifier();
    this.mesh = null;
    this.helper.removeFromParent();
    disposeHelper(this.helper);
    this.helper = null;
  }

  ensureMinimumSize() {
    this.size.set(
      Math.max(this.size.x, MIN_SIZE),
      Math.max(this.size.y, MIN_SIZE),
      Math.max(this.size.z, MIN_SIZE)
    );
  }

  applyEnabledState() {
    if (!this.mesh || !this.sparkModule) {
      this.clearModifier();
      this.syncHelperTransform();
      return;
    }

    if (!this.enabled) {
      this.clearModifier();
      this.syncHelperTransform();
      return;
    }

    if (!this.edit) {
      this.edit = new this.sparkModule.SplatEdit();
      this.sdf = new this.sparkModule.SplatEditSdf({
        type: 'box',
        invert: true,
        opacity: 0,
        radius: 0
      });
      this.edit.addSdf(this.sdf);
      this.modifier = new this.sparkModule.SplatModifier(this.edit);
    }

    this.syncSdfTransform();
    this.mesh.objectModifier = this.modifier;
    this.syncHelperTransform();
  }

  syncSdfTransform() {
    if (!this.sdf) return;
    this.sdf.position.copy(this.center);
    this.sdf.quaternion.copy(this.quaternion);
    this.sdf.scale.copy(this.size);
    this.sdf.updateMatrixWorld(true);
  }

  syncHelperTransform() {
    if (!this.helper) return;
    this.helper.position.copy(this.center);
    this.helper.quaternion.copy(this.quaternion);
    this.helper.scale.copy(this.size);
    this.helper.visible = this.helperVisible && Boolean(this.mesh);
    this.helper.updateMatrixWorld(true);
  }
}
