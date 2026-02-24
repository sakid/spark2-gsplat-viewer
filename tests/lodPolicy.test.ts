import { describe, expect, test } from 'vitest';
import { selectLodSplatCount } from '../src/js/internal/lodPolicy';

describe('lod policy', () => {
  test('uses desktop budget by default', () => {
    expect(selectLodSplatCount('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(1500000);
  });

  test('uses mobile budget for phone user agents', () => {
    expect(selectLodSplatCount('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(500000);
    expect(selectLodSplatCount('Mozilla/5.0 (Linux; Android 14; Pixel)')).toBe(500000);
  });
});
