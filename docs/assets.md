# Asset Size Policy

This repository ships runtime assets directly from `public/assets`. To keep clone times and CI costs manageable:

- Binary files should remain under **100 MB**.
- Keep optimized runtime variants for scene-critical assets.
- Track large binary formats via Git LFS:
  - `public/assets/proxies/*.glb`
  - `public/assets/splats/*.spz`

## Optimization pipeline

1. Build and decimate proxies from source DCC files.
2. Convert and compress meshes/splats into runtime formats.
3. Validate dimensions and load behavior in `npm run dev`.
4. Run `npm run check:file-sizes` before committing.

## Current temporary exceptions

- `public/assets/proxies/sean_proxy_animated.glb`
- `public/assets/splats/Sean_Sheep.spz`

