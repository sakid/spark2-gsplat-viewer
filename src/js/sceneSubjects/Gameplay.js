import { World } from '../gameplay/core/World';
import { NpcActor } from '../gameplay/npc/NpcActor';
import { DEFAULT_BOOT_PROXY_URL } from '../internal/startupAssets';
import { InputRouter } from '../gameplay/input/InputRouter';
import { Interactor } from '../gameplay/interaction/Interactor';
import { GameState } from '../gameplay/state/GameState';
import { DialogStore } from '../gameplay/dialog/DialogStore';
import { DialogRuntime } from '../gameplay/dialog/DialogRuntime';

function isEnabledByQuery() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('gameplay') === '1' || params.get('npc') === '1';
}

export class Gameplay {
  constructor() {
    this.unsubscribers = [];
    this.enabled = false;
    this.mode = 'view';
  }

  async init(context) {
    this.context = context;
    this.world = new World({ context });
    this.world.player = {
      camera: context.camera,
      getMode: () => this.mode
    };

    this.state = new GameState({ eventBus: context.eventBus });
    this.state.bindEvents();
    this.state.load();
    this.world.state = this.state;

    this.dialogStore = new DialogStore();
    this.dialog = new DialogRuntime({ eventBus: context.eventBus, state: this.state, store: this.dialogStore, world: this.world });
    this.world.dialog = this.dialog;

    this.interactor = new Interactor({ world: this.world, eventBus: context.eventBus, camera: context.camera });
    this.input = new InputRouter({
      eventBus: context.eventBus,
      getMode: () => this.mode,
      isDialogActive: () => Boolean(this.dialog?.isActive?.() ?? this.dialog?.active)
    });
    this.input.init();

    const on = (event, handler) => {
      const dispose = context.eventBus.on?.(event, handler) ?? (() => context.eventBus.off?.(event, handler));
      this.unsubscribers.push(dispose);
    };

    on('controls:mode', (mode) => {
      this.mode = mode ?? 'view';
    });

    on('gameplay:enable', (enabled) => {
      this.enabled = Boolean(enabled);
      this.world.enabled = this.enabled;
      this.context.setStatus(`Gameplay ${this.enabled ? 'enabled' : 'disabled'}.`, 'info');
    });

    on('input:action', (payload) => {
      const action = payload?.action;
      if (action === 'Interact') {
        if (!this.enabled) return;
        this.interactor.tryInteract();
        return;
      }
      if (action === 'DialogAdvance') context.eventBus.emit('dialog:advanceRequested');
      else if (action === 'DialogClose') context.eventBus.emit('dialog:closeRequested');
      else if (typeof action === 'string' && action.startsWith('DialogChoice')) {
        const number = Number(action.slice('DialogChoice'.length));
        if (Number.isFinite(number) && number >= 1 && number <= 9) {
          context.eventBus.emit('dialog:chooseRequested', { index: number - 1 });
        }
      }
    });

    on('gameplay:spawnNpc', (options = {}) => {
      void (async () => {
        try {
          const npc = new NpcActor({
            name: options.name ?? `NPC_${(this.world.actors?.length ?? 0) + 1}`,
            url: options.url ?? DEFAULT_BOOT_PROXY_URL,
            position: options.position
          });
          await this.world.addActor(npc);
          this.context.setStatus(`Spawned ${npc.name}.`, 'success');
        } catch (error) {
          this.context.setStatus(`Spawn NPC failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
          console.error(error);
        }
      })();
    });

    on('dialog:startRequested', (payload) => {
      void (async () => {
        try {
          const id = payload?.id;
          if (!id) throw new Error('Missing dialog id.');
          const speakerActorId = payload?.speakerActorId ?? null;
          const speakerActor = speakerActorId ? this.world.getActorById(speakerActorId) : null;
          this.dialog.setPreviousMode(this.mode);
          await this.dialog.startDialog(id, { speakerActor });
        } catch (error) {
          this.context.setStatus(`Dialog start failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
          console.error(error);
        }
      })();
    });

    on('dialog:advanceRequested', () => {
      try {
        this.dialog.advance();
      } catch (error) {
        this.context.setStatus(`Dialog advance failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        console.error(error);
      }
    });

    on('dialog:chooseRequested', (payload) => {
      try {
        this.dialog.choose(payload?.index ?? 0);
      } catch (error) {
        this.context.setStatus(`Dialog choice failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        console.error(error);
      }
    });

    on('dialog:closeRequested', () => this.dialog.close());

    this.enabled = isEnabledByQuery();
    this.world.enabled = this.enabled;
    if (this.enabled) {
      const npc = new NpcActor({ url: DEFAULT_BOOT_PROXY_URL });
      await this.world.addActor(npc);
      this.context.setStatus(`Spawned ${npc.name}.`, 'success');
    }
  }

  update(delta) {
    if (!this.world) return;
    if (this.enabled && !this.dialog?.active) this.interactor?.update?.(delta);
    this.world.update(delta);
    this.dialog?.update?.(delta);
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    this.input?.dispose?.();
    this.input = null;
    this.state?.dispose?.();
    this.state = null;
    this.world?.dispose?.();
    this.world = null;
    this.dialog = null;
    this.dialogStore = null;
    this.interactor = null;
  }
}
