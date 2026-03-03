# SPARK 2.0 Proxy-Driven Gaussian Splat Engine

## REFACTORED
This project is now organized as a modular JavaScript game engine centered on proxy mesh animation for Spark `SplatMesh` entities.

## Runtime layout
- `index.html`
- `public/assets/splats/`
- `src/css/style.css`
- `src/js/main.js`
- `src/js/SceneManager.js`
- `src/js/sceneSubjects/`
- `src/utils/eventBus.js`

## Canonical assets
Place these canonical files in `public/assets/splats/`:
- `butterfly-lod.spz`
- `environment-lod.spz`
- `dyno-lod.spz`

If missing, the engine reports clear runtime warnings and continues running.

## Scripts
```bash
npm run dev
npm run localtest
npm run localtest:preview
npm run build
npm test
npm run check:lines
```

For custom host/port:
```bash
./scripts/localtest.sh dev --host 127.0.0.1 --port 5173
./scripts/localtest.sh preview --host 127.0.0.1 --port 4173
```

## Proxy animation entities
- `ButterflySplat`: proxy `SkinnedMesh` + Spark `SplatSkinning`
- `EnvironmentSplat`: environment splat + proxy collision + voxel proxy generation
- `DynoEffectSplat`: proxy-driven dyno modifier graph with runtime fallback

## Voxel Auto-Rig Workflow
- Load a splat (default boot asset is `public/assets/splats/Sean_Sheep.spz`)
- Click `Auto-Generate + Auto-Rig Proxy`
- The app will:
  - generate a voxel proxy from the splat
  - build a procedural bone rig automatically
  - start procedural animation playback immediately
- Use existing proxy animation controls (`Play`, `Speed`, `Restart`, collision mode, deform toggle) to drive the auto-rigged voxel proxy

## Notes
- Spark renderer is initialized with:
  - `enableLod: true`
  - `lodSplatCount`: `1_500_000` desktop / `500_000` mobile
  - `maxStdDev: Math.sqrt(8)`
  - `autoUpdate: true`
- The main loop is centralized in `src/js/main.js` and calls `sceneManager.update(delta)`.
