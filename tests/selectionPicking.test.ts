import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { applySelectionClick, pickSelectionObject, resolveSelectionRoot } from '../src/js/internal/selectionPicking';

describe('selectionPicking', () => {
  test('applySelectionClick replaces selection by default', () => {
    const next = applySelectionClick(['a', 'b'], 'c');
    expect(next).toEqual(['c']);
  });

  test('applySelectionClick toggles with additive modifier', () => {
    const removed = applySelectionClick(['a', 'b'], 'b', { additive: true });
    const added = applySelectionClick(['a'], 'b', { additive: true });
    expect(removed).toEqual(['a']);
    expect(added).toEqual(['b', 'a']);
  });

  test('applySelectionClick keeps current selection when missing target with modifiers', () => {
    const withModifier = applySelectionClick(['a', 'b'], null, { extend: true });
    const withoutModifier = applySelectionClick(['a', 'b'], null);
    expect(withModifier).toEqual(['a', 'b']);
    expect(withoutModifier).toEqual([]);
  });

  test('resolveSelectionRoot returns selectable root ancestor', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.userData.editorSelectableRoot = true;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    group.add(mesh);
    scene.add(group);

    const selected = resolveSelectionRoot(mesh, scene);
    expect(selected).toBe(group);
  });

  test('pickSelectionObject skips ignored helper hit and chooses next valid hit', () => {
    const scene = new THREE.Scene();
    const ignored = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    ignored.userData.editorIgnorePicking = true;
    const valid = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    valid.userData.editorSelectableRoot = true;
    scene.add(ignored, valid);

    const selected = pickSelectionObject(
      [{ object: ignored }, { object: valid }] as Array<{ object: THREE.Object3D }>,
      scene,
      (object) => Boolean(object.userData?.editorIgnorePicking)
    );
    expect(selected).toBe(valid);
  });
});
