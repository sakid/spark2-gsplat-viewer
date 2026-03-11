import { describe, expect, test, vi } from 'vitest';
import { createEventBus } from '../src/utils/eventBus';
import { bindProxyUi } from '../src/js/internal/proxyUiBindings';

class FakeElement {
  tagName: string;
  value = '';
  checked = false;
  disabled = false;
  textContent = '';
  children: FakeElement[] = [];
  listeners = new Map<string, Set<(event?: any) => void>>();

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  set innerHTML(_value: string) {
    this.children = [];
  }

  get innerHTML(): string {
    return '';
  }

  addEventListener(type: string, handler: (event?: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(handler);
  }

  removeEventListener(type: string, handler: (event?: any) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ type, target: this });
    }
  }
}

describe('proxyUiBindings', () => {
  test('requests proxy clip list and repopulates clip options', () => {
    const oldDocument = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => new FakeElement(tag)
    };

    const ids = new Map<string, FakeElement>([
      ['proxy-anim-clip', new FakeElement('select')],
      ['proxy-anim-play', new FakeElement('input')],
      ['proxy-anim-speed', new FakeElement('input')],
      ['proxy-anim-restart', new FakeElement('button')],
      ['proxy-anim-phase', new FakeElement('input')],
      ['proxy-anim-cycle-duration', new FakeElement('input')],
      ['proxy-anim-stride', new FakeElement('input')],
      ['proxy-anim-sway', new FakeElement('input')],
      ['proxy-anim-yaw', new FakeElement('input')],
      ['proxy-anim-torso', new FakeElement('input')],
      ['proxy-anim-head', new FakeElement('input')],
      ['proxy-anim-bounce', new FakeElement('input')],
      ['proxy-anim-gait-sharpness', new FakeElement('input')],
      ['proxy-anim-mirror', new FakeElement('input')],
      ['proxy-anim-reset-walk', new FakeElement('button')],
      ['proxy-collision-mode', new FakeElement('select')],
      ['proxy-deform-splat', new FakeElement('input')]
    ]);

    const root = {
      querySelector: (selector: string) => {
        if (!selector.startsWith('#')) return null;
        return ids.get(selector.slice(1)) ?? null;
      }
    };

    const eventBus = createEventBus();
    const requestSpy = vi.fn();
    const requestKindSpy = vi.fn();
    const requestAnimStateSpy = vi.fn();
    const walkSettingsSpy = vi.fn();
    const scrubSpy = vi.fn();
    const resetWalkSpy = vi.fn();
    eventBus.on('environment:requestProxyClipList', requestSpy);
    eventBus.on('environment:requestProxyKind', requestKindSpy);
    eventBus.on('environment:requestProxyAnimState', requestAnimStateSpy);
    eventBus.on('environment:proxyWalkSettings', walkSettingsSpy);
    eventBus.on('environment:proxyAnimPhase', scrubSpy);
    eventBus.on('environment:proxyWalkReset', resetWalkSpy);

    const disposers: Array<() => void> = [];
    bindProxyUi(eventBus, disposers, root as any);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestKindSpy).toHaveBeenCalledTimes(1);
    expect(requestAnimStateSpy).toHaveBeenCalledTimes(1);
    expect(walkSettingsSpy).toHaveBeenCalledTimes(1);

    const clip = ids.get('proxy-anim-clip') as FakeElement;
    const phase = ids.get('proxy-anim-phase') as FakeElement;
    const cycleDuration = ids.get('proxy-anim-cycle-duration') as FakeElement;
    const mirror = ids.get('proxy-anim-mirror') as FakeElement;
    const resetWalk = ids.get('proxy-anim-reset-walk') as FakeElement;
    expect(clip.disabled).toBe(true);
    expect(clip.children.length).toBe(1);
    expect(phase.disabled).toBe(true);

    eventBus.emit('environment:proxyKind', 'external');
    eventBus.emit('environment:proxyClipList', ['Walk', 'Run']);
    expect(clip.disabled).toBe(false);
    expect(clip.children.length).toBe(2);
    expect(clip.children[0].textContent).toBe('Walk');
    expect(clip.children[1].textContent).toBe('Run');
    expect(phase.disabled).toBe(true);

    eventBus.emit('environment:proxyKind', 'voxel');
    expect(phase.disabled).toBe(false);

    phase.value = '0.34';
    phase.dispatch('input');
    expect(scrubSpy).toHaveBeenLastCalledWith(0.34);
    phase.dispatch('change');

    cycleDuration.value = '1.6';
    mirror.checked = true;
    cycleDuration.dispatch('change');
    expect(walkSettingsSpy).toHaveBeenCalled();
    expect(walkSettingsSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      cycleDuration: 1.6,
      mirror: true
    }));

    resetWalk.dispatch('click');
    expect(resetWalkSpy).toHaveBeenCalledTimes(1);

    eventBus.emit('environment:proxyAnimState', {
      clipIndex: 1,
      playing: false,
      speed: 1.75,
      phase: 0.62,
      walkSettings: {
        cycleDuration: 1.3,
        strideDegrees: 31,
        swayDegrees: 12,
        yawDegrees: 7,
        torsoTwistDegrees: 10,
        headNodDegrees: 6,
        bounceAmount: 0.18,
        gaitSharpness: 0.64,
        phaseOffset: 0,
        mirror: false
      }
    });
    expect(clip.value).toBe('1');
    expect(phase.value).toBe('0.62');
    expect((ids.get('proxy-anim-play') as FakeElement).checked).toBe(false);
    expect((ids.get('proxy-anim-speed') as FakeElement).value).toBe('1.75');
    expect(cycleDuration.value).toBe('1.3');
    expect((ids.get('proxy-anim-stride') as FakeElement).value).toBe('31');

    for (const dispose of disposers) dispose();
    (globalThis as any).document = oldDocument;
  });
});
