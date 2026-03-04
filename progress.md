Original prompt: Test and see if the voxel mesh is staying alligned with the splat after generation. Keep it mind it should support segmentation, ideally based on voxel selections. As a test case isolate the person from this splat, remove everything but the person, and give them a walk cycle animation.

## 2026-03-03 Session Notes
- Confirmed active app entrypoint is `src/js/main.js` and runtime logic is in `src/js/SceneManager.js` + `src/js/sceneSubjects/EnvironmentSplat.js`.
- Found existing voxel segmentation (`src/js/internal/voxelSegmentation.js`) and extraction flow (`SceneManager.extractSelectedVoxelActor`) already present.
- Created and claimed bd task `SPARK2-xns` for this request.
- Next: run alignment/segmentation tests and browser-level workflow validation; patch any alignment or extraction regressions.
- Added regression test `voxelizer` -> `keeps generated voxels aligned to transformed splat world space` to verify world-space voxel hashing/placement from transformed splat meshes.
- Re-ran targeted tests: `tests/voxelizer.test.ts`, `tests/voxelSegmentation.test.ts`, `tests/voxelAutoRigRuntime.test.ts`, `tests/environmentTransforms.test.ts` (all passing).
- Re-ran browser smoke `npm run test:default-actor-smoke` (passing): confirms extracted actor creation, walk-cycle clip active, and environment splat hidden after extraction.
- Attempted strict model-upload smoke `npm run test:voxel-segmentation-smoke` with both `~/Downloads/Model.spz` and `public/assets/splats/Sean_Sheep.spz`; run stalled in headless Chromium and ended with CDP protocol timeout while polling workflow state.
- Investigated user report: `view-mode=splats-only` appeared broken when extracted actors existed.
- Root cause: view mode changes were only applied inside `EnvironmentSplat`; extracted `VoxelSplatActor` proxies stayed visible.
- Fix: added SceneManager-level view-mode propagation to extracted actors and actor API `setProxyVisible()` to hide proxy mesh (and bones) in splats-only mode.
- Added unit test `tests/voxelSplatActor.test.ts` for actor proxy visibility toggling.
- Verified with scripted runtime check: actor voxel proxy visible in full mode, hidden in splats-only, visible again after returning to full.
- Follow-up fix for user report: extracted actor voxel proxies were not honoring `show-proxy-mesh` toggle.
- Updated SceneManager to track `showProxyRequested` from `environment:showProxy` and apply it together with view mode when deciding extracted actor proxy visibility.
- Added `tests/sceneManagerViewMode.test.ts` to cover splats-only + show-proxy gating for extracted actors.
- Verified via runtime scripts:
  - show-proxy ON => extracted actor voxel mesh visible
  - show-proxy OFF => extracted actor voxel mesh hidden
  - splats-only => extracted actor voxel mesh hidden
  - returning to full with show-proxy ON => extracted actor voxel mesh visible again
