import * as THREE from 'three';
import { World } from '../gameplay/core/World';
import { NpcActor } from '../gameplay/npc/NpcActor';
import { SplatCharacterActor } from '../gameplay/splat/SplatCharacterActor';
import { DEFAULT_BOOT_PROXY_URL, DEFAULT_BOOT_SPLAT_URL } from '../internal/startupAssets';
import { InputRouter } from '../gameplay/input/InputRouter';
import { Interactor } from '../gameplay/interaction/Interactor';
import { GameState } from '../gameplay/state/GameState';
import { DialogStore } from '../gameplay/dialog/DialogStore';
import { DialogRuntime } from '../gameplay/dialog/DialogRuntime';

function isEnabledByQuery() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('gameplay') === '1' || params.get('npc') === '1' || params.get('level') === '1';
}

export class Gameplay {
  constructor() {
    this.unsubscribers = [];
    this.enabled = false;
    this.levelActive = false;
    this.mode = 'view';
    this.levelActors = [];
    this.playerActor = null;
    this.npcActor = null;
    this.goalSheepActor = null;
    this.moveKeys = new Set();
    this.tempForward = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempMove = new THREE.Vector3();
    this.tempTarget = new THREE.Vector3();
    this.tempDesiredCamera = new THREE.Vector3();
    this.tempQuat = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.cameraDistance = 2.4;
    this.cameraHeight = 1.25;
    this.lookHeight = 0.75;
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
    context.eventBus.emit?.('game:stateChanged', this.state.toJSON());
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
      if (enabled) {
        void this.startSplatLevel();
        return;
      }
      this.stopSplatLevel();
    });

    on('gameplay:startSplatLevel', () => {
      void this.startSplatLevel();
    });

    on('gameplay:stopSplatLevel', () => {
      this.stopSplatLevel();
    });

    on('gameplay:requestLevelState', () => {
      this.emitLevelState();
    });

    on('game:stateChanged', () => {
      this.emitLevelState();
    });

    on('dom:keydown', (event) => this.onMovementKeyDown(event));
    on('dom:keyup', (event) => this.onMovementKeyUp(event));

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

    if (isEnabledByQuery()) {
      await this.startSplatLevel({ quiet: true });
    }
    this.emitLevelState();
  }

  emitLevelState() {
    const quest = this.state?.getQuest?.('sheep') ?? null;
    const questStatus = quest?.status ?? 'inactive';
    const levelText = this.levelActive
      ? questStatus === 'completed'
        ? 'Level active: quest complete. Talk to Sean to finish conversation.'
        : questStatus === 'active'
          ? 'Level active: find the lost sheep and return to Sean.'
          : 'Level active: talk to Sean to start the sheep quest.'
      : 'Level inactive.';

    this.context?.eventBus?.emit('gameplay:levelState', {
      active: this.levelActive,
      enabled: this.enabled,
      mode: this.mode,
      questStatus,
      actorCount: this.levelActors.length,
      text: levelText
    });
  }

  async startSplatLevel({ quiet = false } = {}) {
    if (this.levelActive && this.enabled) {
      this.context?.eventBus?.emit('controls:mode', 'gameplay');
      this.emitLevelState();
      return true;
    }

    this.stopSplatLevel({ silent: true, keepState: true });
    this.enabled = true;
    this.world.enabled = true;

    try {
      const player = new SplatCharacterActor({
        name: 'Player Sheep',
        url: DEFAULT_BOOT_SPLAT_URL,
        desiredHeight: 1.15,
        position: new THREE.Vector3(0, 0, 0)
      });
      await this.world.addActor(player);
      this.playerActor = player;
      this.levelActors.push(player);

      const npc = new SplatCharacterActor({
        name: 'Sean',
        url: DEFAULT_BOOT_SPLAT_URL,
        desiredHeight: 1.05,
        position: new THREE.Vector3(2.4, 0, -1.6),
        wander: {
          center: new THREE.Vector3(2.4, 0, -1.6),
          radius: 1.2,
          speed: 0.8,
          turnSpeed: 8,
          minIdleSeconds: 0.7,
          maxIdleSeconds: 1.8
        },
        interactable: {
          prompt: 'talk',
          dialogId: 'sean_intro',
          speakerName: 'Sean',
          range: 2.4,
          raycast: true
        }
      });
      await this.world.addActor(npc);
      this.npcActor = npc;
      this.levelActors.push(npc);

      const goalSheep = new SplatCharacterActor({
        name: 'Lost Sheep',
        url: DEFAULT_BOOT_SPLAT_URL,
        desiredHeight: 0.95,
        position: new THREE.Vector3(-3.2, 0, 2.2),
        interactable: {
          prompt: 'rescue',
          speakerName: 'Lost Sheep',
          range: 2.0,
          raycast: true,
          onInteract: ({ world, actor }) => this.onGoalSheepInteract({ world, actor })
        }
      });
      await this.world.addActor(goalSheep);
      this.goalSheepActor = goalSheep;
      this.levelActors.push(goalSheep);

      this.levelActive = true;
      this.moveKeys.clear();
      this.context?.eventBus?.emit('controls:mode', 'gameplay');
      this.snapCameraToPlayer(true);
      if (!quiet) {
        this.context?.setStatus('Splat level ready: WASD to move, Shift to run, E to interact.', 'success');
      }
      this.emitLevelState();
      return true;
    } catch (error) {
      this.stopSplatLevel({ silent: true, keepState: true });
      this.context?.setStatus(`Splat level setup failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      console.error(error);
      return false;
    }
  }

  stopSplatLevel({ silent = false, keepState = false } = {}) {
    if (this.levelActors.length) {
      for (const actor of [...this.levelActors].reverse()) {
        this.world?.removeActor?.(actor);
      }
    }
    this.levelActors = [];
    this.playerActor = null;
    this.npcActor = null;
    this.goalSheepActor = null;
    this.moveKeys.clear();
    this.levelActive = false;
    this.enabled = false;
    this.world.enabled = false;
    if (!keepState && this.mode === 'gameplay') {
      this.context?.eventBus?.emit('controls:mode', 'view');
    }
    if (!silent) {
      this.context?.setStatus('Splat level stopped.', 'info');
    }
    this.emitLevelState();
  }

  onGoalSheepInteract({ world, actor }) {
    const accepted = this.state?.getFlag?.('accepted_sheep_quest') ?? false;
    if (!accepted) {
      this.context?.setStatus('Talk to Sean first to accept the quest.', 'warning');
      return;
    }
    const alreadyFound = this.state?.getFlag?.('found_sheep') ?? false;
    if (!alreadyFound) {
      this.state?.setFlag?.('found_sheep', true);
      this.state?.setQuestStage?.('sheep', 'return');
      this.state?.completeQuest?.('sheep');
      this.context?.setStatus('Lost sheep found. Return to Sean.', 'success');
    }
    world?.context?.eventBus?.emit?.('dialog:startRequested', {
      id: 'sheep_found',
      speakerActorId: actor?.id ?? null
    });
    this.emitLevelState();
  }

  onMovementKeyDown(event) {
    if (this.mode !== 'gameplay') return;
    if (this.dialog?.active) return;
    const code = event?.code ?? '';
    if (!code.startsWith('Key') && code !== 'ShiftLeft' && code !== 'ShiftRight') return;
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(code)) return;
    this.moveKeys.add(code);
    event?.preventDefault?.();
  }

  onMovementKeyUp(event) {
    const code = event?.code ?? '';
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(code)) return;
    this.moveKeys.delete(code);
  }

  updatePlayerMovement(delta) {
    const player = this.playerActor?.root;
    const camera = this.context?.camera;
    if (!player || !camera) return;

    const dt = Math.max(0, Number(delta) || 0);
    if (dt <= 0) return;

    const forward = Number(this.moveKeys.has('KeyW')) - Number(this.moveKeys.has('KeyS'));
    const side = Number(this.moveKeys.has('KeyD')) - Number(this.moveKeys.has('KeyA'));
    const moving = forward !== 0 || side !== 0;

    if (!moving) {
      this.playerActor?.setMovementBlend?.(0);
      return;
    }

    this.tempForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.tempForward.y = 0;
    if (this.tempForward.lengthSq() < 1e-8) this.tempForward.set(0, 0, -1);
    this.tempForward.normalize();
    this.tempRight.crossVectors(this.tempForward, this.up).normalize();

    this.tempMove.set(0, 0, 0);
    if (forward) this.tempMove.addScaledVector(this.tempForward, forward);
    if (side) this.tempMove.addScaledVector(this.tempRight, side);
    if (this.tempMove.lengthSq() <= 1e-6) {
      this.playerActor?.setMovementBlend?.(0);
      return;
    }

    this.tempMove.normalize();
    const running = this.moveKeys.has('ShiftLeft') || this.moveKeys.has('ShiftRight');
    const speed = running ? 2.6 : 1.6;
    player.position.addScaledVector(this.tempMove, speed * dt);
    player.position.y = 0;

    const yaw = Math.atan2(this.tempMove.x, this.tempMove.z);
    this.tempQuat.setFromAxisAngle(this.up, yaw);
    player.quaternion.slerp(this.tempQuat, THREE.MathUtils.clamp(dt * 10, 0, 1));
    this.playerActor?.setMovementBlend?.(running ? 1 : 0.72);
  }

  snapCameraToPlayer(force = false) {
    const player = this.playerActor?.root;
    const camera = this.context?.camera;
    if (!player || !camera) return;

    this.tempTarget.copy(player.position);
    this.tempTarget.y += this.lookHeight;

    this.tempForward.set(0, 0, 1).applyQuaternion(player.quaternion).normalize();
    this.tempDesiredCamera.copy(this.tempTarget)
      .addScaledVector(this.tempForward, this.cameraDistance);
    this.tempDesiredCamera.y += this.cameraHeight;

    if (force) camera.position.copy(this.tempDesiredCamera);
    else camera.position.lerp(this.tempDesiredCamera, 0.18);
    camera.lookAt(this.tempTarget);
  }

  updateThirdPersonCamera(delta) {
    const dt = Math.max(0, Number(delta) || 0);
    if (dt <= 0) return;
    const player = this.playerActor?.root;
    const camera = this.context?.camera;
    if (!player || !camera) return;

    this.tempTarget.copy(player.position);
    this.tempTarget.y += this.lookHeight;
    this.tempForward.set(0, 0, 1).applyQuaternion(player.quaternion).normalize();
    this.tempDesiredCamera.copy(this.tempTarget)
      .addScaledVector(this.tempForward, this.cameraDistance);
    this.tempDesiredCamera.y += this.cameraHeight;

    const follow = THREE.MathUtils.clamp(dt * 6.5, 0, 1);
    camera.position.lerp(this.tempDesiredCamera, follow);
    camera.lookAt(this.tempTarget);
  }

  update(delta) {
    if (!this.world) return;
    if (this.levelActive && this.mode === 'gameplay') {
      if (!this.dialog?.active) this.updatePlayerMovement(delta);
      else this.playerActor?.setMovementBlend?.(0);
      this.updateThirdPersonCamera(delta);
    }
    if (this.enabled && !this.dialog?.active) this.interactor?.update?.(delta);
    this.world.update(delta);
    this.dialog?.update?.(delta);
  }

  dispose() {
    this.stopSplatLevel({ silent: true, keepState: true });
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
