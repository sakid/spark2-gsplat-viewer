function byId(id, root = document) {
  if (root && typeof root.querySelector === 'function') {
    return root.querySelector(`#${id}`) ?? null;
  }
  return null;
}

function on(element, event, handler, disposers) {
  if (!element) return;
  element.addEventListener(event, handler);
  disposers.push(() => element.removeEventListener(event, handler));
}

// NEW PROXY ANIMATION
export function bindProxyUi(eventBus, disposers, root = document) {
  const animClip = byId('proxy-anim-clip', root);
  const animPlay = byId('proxy-anim-play', root);
  const animSpeed = byId('proxy-anim-speed', root);
  const animRestart = byId('proxy-anim-restart', root);
  const collisionMode = byId('proxy-collision-mode', root);
  const deformSplat = byId('proxy-deform-splat', root);

  const updateClipOptions = (clips) => {
    if (!animClip) return;
    const list = Array.isArray(clips) ? clips : [];
    animClip.innerHTML = '';
    if (list.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No animation clips';
      animClip.appendChild(option);
      animClip.disabled = true;
      return;
    }
    animClip.disabled = false;
    list.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = name || `Clip ${index + 1}`;
      animClip.appendChild(option);
    });
  };

  const unsubscribeClipList = eventBus.on('environment:proxyClipList', updateClipOptions);
  disposers.push(unsubscribeClipList);
  eventBus.emit('environment:requestProxyClipList');
  on(animPlay, 'change', () => eventBus.emit('environment:proxyAnimPlay', Boolean(animPlay?.checked)), disposers);
  on(animClip, 'change', () => eventBus.emit('environment:proxyAnimClip', Number(animClip?.value ?? 0)), disposers);
  on(animSpeed, 'input', () => eventBus.emit('environment:proxyAnimSpeed', Number(animSpeed?.value ?? 1)), disposers);
  on(animRestart, 'click', () => eventBus.emit('environment:proxyAnimRestart'), disposers);
  on(collisionMode, 'change', () => eventBus.emit('environment:proxyCollisionMode', collisionMode?.value ?? 'bone'), disposers);
  on(deformSplat, 'change', () => eventBus.emit('environment:proxyDeformSplat', Boolean(deformSplat?.checked)), disposers);
  updateClipOptions([]);
  eventBus.emit('environment:proxyAnimPlay', Boolean(animPlay?.checked));
  eventBus.emit('environment:proxyAnimClip', Number(animClip?.value ?? 0));
  eventBus.emit('environment:proxyAnimSpeed', Number(animSpeed?.value ?? 1));
  eventBus.emit('environment:proxyCollisionMode', collisionMode?.value ?? 'bone');
  eventBus.emit('environment:proxyDeformSplat', Boolean(deformSplat?.checked));
}
