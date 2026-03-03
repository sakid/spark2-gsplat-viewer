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
- Step 1: click `1) Import Splat` (default boot asset is `public/assets/splats/Sean_Sheep.spz`)
- Step 2-4: click `Step 2-4: Voxelize + Rig + Animate`
- Or use one button: `Run 1->4 Workflow (Import -> Voxelize -> Rig -> Animate)` to run the full sequence from the selected splat file
- Use `Re-generate Procedural Bones` to rebuild the rig quickly without re-importing assets
- The workflow will:
  - voxelize the splat
  - build a procedural bone rig automatically
  - apply procedural animation playback immediately
- The proxy root becomes the parent of the splat at runtime, so hierarchy and transforms stay grouped like an editor object
- Use `Animation / preset` to switch between procedural animation styles on voxel-rigged splats
- Use existing proxy animation controls (`Play`, `Speed`, `Restart`, collision mode, deform toggle) to drive the auto-rigged voxel proxy
- Use the `Viewing` section to:
  - switch to `Gaussian splats only` mode
  - toggle proxy mesh visibility
  - toggle proxy bone visibility (debug)

## Manual Sheep Realign + Crop Workflow
- Open `Advanced: Sheep Realign & Crop` in the Controls panel.
- Turn on `Unified gizmo edit mode` for a Unity/Unreal-style workflow.
- Use `Gizmo target` (`Sheep align transform` or `Crop box transform`) and `Gizmo mode` (`Translate/Rotate/Scale`).
- Keyboard shortcuts while gizmo mode is active: `W` = translate, `E` = rotate, `R` = scale.
- Use `Offset/Rotation/Scale` + `Apply realign` if you prefer numeric/manual values.
- Use `Auto center` for a quick baseline alignment (centered on X/Z, feet at Y=0), then fine-tune manually.
- Enable `sheep crop mask` to hide splats outside the crop box.
- Use `Auto-fit crop` to initialize from the dense splat core, then adjust `Center`/`Size` and click `Apply crop box`.
- Keep `Show crop helper box` enabled while editing; disable it for a clean preview.
- `Show bones` is now on by default and bone markers are rendered for clearer visibility.

## Notes
- Spark renderer is initialized with:
  - `enableLod: true`
  - `lodSplatCount`: `1_500_000` desktop / `500_000` mobile
  - `maxStdDev: Math.sqrt(8)`
  - `autoUpdate: true`
- The main loop is centralized in `src/js/main.js` and calls `sceneManager.update(delta)`.
