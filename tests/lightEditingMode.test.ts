import { describe, expect, test } from 'vitest';
import {
  canUseTargetSubmode,
  createDefaultSceneLight,
  getAdaptiveSnapForDistance
} from '../src/viewer/lights';

describe('light editing mode helpers', () => {
  test('uses adaptive snap tiers based on camera distance', () => {
    expect(getAdaptiveSnapForDistance(2.5)).toBe(0.1);
    expect(getAdaptiveSnapForDistance(5)).toBe(0.5);
    expect(getAdaptiveSnapForDistance(30)).toBe(0.5);
    expect(getAdaptiveSnapForDistance(31)).toBe(2);
  });

  test('only directional and spot lights allow target submode', () => {
    expect(canUseTargetSubmode(createDefaultSceneLight('ambient'))).toBe(false);
    expect(canUseTargetSubmode(createDefaultSceneLight('point'))).toBe(false);
    expect(canUseTargetSubmode(createDefaultSceneLight('directional'))).toBe(true);
    expect(canUseTargetSubmode(createDefaultSceneLight('spot'))).toBe(true);
  });
});
