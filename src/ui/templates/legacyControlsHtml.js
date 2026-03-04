export const LEGACY_CONTROLS_HTML = `
<div id="panel" aria-label="Controls">
  <div class="panel-header">
    <h1>SPARK 2 Minimal Engine</h1>
    <button id="hide-panel-btn" type="button" aria-label="Hide options panel">Hide</button>
  </div>

  <label class="toggle compact-toggle" for="minimal-ui-mode">
    <input id="minimal-ui-mode" type="checkbox" checked />
    <span>Minimal mode (hide advanced options)</span>
  </label>

  <section class="section" aria-label="Workflow">
    <h2>Workflow</h2>
    <p class="section-caption">Import splat -> voxelize -> rig -> animate.</p>

    <label for="file-input">Splat file</label>
    <input id="file-input" type="file" accept=".spz,.ply,.splat,.ksplat" />

    <label for="load-mode">Load mode</label>
    <select id="load-mode">
      <option value="spz" selected>SPZ / compressed (recommended)</option>
      <option value="raw-ply">Raw PLY (high memory risk)</option>
    </select>

    <div class="row">
      <button id="load-btn" type="button">1) Import Splat</button>
      <button id="run-voxel-workflow-btn" class="button-primary" type="button">Run Full Workflow</button>
    </div>

    <div class="row">
      <button id="generate-voxel-btn" type="button">2-4) Voxelize + Rig + Animate</button>
      <button id="regenerate-voxel-rig-btn" type="button">Re-generate Bones</button>
    </div>

    <div class="row">
      <button id="clear-btn" type="button">Clear scene</button>
      <button id="export-voxel-glb-btn" type="button">Export Voxel (.glb)</button>
    </div>

    <small id="workflow-summary" class="meta-line">Workflow status: choose a splat file to begin.</small>
    <small id="splat-loaded-name" class="meta-line">Loaded: none</small>
    <small id="proxy-loaded-name" class="meta-line">Loaded: none</small>
  </section>

  <section class="section" aria-label="Splat gameplay level">
    <h2>Splat Gameplay Level</h2>
    <p class="section-caption">Third-person sheep level with dialog and quest progress.</p>

    <label class="toggle" for="gameplay-level-enabled">
      <input id="gameplay-level-enabled" type="checkbox" />
      <span>Enable gameplay mode (third person)</span>
    </label>

    <div class="row">
      <button id="gameplay-start-level-btn" type="button">Build Splat Level</button>
      <button id="gameplay-stop-level-btn" type="button">Stop Level</button>
    </div>

    <button id="gameplay-reset-progress-btn" type="button">Reset quest/dialog progress</button>
    <small id="gameplay-level-status" class="meta-line">Level inactive.</small>
    <small class="meta-line">Controls: WASD move, Shift run, E interact, Space/Enter advance dialog.</small>
  </section>

  <section class="section" aria-label="View and animation">
    <h2>View &amp; Animation</h2>

    <label for="view-mode">Viewing mode</label>
    <select id="view-mode">
      <option value="full" selected>Full scene</option>
      <option value="splats-only">Gaussian splats only</option>
    </select>

    <small id="interaction-mode" class="meta-line">Interaction mode: view</small>

    <label class="toggle" for="object-edit-mode">
      <input id="object-edit-mode" type="checkbox" />
      <span>Object gizmo edit mode (Q/W/E/R)</span>
    </label>

    <div class="light-row-advanced" aria-label="Viewport transform snap settings">
      <label class="toggle" for="editor-snap-enabled">
        <input id="editor-snap-enabled" type="checkbox" checked />
        <span>Enable snap</span>
      </label>
      <label for="editor-gizmo-space">Transform space</label>
      <select id="editor-gizmo-space">
        <option value="world" selected>World</option>
        <option value="local">Local</option>
      </select>
      <label for="editor-translate-snap">Move snap (m)</label>
      <input id="editor-translate-snap" type="number" min="0.01" max="10" step="0.01" value="0.25" />
      <label for="editor-rotate-snap">Rotate snap (deg)</label>
      <input id="editor-rotate-snap" type="number" min="0.1" max="180" step="0.1" value="15" />
      <label for="editor-scale-snap">Scale snap</label>
      <input id="editor-scale-snap" type="number" min="0.01" max="5" step="0.01" value="0.1" />
    </div>

    <div class="row">
      <button id="editor-undo-btn" type="button">Undo (Ctrl/Cmd+Z)</button>
      <button id="editor-redo-btn" type="button">Redo (Ctrl/Cmd+Shift+Z)</button>
    </div>

    <label class="toggle" for="show-proxy-mesh">
      <input id="show-proxy-mesh" type="checkbox" />
      <span>Show proxy mesh</span>
    </label>

    <label class="toggle" for="show-proxy-bones">
      <input id="show-proxy-bones" type="checkbox" checked />
      <span>Show bones</span>
    </label>

    <label for="proxy-anim-clip">Animation / preset</label>
    <select id="proxy-anim-clip"><option value="">No animation clips</option></select>

    <label class="toggle" for="proxy-anim-play">
      <input id="proxy-anim-play" type="checkbox" checked />
      <span>Play animation</span>
    </label>

    <label for="proxy-anim-speed">Animation speed</label>
    <input id="proxy-anim-speed" type="number" min="0" max="20" step="0.1" value="4" />

    <div class="row">
      <button id="proxy-anim-restart" type="button">Restart</button>
      <button id="outliner-focus-btn" type="button">Focus selected</button>
    </div>

    <small class="meta-line">Voxel walk-cycle authoring (for isolated actor auto-rig):</small>
    <label for="proxy-anim-phase">Cycle scrub (0-1)</label>
    <input id="proxy-anim-phase" type="range" min="0" max="1" step="0.001" value="0" />

    <div class="light-row-advanced" aria-label="Voxel walk cycle core settings">
      <label for="proxy-anim-cycle-duration">Cycle length (s)</label>
      <input id="proxy-anim-cycle-duration" type="number" min="0.2" max="10" step="0.05" value="1.1" />
      <label for="proxy-anim-stride">Stride (deg)</label>
      <input id="proxy-anim-stride" type="number" min="0" max="80" step="0.5" value="24" />
      <label for="proxy-anim-sway">Sway (deg)</label>
      <input id="proxy-anim-sway" type="number" min="0" max="70" step="0.5" value="16" />
      <label for="proxy-anim-yaw">Yaw sway (deg)</label>
      <input id="proxy-anim-yaw" type="number" min="0" max="45" step="0.5" value="9" />
    </div>

    <div class="light-row-advanced" aria-label="Voxel walk cycle shaping settings">
      <label for="proxy-anim-torso">Torso twist (deg)</label>
      <input id="proxy-anim-torso" type="number" min="0" max="60" step="0.5" value="12" />
      <label for="proxy-anim-head">Head nod (deg)</label>
      <input id="proxy-anim-head" type="number" min="0" max="45" step="0.5" value="8" />
      <label for="proxy-anim-bounce">Bounce (0-1)</label>
      <input id="proxy-anim-bounce" type="number" min="0" max="1" step="0.01" value="0.22" />
      <label for="proxy-anim-gait-sharpness">Gait sharpness (0-1)</label>
      <input id="proxy-anim-gait-sharpness" type="number" min="0" max="1" step="0.01" value="0.55" />
    </div>

    <label class="toggle" for="proxy-anim-mirror">
      <input id="proxy-anim-mirror" type="checkbox" />
      <span>Mirror gait phase (left/right)</span>
    </label>

    <button id="proxy-anim-reset-walk" type="button">Reset walk-cycle settings</button>

    <label for="proxy-collision-mode">Proxy collision mode</label>
    <select id="proxy-collision-mode">
      <option value="bone" selected>Bone (animated)</option>
      <option value="static">Static mesh</option>
      <option value="off">Off</option>
    </select>

    <label class="toggle" for="collision-enabled">
      <input id="collision-enabled" type="checkbox" />
      <span>Enable camera collision</span>
    </label>

    <label class="toggle" for="proxy-deform-splat">
      <input id="proxy-deform-splat" type="checkbox" checked />
      <span>Deform splat from animation</span>
    </label>
  </section>

  <details class="section section-collapsible advanced-only" aria-label="Advanced proxy tools">
    <summary>Advanced: Proxy Import &amp; Alignment</summary>
    <div class="section-body">
      <label for="proxy-file-input">External proxy geometry (.glb, .obj)</label>
      <input id="proxy-file-input" type="file" accept=".glb,.gltf,.obj" />

      <button id="realign-proxy-btn" type="button">Re-align proxy</button>

      <label for="proxy-align-profile">Proxy align profile</label>
      <select id="proxy-align-profile">
        <option value="auto" selected>Auto (recommended)</option>
        <option value="character">Character</option>
        <option value="generic">Generic mesh</option>
      </select>

      <label class="toggle" for="proxy-flip-updown">
        <input id="proxy-flip-updown" type="checkbox" />
        <span>Proxy flip upside down</span>
      </label>

      <label class="toggle" for="proxy-mirror-x">
        <input id="proxy-mirror-x" type="checkbox" />
        <span>Proxy mirror X</span>
      </label>

      <label class="toggle" for="proxy-mirror-z">
        <input id="proxy-mirror-z" type="checkbox" />
        <span>Proxy mirror Z</span>
      </label>
    </div>
  </details>

  <details class="section section-collapsible advanced-only" aria-label="Advanced sheep realign and crop">
    <summary>Advanced: Sheep Realign &amp; Crop</summary>
    <div class="section-body">
      <p class="section-caption">Manual cleanup pass for the sheep splat.</p>

      <label class="toggle" for="sheep-gizmo-enabled">
        <input id="sheep-gizmo-enabled" type="checkbox" />
        <span>Unified gizmo edit mode (W/E/R)</span>
      </label>

      <label for="sheep-gizmo-target">Gizmo target</label>
      <select id="sheep-gizmo-target">
        <option value="align" selected>Sheep align transform</option>
        <option value="crop">Crop box transform</option>
      </select>

      <label for="sheep-gizmo-mode">Gizmo mode</label>
      <select id="sheep-gizmo-mode">
        <option value="translate" selected>Translate (W)</option>
        <option value="rotate">Rotate (E)</option>
        <option value="scale">Scale (R)</option>
      </select>
      <small class="meta-line">When gizmo edit mode is on: drag handles in viewport, use W/E/R shortcuts.</small>

      <div class="light-row-advanced" aria-label="Sheep align offset">
        <label for="sheep-align-x">Offset X</label>
        <input id="sheep-align-x" type="number" step="0.01" value="0" />
        <label for="sheep-align-y">Offset Y</label>
        <input id="sheep-align-y" type="number" step="0.01" value="0" />
        <label for="sheep-align-z">Offset Z</label>
        <input id="sheep-align-z" type="number" step="0.01" value="0" />
      </div>

      <div class="light-row-advanced" aria-label="Sheep align rotation and scale">
        <label for="sheep-align-pitch">Pitch (deg)</label>
        <input id="sheep-align-pitch" type="number" step="0.1" value="0" />
        <label for="sheep-align-yaw">Yaw (deg)</label>
        <input id="sheep-align-yaw" type="number" step="0.1" value="0" />
        <label for="sheep-align-roll">Roll (deg)</label>
        <input id="sheep-align-roll" type="number" step="0.1" value="0" />
        <label for="sheep-align-scale">Uniform scale</label>
        <input id="sheep-align-scale" type="number" min="0.01" step="0.01" value="1" />
      </div>

      <div class="row">
        <button id="sheep-align-apply-btn" type="button">Apply realign</button>
        <button id="sheep-align-autocenter-btn" type="button">Auto center</button>
      </div>
      <button id="sheep-align-reset-btn" type="button">Reset realign</button>

      <label class="toggle" for="sheep-crop-enabled">
        <input id="sheep-crop-enabled" type="checkbox" />
        <span>Enable sheep crop mask</span>
      </label>

      <label class="toggle" for="sheep-crop-show-box">
        <input id="sheep-crop-show-box" type="checkbox" checked />
        <span>Show crop helper box</span>
      </label>

      <div class="light-row-advanced" aria-label="Sheep crop center">
        <label for="sheep-crop-center-x">Center X</label>
        <input id="sheep-crop-center-x" type="number" step="0.01" value="0" />
        <label for="sheep-crop-center-y">Center Y</label>
        <input id="sheep-crop-center-y" type="number" step="0.01" value="0" />
        <label for="sheep-crop-center-z">Center Z</label>
        <input id="sheep-crop-center-z" type="number" step="0.01" value="0" />
      </div>

      <div class="light-row-advanced" aria-label="Sheep crop size">
        <label for="sheep-crop-size-x">Size X</label>
        <input id="sheep-crop-size-x" type="number" min="0.01" step="0.01" value="1" />
        <label for="sheep-crop-size-y">Size Y</label>
        <input id="sheep-crop-size-y" type="number" min="0.01" step="0.01" value="1" />
        <label for="sheep-crop-size-z">Size Z</label>
        <input id="sheep-crop-size-z" type="number" min="0.01" step="0.01" value="1" />
      </div>

      <div class="row">
        <button id="sheep-crop-apply-btn" type="button">Apply crop box</button>
        <button id="sheep-crop-fit-btn" type="button">Auto-fit crop</button>
      </div>
      <button id="sheep-crop-reset-btn" type="button">Reset crop</button>
    </div>
  </details>

  <details class="section section-collapsible advanced-only" aria-label="Advanced voxel editing">
    <summary>Advanced: Voxel Settings &amp; Editing</summary>
    <div class="section-body">
      <div class="light-row-advanced" aria-label="Voxel config">
        <label for="voxel-resolution">Voxel size</label>
        <input id="voxel-resolution" type="number" min="0.1" max="5" step="0.1" value="0.5" title="Size in meters" />
        <label for="voxel-density">Voxel density</label>
        <input id="voxel-density" type="number" min="1" max="100" step="1" value="2" title="Splat count to make solid" />
      </div>

      <label class="toggle" for="voxel-edit-mode">
        <input id="voxel-edit-mode" type="checkbox" />
        <span>Voxel edit mode</span>
      </label>

      <div id="voxel-edit-controls" style="display:none;">
        <span id="voxel-selection-count">0 selected</span>
        <div class="light-row-advanced" aria-label="Voxel actor auto-segmentation settings">
          <label for="voxel-seg-color-threshold">Color threshold</label>
          <input id="voxel-seg-color-threshold" type="number" min="0.01" max="1" step="0.01" value="0.15" />
          <label for="voxel-seg-min-count">Min voxels</label>
          <input id="voxel-seg-min-count" type="number" min="1" step="1" value="80" />
        </div>
        <button id="voxel-auto-segment-btn" type="button">Auto-select actor (color)</button>
        <div class="row">
          <button id="voxel-select-connected-btn" type="button">Select connected</button>
          <button id="voxel-invert-selection-btn" type="button">Invert</button>
        </div>
        <div class="row">
          <button id="voxel-delete-btn" type="button">Delete selected</button>
          <button id="voxel-undo-btn" type="button">Undo</button>
        </div>
        <label for="voxel-actor-pose-mode">Extracted actor pose</label>
        <select id="voxel-actor-pose-mode">
          <option value="walk" selected>Walk cycle</option>
          <option value="t-pose">T-pose (bind pose)</option>
        </select>
        <button id="voxel-extract-actor-btn" type="button">Extract actor + walk cycle</button>
      </div>
    </div>
  </details>

  <details class="section section-collapsible advanced-only" aria-label="Advanced rendering and lighting">
    <summary>Advanced: Rendering &amp; Lighting</summary>
    <div class="section-body">
      <label for="lod-scale">LoD scale</label>
      <input id="lod-scale" type="number" min="0.1" max="10" step="0.1" value="1.0" />

      <label for="lod-count">LoD splat count</label>
      <input id="lod-count" type="number" min="10000" step="10000" value="1500000" />

      <label class="toggle" for="quality-improved">
        <input id="quality-improved" type="checkbox" />
        <span>Improved render quality</span>
      </label>

      <label class="toggle" for="quality-max-detail">
        <input id="quality-max-detail" type="checkbox" />
        <span>Source quality mode</span>
      </label>

      <label class="toggle" for="flip-updown">
        <input id="flip-updown" type="checkbox" />
        <span>Flip upside down</span>
      </label>

      <label class="toggle" for="flip-leftright">
        <input id="flip-leftright" type="checkbox" />
        <span>Flip left-right</span>
      </label>

      <label class="toggle" for="show-light-helpers">
        <input id="show-light-helpers" type="checkbox" checked />
        <span>Show light helpers</span>
      </label>

      <label class="toggle" for="show-light-gizmos">
        <input id="show-light-gizmos" type="checkbox" checked />
        <span>Show light gizmos</span>
      </label>

      <label class="toggle" for="show-lighting-probes">
        <input id="show-lighting-probes" type="checkbox" checked />
        <span>Show lighting probes</span>
      </label>

      <label class="toggle" for="show-movement-controls">
        <input id="show-movement-controls" type="checkbox" checked />
        <span>Show movement controls</span>
      </label>

      <label class="toggle" for="physically-correct-lights">
        <input id="physically-correct-lights" type="checkbox" checked />
        <span>Physically correct lights</span>
      </label>

      <label class="toggle" for="shadows-enabled">
        <input id="shadows-enabled" type="checkbox" checked />
        <span>Shadows enabled</span>
      </label>

      <label for="tone-mapping">Tone mapping</label>
      <select id="tone-mapping">
        <option value="ACESFilmic" selected>ACES Filmic</option>
        <option value="Neutral">Neutral</option>
        <option value="None">None</option>
      </select>

      <label for="tone-mapping-exposure">Tone mapping exposure</label>
      <input id="tone-mapping-exposure" type="number" min="0.05" max="8" step="0.05" value="1.0" />
    </div>
  </details>

  <details class="section section-collapsible advanced-only" aria-label="Advanced scene save and load">
    <summary>Advanced: Save / Load</summary>
    <div class="section-body">
      <label for="scene-name">Scene name</label>
      <input id="scene-name" type="text" value="Untitled Scene" maxlength="120" />

      <div class="row">
        <button id="save-scene-file-btn" type="button">Save scene file</button>
        <button id="open-scene-file-btn" type="button">Load scene file</button>
      </div>
      <input id="load-scene-file-input" type="file" accept=".json,.sparkscene.json" hidden />

      <label for="scene-slot-name">Slot name</label>
      <input id="scene-slot-name" type="text" placeholder="my-light-setup" maxlength="80" />

      <div class="row">
        <button id="save-scene-slot-btn" type="button">Save slot</button>
        <select id="scene-slot-select" aria-label="Saved scene slots"></select>
      </div>

      <div class="row">
        <button id="load-scene-slot-btn" type="button">Load slot</button>
        <button id="delete-scene-slot-btn" type="button">Delete slot</button>
      </div>
    </div>
  </details>

  <div id="missing-splat-prompt" class="missing-splat" hidden>
    <p id="missing-splat-text"></p>
    <button id="pick-missing-splat-btn" type="button">Pick referenced splat</button>
  </div>

  <p id="status" role="status">Waiting for Spark preview module...</p>
</div>
<button id="show-panel-btn" type="button" aria-label="Show options panel" hidden>Show options</button>
`;
