import * as THREE from 'three';
import { Actor } from '../core/Actor';
import { loadProxyFromFile } from '../../internal/proxyLoader';
import { fetchAssetAsFile } from '../../internal/startupAssets';
import { Animator } from '../components/Animator';
import { Locomotion } from '../components/Locomotion';
import { WanderBrain } from './WanderBrain';
import { Interactable } from '../interaction/Interactable';

function computeBounds(object3d) {
  const box = new THREE.Box3();
  box.setFromObject(object3d);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return null;
  return box;
}

export class NpcActor extends Actor {
  constructor({
    name = 'NPC',
    url,
    desiredHeight = 1.7,
    position = new THREE.Vector3(1.5, 0, 0)
  } = {}) {
    super({ name });
    this.url = url;
    this.desiredHeight = Math.max(0.01, Number(desiredHeight) || 1.7);
    this.root.position.copy(position);

    this.animator = new Animator();
    this.addComponent(this.animator);
    this.addComponent(new Locomotion({ speed: 0.9, turnSpeed: 10 }));
    this.addComponent(new WanderBrain({ center: new THREE.Vector3(0, 0, 0), radius: 2.8 }));
    this.addComponent(new Interactable({
      prompt: 'talk',
      dialogId: 'sean_intro',
      speakerName: name,
      range: 2.4,
      raycast: true
    }));
  }

  async init({ world, context }) {
    if (this.initialized) return;

    if (!this.url) throw new Error('NpcActor requires a URL.');
    const file = await fetchAssetAsFile(this.url, 'npc.glb');
    const asset = await loadProxyFromFile(file);
    this.asset = asset;

    const container = new THREE.Group();
    container.name = `${this.name}::Model`;
    container.add(asset.root);
    this.root.add(container);

    const box = computeBounds(container);
    if (box) {
      const height = Math.max(1e-6, box.max.y - box.min.y);
      const scale = this.desiredHeight / height;
      if (Number.isFinite(scale) && scale > 0) this.root.scale.setScalar(scale);
      // Place feet on y=0 (best-effort)
      this.root.updateMatrixWorld(true);
      const postBox = computeBounds(container);
      if (postBox) {
        const offsetY = -postBox.min.y;
        container.position.y += offsetY;
      }
    }

    this.animator.bind({ root: asset.animatedRoot ?? asset.root, clips: asset.animations ?? [] });

    await super.init({ world, context });
  }

  dispose() {
    super.dispose();
    this.asset?.dispose?.();
    this.asset?.release?.();
    this.asset = null;
  }
}
