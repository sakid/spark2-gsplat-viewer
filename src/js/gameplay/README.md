# Gameplay layer

This folder is a lightweight gameplay structure built on top of the existing `SceneManager` + `sceneSubjects` update loop.

## Concepts
- `core/World`: owns actors and updates them.
- `core/Actor`: a `THREE.Group` + a list of updateable components.
- `components/Animator`: thin wrapper around `THREE.AnimationMixer` with crossfades.
- `components/Locomotion`: simple move-to + turn-to.
- `npc/NpcActor`: loads a GLB via the existing proxy loader, then runs a basic wander brain that switches between idle/walk clips.
- `state/GameState`: flags/vars/quests persisted to `localStorage`.
- `interaction/Interactable` + `interaction/Interactor`: look-at focus + `E` interact.
- `dialog/DialogRuntime`: JSON node graph dialog with conditions + commands.

## Enabling the demo
Add `?npc=1` (or `?gameplay=1`) to the URL to spawn a single NPC.
