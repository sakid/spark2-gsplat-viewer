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

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// NEW PROXY ANIMATION
export function bindProxyUi(eventBus, disposers, root = document) {
  const animClip = byId('proxy-anim-clip', root);
  const animPlay = byId('proxy-anim-play', root);
  const animSpeed = byId('proxy-anim-speed', root);
  const animRestart = byId('proxy-anim-restart', root);
  const animPhase = byId('proxy-anim-phase', root);
  const animCycleDuration = byId('proxy-anim-cycle-duration', root);
  const animStride = byId('proxy-anim-stride', root);
  const animSway = byId('proxy-anim-sway', root);
  const animYaw = byId('proxy-anim-yaw', root);
  const animTorso = byId('proxy-anim-torso', root);
  const animHead = byId('proxy-anim-head', root);
  const animBounce = byId('proxy-anim-bounce', root);
  const animGaitSharpness = byId('proxy-anim-gait-sharpness', root);
  const animMirror = byId('proxy-anim-mirror', root);
  const animResetWalk = byId('proxy-anim-reset-walk', root);
  const collisionMode = byId('proxy-collision-mode', root);
  const deformSplat = byId('proxy-deform-splat', root);
  let proxyKind = 'none';
  let scrubbingPhase = false;

  const walkInputs = [
    animPhase,
    animCycleDuration,
    animStride,
    animSway,
    animYaw,
    animTorso,
    animHead,
    animBounce,
    animGaitSharpness,
    animMirror,
    animResetWalk
  ];

  const readWalkSettings = () => ({
    cycleDuration: Math.max(0.2, asFiniteNumber(animCycleDuration?.value, 1.1)),
    strideDegrees: Math.max(0, asFiniteNumber(animStride?.value, 24)),
    swayDegrees: Math.max(0, asFiniteNumber(animSway?.value, 16)),
    yawDegrees: Math.max(0, asFiniteNumber(animYaw?.value, 9)),
    torsoTwistDegrees: Math.max(0, asFiniteNumber(animTorso?.value, 12)),
    headNodDegrees: Math.max(0, asFiniteNumber(animHead?.value, 8)),
    bounceAmount: Math.min(1, Math.max(0, asFiniteNumber(animBounce?.value, 0.22))),
    gaitSharpness: Math.min(1, Math.max(0, asFiniteNumber(animGaitSharpness?.value, 0.55))),
    phaseOffset: 0,
    mirror: Boolean(animMirror?.checked)
  });

  const applyWalkSettings = (settings = {}) => {
    if (animCycleDuration) animCycleDuration.value = String(asFiniteNumber(settings.cycleDuration, asFiniteNumber(animCycleDuration.value, 1.1)));
    if (animStride) animStride.value = String(asFiniteNumber(settings.strideDegrees, asFiniteNumber(animStride.value, 24)));
    if (animSway) animSway.value = String(asFiniteNumber(settings.swayDegrees, asFiniteNumber(animSway.value, 16)));
    if (animYaw) animYaw.value = String(asFiniteNumber(settings.yawDegrees, asFiniteNumber(animYaw.value, 9)));
    if (animTorso) animTorso.value = String(asFiniteNumber(settings.torsoTwistDegrees, asFiniteNumber(animTorso.value, 12)));
    if (animHead) animHead.value = String(asFiniteNumber(settings.headNodDegrees, asFiniteNumber(animHead.value, 8)));
    if (animBounce) animBounce.value = String(asFiniteNumber(settings.bounceAmount, asFiniteNumber(animBounce.value, 0.22)));
    if (animGaitSharpness) animGaitSharpness.value = String(asFiniteNumber(settings.gaitSharpness, asFiniteNumber(animGaitSharpness.value, 0.55)));
    if (animMirror && settings.mirror != null) animMirror.checked = Boolean(settings.mirror);
  };

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
    animClip.disabled = proxyKind === 'none';
    list.forEach((name, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = name || `Clip ${index + 1}`;
      animClip.appendChild(option);
    });
  };

  const updateApplicability = (kind) => {
    proxyKind = kind === 'external' || kind === 'voxel' ? kind : 'none';
    const hasProxy = proxyKind !== 'none';
    const hasVoxelProxy = proxyKind === 'voxel';
    if (animPlay) animPlay.disabled = !hasProxy;
    if (animSpeed) animSpeed.disabled = !hasProxy;
    if (animRestart) animRestart.disabled = !hasProxy;
    if (collisionMode) collisionMode.disabled = !hasProxy;
    if (deformSplat) deformSplat.disabled = !hasProxy;
    if (animClip) {
      const hasNoClipsOption = animClip.children.length > 0 && animClip.children[0]?.textContent === 'No animation clips';
      const hasPlayableClip = animClip.children.length > 0 && !hasNoClipsOption;
      animClip.disabled = !hasProxy || !hasPlayableClip;
    }
    for (const input of walkInputs) {
      if (!input) continue;
      input.disabled = !hasVoxelProxy;
    }
  };

  const onProxyAnimState = (state = {}) => {
    if (typeof state !== 'object' || !state) return;
    if (animPlay && typeof state.playing === 'boolean') {
      animPlay.checked = state.playing;
    }
    if (animSpeed && Number.isFinite(Number(state.speed))) {
      animSpeed.value = String(state.speed);
    }
    if (animClip && Number.isFinite(Number(state.clipIndex))) {
      animClip.value = String(Math.max(0, Math.floor(Number(state.clipIndex))));
    }
    if (animPhase && !scrubbingPhase && Number.isFinite(Number(state.phase))) {
      animPhase.value = String(Math.min(1, Math.max(0, Number(state.phase))));
    }
    if (state.walkSettings && typeof state.walkSettings === 'object') {
      applyWalkSettings(state.walkSettings);
    }
  };

  const emitWalkSettings = () => {
    eventBus.emit('environment:proxyWalkSettings', readWalkSettings());
  };

  const emitPhaseScrub = () => {
    const phase = Math.min(1, Math.max(0, asFiniteNumber(animPhase?.value, 0)));
    eventBus.emit('environment:proxyAnimPhase', phase);
  };

  const unsubscribeClipList = eventBus.on('environment:proxyClipList', updateClipOptions);
  const unsubscribeProxyKind = eventBus.on('environment:proxyKind', updateApplicability);
  const unsubscribeAnimState = eventBus.on('environment:proxyAnimState', onProxyAnimState);
  disposers.push(unsubscribeClipList);
  disposers.push(unsubscribeProxyKind);
  disposers.push(unsubscribeAnimState);
  eventBus.emit('environment:requestProxyClipList');
  eventBus.emit('environment:requestProxyKind');
  eventBus.emit('environment:requestProxyAnimState');
  on(animPlay, 'change', () => eventBus.emit('environment:proxyAnimPlay', Boolean(animPlay?.checked)), disposers);
  on(animClip, 'change', () => eventBus.emit('environment:proxyAnimClip', Number(animClip?.value ?? 0)), disposers);
  on(animSpeed, 'input', () => eventBus.emit('environment:proxyAnimSpeed', Number(animSpeed?.value ?? 1)), disposers);
  on(animRestart, 'click', () => eventBus.emit('environment:proxyAnimRestart'), disposers);
  on(animPhase, 'input', () => {
    scrubbingPhase = true;
    emitPhaseScrub();
  }, disposers);
  on(animPhase, 'change', () => {
    emitPhaseScrub();
    scrubbingPhase = false;
  }, disposers);
  on(animCycleDuration, 'change', emitWalkSettings, disposers);
  on(animStride, 'change', emitWalkSettings, disposers);
  on(animSway, 'change', emitWalkSettings, disposers);
  on(animYaw, 'change', emitWalkSettings, disposers);
  on(animTorso, 'change', emitWalkSettings, disposers);
  on(animHead, 'change', emitWalkSettings, disposers);
  on(animBounce, 'change', emitWalkSettings, disposers);
  on(animGaitSharpness, 'change', emitWalkSettings, disposers);
  on(animMirror, 'change', emitWalkSettings, disposers);
  on(animResetWalk, 'click', () => eventBus.emit('environment:proxyWalkReset'), disposers);
  on(collisionMode, 'change', () => eventBus.emit('environment:proxyCollisionMode', collisionMode?.value ?? 'bone'), disposers);
  on(deformSplat, 'change', () => eventBus.emit('environment:proxyDeformSplat', Boolean(deformSplat?.checked)), disposers);
  updateClipOptions([]);
  updateApplicability('none');
  eventBus.emit('environment:proxyAnimPlay', Boolean(animPlay?.checked));
  eventBus.emit('environment:proxyAnimClip', Number(animClip?.value ?? 0));
  eventBus.emit('environment:proxyAnimSpeed', Number(animSpeed?.value ?? 1));
  emitWalkSettings();
  eventBus.emit('environment:proxyCollisionMode', collisionMode?.value ?? 'bone');
  eventBus.emit('environment:proxyDeformSplat', Boolean(deformSplat?.checked));
}
