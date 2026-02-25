import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { ProxyAnimationController } from '../src/js/internal/proxyAnimationController';

describe('proxy animation controller', () => {
  test('binds clips and updates mixer state', () => {
    const root = new THREE.Group();
    const clip = new THREE.AnimationClip('MoveX', 1, [
      new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 2])
    ]);
    const controller = new ProxyAnimationController();
    const names = controller.bind(root, [clip]);
    expect(names).toEqual(['MoveX']);
    controller.setSpeed(1);
    controller.setPlaying(true);
    controller.update(0.5);
    expect(root.position.x).toBeGreaterThan(0.8);
    controller.dispose();
  });
});
