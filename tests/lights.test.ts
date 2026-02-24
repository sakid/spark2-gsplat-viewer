import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import {
  createDefaultSceneLight,
  createThreeLight,
  defaultLightsToSceneLights,
  generateLightId,
  syncLightHelpersToRoot,
  syncSceneLightsToRoot,
  threeLightToSceneLight
} from '../src/viewer/lights';

const lightTypes = ['ambient', 'directional', 'point', 'spot'] as const;

describe('viewer lights helpers', () => {
  test('creates and converts each supported light type', () => {
    for (const type of lightTypes) {
      const sceneLight = createDefaultSceneLight(type, generateLightId(type), 1);
      const threeLight = createThreeLight(sceneLight);
      const converted = threeLightToSceneLight(threeLight);

      expect(converted.type).toBe(type);
      expect(converted.id).toBe(sceneLight.id);
      expect(converted.enabled).toBe(sceneLight.enabled);
      expect(converted.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('replaces light root contents with scene lights', () => {
    const root = new THREE.Group();

    const firstSet = [
      createDefaultSceneLight('ambient', 'a1', 1),
      createDefaultSceneLight('directional', 'd1', 1)
    ];

    const secondSet = [createDefaultSceneLight('point', 'p1', 1)];

    syncSceneLightsToRoot(root, firstSet);
    const firstLightCount = root.children.filter((child) => child instanceof THREE.Light).length;
    expect(firstLightCount).toBe(2);

    syncSceneLightsToRoot(root, secondSet);
    const secondLightCount = root.children.filter((child) => child instanceof THREE.Light).length;
    expect(secondLightCount).toBe(1);
    const point = root.children.find((child) => child instanceof THREE.PointLight);
    expect(point?.userData.sceneLightId).toBe('p1');
  });

  test('maps default ambient and key lights to stable scene list', () => {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(5, 8, 2);

    const defaults = defaultLightsToSceneLights({ ambient, key });
    expect(defaults).toHaveLength(2);
    expect(defaults[0].id).toBe('default-ambient');
    expect(defaults[1].id).toBe('default-key');
  });

  test('creates helper overlays for visible non-ambient lights', () => {
    const lightRoot = new THREE.Group();
    const helperRoot = new THREE.Group();

    syncSceneLightsToRoot(lightRoot, [
      createDefaultSceneLight('ambient', 'a1', 1),
      createDefaultSceneLight('directional', 'd1', 1),
      createDefaultSceneLight('point', 'p1', 1)
    ]);

    syncLightHelpersToRoot(helperRoot, lightRoot, true);
    expect(helperRoot.children.length).toBeGreaterThanOrEqual(2);

    syncLightHelpersToRoot(helperRoot, lightRoot, false);
    expect(helperRoot.children.length).toBe(0);
  });
});
