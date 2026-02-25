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
    eventBus.on('environment:requestProxyClipList', requestSpy);

    const disposers: Array<() => void> = [];
    bindProxyUi(eventBus, disposers, root as any);

    expect(requestSpy).toHaveBeenCalledTimes(1);

    const clip = ids.get('proxy-anim-clip') as FakeElement;
    expect(clip.disabled).toBe(true);
    expect(clip.children.length).toBe(1);

    eventBus.emit('environment:proxyClipList', ['Walk', 'Run']);
    expect(clip.disabled).toBe(false);
    expect(clip.children.length).toBe(2);
    expect(clip.children[0].textContent).toBe('Walk');
    expect(clip.children[1].textContent).toBe('Run');

    for (const dispose of disposers) dispose();
    (globalThis as any).document = oldDocument;
  });
});
