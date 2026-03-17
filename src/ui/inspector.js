// npm install dockview-core tweakpane && npm run dev

import { Pane } from 'tweakpane';
import { ensurePrim, extractSplatMeta } from './prim-utils.js';

const WORLD_TARGET = 'world';
const PLAYER_TARGET = 'player';
const OBJECT_TARGET = 'object';

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

export class Inspector {
  constructor({ container, eventBus }) {
    this.container = container;
    this.eventBus = eventBus;
    this.pane = null;
    this.selection = { target: null, object: null, uuids: [] };
    this.scene = null;
    this.playerState = null;
    this.disposers = [];

    this.disposers.push(
      eventUnsub(eventBus, 'selectionChanged', (payload) => {
        this.selection = this.normalizeSelection(payload);
        this.rebuild();
      }),
      eventUnsub(eventBus, 'player:selected', (payload) => {
        this.selection = this.normalizeSelection({ ...payload, target: PLAYER_TARGET });
        this.rebuild();
      }),
      eventUnsub(eventBus, 'player:stateChanged', (payload) => {
        this.playerState = payload ?? this.playerState;
        if (this.selection.target === PLAYER_TARGET || this.isPlayerObject(this.selection.object)) {
          this.rebuild();
        }
      }),
      eventUnsub(eventBus, 'sceneLoaded', (payload) => {
        this.scene = payload?.scene ?? this.scene;
        this.rebuild();
      })
    );

    const worldRefreshEvents = [
      'environment:viewMode',
      'environment:showProxy',
      'environment:showProxyBones',
      'environment:flipUpDown',
      'environment:flipLeftRight',
      'controls:collision',
      'quality:improved',
      'quality:maxDetail',
      'lights:showHelpers',
      'lights:showGizmos',
      'lights:showProbes',
      'lights:showMovementControls',
      'lights:rendererSettings'
    ];

    for (const eventName of worldRefreshEvents) {
      this.disposers.push(
        eventUnsub(eventBus, eventName, () => {
          if (this.selection.target === WORLD_TARGET) {
            this.rebuild();
          }
        })
      );
    }

    this.rebuild();
  }

  normalizeSelection(payload) {
    const object = payload?.object ?? null;
    const target = payload?.target;
    const uuids = Array.isArray(payload?.uuids)
      ? payload.uuids.filter((value) => typeof value === 'string')
      : [];
    if (object?.uuid && !uuids.includes(object.uuid)) {
      uuids.unshift(object.uuid);
    }

    if (target === WORLD_TARGET) {
      return { target: WORLD_TARGET, object: null, uuids: [] };
    }
    if (target === PLAYER_TARGET || this.isPlayerObject(object)) {
      return { target: PLAYER_TARGET, object, uuids };
    }
    if (target === OBJECT_TARGET || object) {
      return { target: OBJECT_TARGET, object, uuids };
    }

    return { target: null, object: null, uuids: [] };
  }

  rebuild() {
    this.disposePane();
    this.container.replaceChildren();

    if (this.selection.target === WORLD_TARGET) {
      this.pane = new Pane({ container: this.container });
      this.buildWorldInspector();
      return;
    }

    const object = this.selection.object;
    if (!object) {
      const empty = document.createElement('p');
      empty.className = 'spark-empty';
      empty.textContent = 'Select a hierarchy item to inspect.';
      this.container.append(empty);
      return;
    }

    this.pane = new Pane({ container: this.container });
    const selectedObjects = this.getSelectedObjects();
    if (selectedObjects.length > 1) {
      this.buildMultiObjectInspector(selectedObjects);
      return;
    }
    this.buildObjectInspector(object);
  }

  getSelectedObjects() {
    if (!this.scene || !Array.isArray(this.selection.uuids)) return [];
    const objects = this.selection.uuids
      .map((uuid) => this.scene?.getObjectByProperty?.('uuid', uuid) ?? null)
      .filter((entry) => Boolean(entry));
    return objects;
  }

  buildMultiObjectInspector(objects) {
    const header = {
      count: objects.length
    };
    this.pane.addBinding(header, 'count', { label: 'Selected', readonly: true });

    const average = (key, axis) => {
      if (!objects.length) return 0;
      let total = 0;
      for (const object of objects) total += Number(object?.[key]?.[axis] ?? 0);
      return total / objects.length;
    };

    const transformState = {
      positionX: average('position', 'x'),
      positionY: average('position', 'y'),
      positionZ: average('position', 'z'),
      rotationX: average('rotation', 'x'),
      rotationY: average('rotation', 'y'),
      rotationZ: average('rotation', 'z'),
      scaleX: average('scale', 'x'),
      scaleY: average('scale', 'y'),
      scaleZ: average('scale', 'z')
    };

    const transform = this.pane.addFolder({ title: 'Transform (Multi)', expanded: true });
    const bindMulti = (key, axis, field, options = {}) => {
      transform.addBinding(transformState, field, options).on('change', (event) => {
        for (const object of objects) {
          if (object?.userData?.editorLocked) continue;
          object[key][axis] = Number(event.value);
          object.updateMatrixWorld?.(true);
        }
        this.eventBus.emit('hierarchyChanged');
      });
    };
    bindMulti('position', 'x', 'positionX', { step: 0.01 });
    bindMulti('position', 'y', 'positionY', { step: 0.01 });
    bindMulti('position', 'z', 'positionZ', { step: 0.01 });
    bindMulti('rotation', 'x', 'rotationX', { step: 0.01 });
    bindMulti('rotation', 'y', 'rotationY', { step: 0.01 });
    bindMulti('rotation', 'z', 'rotationZ', { step: 0.01 });
    bindMulti('scale', 'x', 'scaleX', { step: 0.01 });
    bindMulti('scale', 'y', 'scaleY', { step: 0.01 });
    bindMulti('scale', 'z', 'scaleZ', { step: 0.01 });
  }

  buildObjectInspector(object) {
    const editorView = {
      name: object.name || '',
      visible: object.visible !== false,
      locked: Boolean(object.userData?.editorLocked)
    };
    const editorFolder = this.pane.addFolder({ title: 'Editor', expanded: true });
    editorFolder.addBinding(editorView, 'name').on('change', (event) => {
      object.name = String(event.value || '');
      this.eventBus.emit('hierarchyChanged');
    });
    editorFolder.addBinding(editorView, 'visible').on('change', (event) => {
      this.eventBus.emit('hierarchy:visibilityRequested', {
        uuid: object.uuid,
        visible: Boolean(event.value)
      });
    });
    editorFolder.addBinding(editorView, 'locked').on('change', (event) => {
      this.eventBus.emit('hierarchy:lockRequested', {
        uuid: object.uuid,
        locked: Boolean(event.value)
      });
    });

    const onTransformChange = () => {
      if (object.userData?.editorLocked) {
        this.rebuild();
        return;
      }
      this.eventBus.emit('hierarchyChanged');
    };

    const transform = this.pane.addFolder({ title: 'Transform', expanded: true });
    transform.addBinding(object.position, 'x', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.position, 'y', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.position, 'z', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.rotation, 'x', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.rotation, 'y', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.rotation, 'z', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.scale, 'x', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.scale, 'y', { step: 0.01 }).on('change', onTransformChange);
    transform.addBinding(object.scale, 'z', { step: 0.01 }).on('change', onTransformChange);

    const prim = ensurePrim(object);
    const primView = { path: prim.path, type: prim.type };
    const primFolder = this.pane.addFolder({ title: 'Prim', expanded: true });
    primFolder.addBinding(primView, 'path', { readonly: true });
    primFolder.addBinding(primView, 'type', { readonly: true });

    const splat = extractSplatMeta(object);
    if (splat.isSplatMesh) {
      const sparkFolder = this.pane.addFolder({ title: 'Spark', expanded: true });
      const sparkView = {
        lodEnabled: splat.lodEnabled == null ? 'n/a' : String(splat.lodEnabled),
        lodSplatCount: splat.lodSplatCount ?? 'n/a',
        splatCount: splat.splatCount ?? 'n/a'
      };
      sparkFolder.addBinding(sparkView, 'lodEnabled', { readonly: true });
      sparkFolder.addBinding(sparkView, 'lodSplatCount', { readonly: true });
      sparkFolder.addBinding(sparkView, 'splatCount', { readonly: true });
    }

    if (object.isLight) {
      const lightFolder = this.pane.addFolder({ title: 'Light', expanded: true });
      if (object.color) {
        const colorState = { color: `#${object.color.getHexString()}` };
        lightFolder.addBinding(colorState, 'color').on('change', (event) => {
          object.color.set(event.value);
          this.eventBus.emit('hierarchyChanged');
        });
      }
      if (typeof object.intensity === 'number') {
        lightFolder.addBinding(object, 'intensity', { min: 0, max: 10, step: 0.01 }).on('change', () => {
          this.eventBus.emit('hierarchyChanged');
        });
      }
    }

    if (this.selection.target === PLAYER_TARGET || this.isPlayerObject(object)) {
      const state = this.playerState ?? {};
      const position = state.position ?? {};
      const playerView = {
        collisionEnabled: Boolean(state.collisionEnabled),
        isGrounded: state.isGrounded == null ? 'n/a' : String(Boolean(state.isGrounded)),
        mode: state.mode ?? 'view',
        positionX: Number.isFinite(position.x) ? Number(position.x) : object.position.x,
        positionY: Number.isFinite(position.y) ? Number(position.y) : object.position.y,
        positionZ: Number.isFinite(position.z) ? Number(position.z) : object.position.z
      };

      const playerFolder = this.pane.addFolder({ title: 'Player', expanded: true });
      playerFolder.addBinding(playerView, 'collisionEnabled').on('change', (event) => {
        this.eventBus.emit('controls:collision', Boolean(event.value));
      });
      playerFolder.addBinding(playerView, 'isGrounded', { readonly: true });
      playerFolder.addBinding(playerView, 'mode', { readonly: true });
      playerFolder.addBinding(playerView, 'positionX', { readonly: true });
      playerFolder.addBinding(playerView, 'positionY', { readonly: true });
      playerFolder.addBinding(playerView, 'positionZ', { readonly: true });
    }
  }

  buildWorldInspector() {
    if (!(document.getElementById('panel') instanceof HTMLElement)) {
      const message = { status: 'Controls panel is unavailable. Open Controls to edit world settings.' };
      this.pane.addBinding(message, 'status', { readonly: true });
      return;
    }

    const missing = [];

    const level = {};
    const levelFolder = this.pane.addFolder({ title: 'Level', expanded: true });
    if (!this.bindTextControl(levelFolder, level, 'sceneName', { id: 'scene-name', label: 'Scene name' })) missing.push('#scene-name');
    if (
      !this.bindSelectControl(levelFolder, level, 'viewMode', {
        id: 'view-mode',
        label: 'View mode',
        options: {
          'Full scene': 'full',
          'Splats only': 'splats-only'
        }
      })
    ) missing.push('#view-mode');

    const render = {};
    const renderFolder = this.pane.addFolder({ title: 'Rendering', expanded: true });
    if (!this.bindCheckboxControl(renderFolder, render, 'improvedQuality', { id: 'quality-improved', label: 'Improved quality' })) {
      missing.push('#quality-improved');
    }
    if (!this.bindCheckboxControl(renderFolder, render, 'sourceQualityMode', { id: 'quality-max-detail', label: 'Source quality mode' })) {
      missing.push('#quality-max-detail');
    }
    if (!this.bindCheckboxControl(renderFolder, render, 'physicallyCorrectLights', { id: 'physically-correct-lights', label: 'Physically correct lights' })) {
      missing.push('#physically-correct-lights');
    }
    if (!this.bindCheckboxControl(renderFolder, render, 'shadowsEnabled', { id: 'shadows-enabled', label: 'Shadows enabled' })) {
      missing.push('#shadows-enabled');
    }
    if (
      !this.bindSelectControl(renderFolder, render, 'toneMapping', {
        id: 'tone-mapping',
        label: 'Tone mapping',
        options: {
          'ACES Filmic': 'ACESFilmic',
          Neutral: 'Neutral',
          None: 'None'
        }
      })
    ) missing.push('#tone-mapping');
    if (
      !this.bindNumberControl(renderFolder, render, 'toneMappingExposure', {
        id: 'tone-mapping-exposure',
        label: 'Tone exposure',
        min: 0.05,
        max: 8,
        step: 0.05,
        fallback: 1
      })
    ) missing.push('#tone-mapping-exposure');

    const environment = {};
    const environmentFolder = this.pane.addFolder({ title: 'Environment', expanded: true });
    if (!this.bindCheckboxControl(environmentFolder, environment, 'flipUpDown', { id: 'flip-updown', label: 'Flip upside down' })) {
      missing.push('#flip-updown');
    }
    if (!this.bindCheckboxControl(environmentFolder, environment, 'flipLeftRight', { id: 'flip-leftright', label: 'Flip left-right' })) {
      missing.push('#flip-leftright');
    }
    if (!this.bindCheckboxControl(environmentFolder, environment, 'showProxyMesh', { id: 'show-proxy-mesh', label: 'Show proxy mesh' })) {
      missing.push('#show-proxy-mesh');
    }
    if (!this.bindCheckboxControl(environmentFolder, environment, 'showProxyBones', { id: 'show-proxy-bones', label: 'Show bones' })) {
      missing.push('#show-proxy-bones');
    }
    if (!this.bindCheckboxControl(environmentFolder, environment, 'collisionEnabled', { id: 'collision-enabled', label: 'Camera collision' })) {
      missing.push('#collision-enabled');
    }

    const debug = {};
    const debugFolder = this.pane.addFolder({ title: 'Debug & Helpers', expanded: false });
    if (!this.bindCheckboxControl(debugFolder, debug, 'showLightHelpers', { id: 'show-light-helpers', label: 'Light helpers' })) {
      missing.push('#show-light-helpers');
    }
    if (!this.bindCheckboxControl(debugFolder, debug, 'showLightGizmos', { id: 'show-light-gizmos', label: 'Light gizmos' })) {
      missing.push('#show-light-gizmos');
    }
    if (!this.bindCheckboxControl(debugFolder, debug, 'showLightingProbes', { id: 'show-lighting-probes', label: 'Lighting probes' })) {
      missing.push('#show-lighting-probes');
    }
    if (!this.bindCheckboxControl(debugFolder, debug, 'showMovementControls', { id: 'show-movement-controls', label: 'Movement controls' })) {
      missing.push('#show-movement-controls');
    }

    const assets = {
      splat: this.readLoadedLabel('splat-loaded-name'),
      proxy: this.readLoadedLabel('proxy-loaded-name')
    };
    const assetsFolder = this.pane.addFolder({ title: 'Assets', expanded: false });
    assetsFolder.addBinding(assets, 'splat', { label: 'Splat', readonly: true });
    assetsFolder.addBinding(assets, 'proxy', { label: 'Proxy', readonly: true });

    if (missing.length) {
      const info = this.pane.addFolder({ title: 'Inspector Status', expanded: false });
      const status = { missing: missing.join(', ') };
      info.addBinding(status, 'missing', { label: 'Missing controls', readonly: true });
    }
  }

  bindTextControl(folder, view, key, config) {
    const control = this.resolveControl(config.id);
    if (!(control instanceof HTMLInputElement)) return false;

    view[key] = String(control.value ?? '');
    const binding = folder.addBinding(view, key, { label: config.label });
    binding.on('change', (event) => {
      control.value = String(event.value ?? '');
      this.dispatchControlInput(control);
    });
    if ('disabled' in binding) binding.disabled = Boolean(control.disabled);
    return true;
  }

  bindSelectControl(folder, view, key, config) {
    const control = this.resolveControl(config.id);
    if (!(control instanceof HTMLSelectElement)) return false;

    view[key] = control.value;
    const binding = folder.addBinding(view, key, {
      label: config.label,
      options: config.options
    });
    binding.on('change', (event) => {
      control.value = String(event.value ?? '');
      this.dispatchControlChange(control);
    });
    if ('disabled' in binding) binding.disabled = Boolean(control.disabled);
    return true;
  }

  bindCheckboxControl(folder, view, key, config) {
    const control = this.resolveControl(config.id);
    if (!(control instanceof HTMLInputElement)) return false;

    view[key] = Boolean(control.checked);
    const binding = folder.addBinding(view, key, { label: config.label });
    binding.on('change', (event) => {
      control.checked = Boolean(event.value);
      this.dispatchControlChange(control);
    });
    if ('disabled' in binding) binding.disabled = Boolean(control.disabled);
    return true;
  }

  bindNumberControl(folder, view, key, config) {
    const control = this.resolveControl(config.id);
    if (!(control instanceof HTMLInputElement)) return false;

    const parsed = Number(control.value);
    view[key] = Number.isFinite(parsed) ? parsed : Number(config.fallback ?? 0);

    const options = {
      label: config.label,
      min: config.min,
      max: config.max,
      step: config.step
    };
    const binding = folder.addBinding(view, key, options);
    binding.on('change', (event) => {
      control.value = String(event.value);
      this.dispatchControlChange(control);
    });
    if ('disabled' in binding) binding.disabled = Boolean(control.disabled);
    return true;
  }

  dispatchControlInput(control) {
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  dispatchControlChange(control) {
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  readLoadedLabel(id) {
    const node = this.resolveControl(id);
    if (!(node instanceof HTMLElement)) return 'none';
    const text = String(node.textContent ?? '').replace(/^Loaded:\s*/i, '').trim();
    return text || 'none';
  }

  resolveControl(id) {
    return document.getElementById(id);
  }

  isPlayerObject(object) {
    return Boolean(object?.isCamera);
  }

  disposePane() {
    if (this.pane) {
      this.pane.dispose();
      this.pane = null;
    }
  }

  dispose() {
    this.disposePane();
    for (const dispose of this.disposers.splice(0)) dispose();
    this.container.replaceChildren();
  }
}
