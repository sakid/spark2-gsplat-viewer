import * as THREE from 'three';
import type { SceneToneMapping } from '../../scene/sceneState';

export function resolveToneMapping(mode: SceneToneMapping): THREE.ToneMapping {
  if (mode === 'ACESFilmic') {
    return THREE.ACESFilmicToneMapping;
  }

  if (mode === 'Neutral') {
    return THREE.NeutralToneMapping;
  }

  return THREE.NoToneMapping;
}

