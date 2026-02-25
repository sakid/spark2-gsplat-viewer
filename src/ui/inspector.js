// npm install dockview-core tweakpane && npm run dev

import { Pane } from 'tweakpane';
import { ensurePrim, extractSplatMeta } from './prim-utils.js';

const eventUnsub = (eventBus, event, handler) => eventBus.on?.(event, handler) ?? (() => eventBus.off?.(event, handler));

export class Inspector {
  constructor({ container, eventBus }) {
    this.container = container;
    this.eventBus = eventBus;
    this.pane = null;
    this.selected = null;
    this.playerSelected = false;
    this.playerState = null;
    this.disposers = [];

    this.disposers.push(
      eventUnsub(eventBus, 'selectionChanged', (payload) => {
        this.selected = payload?.object ?? null;
        this.playerSelected = false;
        this.rebuild();
      }),
      eventUnsub(eventBus, 'player:selected', (payload) => {
        this.selected = payload?.object ?? this.selected;
        this.playerSelected = true;
        this.rebuild();
      }),
      eventUnsub(eventBus, 'player:stateChanged', (payload) => {
        this.playerState = payload ?? this.playerState;
        if (this.isPlayerObject(this.selected) || this.playerSelected) {
          this.rebuild();
        }
      }),
      eventUnsub(eventBus, 'sceneLoaded', () => this.rebuild())
    );

    this.rebuild();
  }

  rebuild() {
    this.disposePane();
    this.container.replaceChildren();

    if (!this.selected) {
      const empty = document.createElement('p');
      empty.className = 'spark-empty';
      empty.textContent = 'Select an object to inspect.';
      this.container.append(empty);
      return;
    }

    this.pane = new Pane({ container: this.container });
    const object = this.selected;

    const transform = this.pane.addFolder({ title: 'Transform', expanded: true });
    transform.addBinding(object.position, 'x', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.position, 'y', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.position, 'z', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.rotation, 'x', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.rotation, 'y', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.rotation, 'z', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.scale, 'x', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.scale, 'y', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));
    transform.addBinding(object.scale, 'z', { step: 0.01 }).on('change', () => this.eventBus.emit('hierarchyChanged'));

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

    if (this.isPlayerObject(object) || this.playerSelected) {
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
