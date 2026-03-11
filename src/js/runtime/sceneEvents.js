import { stampPrim } from '../../ui/prim-utils.js';

export function installSceneEventHooks(scene, eventBus) {
  if (!scene) return false;
  if (scene.__sparkSceneEventsPatched) return true;

  const originalAdd = scene.add.bind(scene);
  const originalRemove = scene.remove.bind(scene);

  scene.add = (...objects) => {
    const result = originalAdd(...objects);
    for (const object of objects) {
      if (!object) continue;
      stampPrim(object);
      eventBus.emit('objectAdded', { object });
      eventBus.emit('hierarchyChanged');
    }
    return result;
  };

  scene.remove = (...objects) => {
    const result = originalRemove(...objects);
    for (const object of objects) {
      if (!object) continue;
      eventBus.emit('objectRemoved', { object });
      eventBus.emit('hierarchyChanged');
    }
    return result;
  };

  scene.__sparkSceneEventsPatched = true;
  return true;
}

