import { describe, expect, test } from 'vitest';
import { createEventBus } from '../src/utils/eventBus';
import { Outliner } from '../src/ui/outliner';

class FakeClassList {
  values = new Set<string>();
  add(value: string): void {
    this.values.add(value);
  }
}

class FakeElement {
  tagName: string;
  className = '';
  classList = new FakeClassList();
  textContent = '';
  open = false;
  type = '';
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  listeners = new Map<string, Set<(event?: any) => void>>();

  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
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

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  appendChild(node: FakeElement): void {
    this.children.push(node);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [...nodes];
  }
}

const collectTexts = (node: FakeElement, out: string[] = []) => {
  if (node.textContent) out.push(node.textContent);
  for (const child of node.children) collectTexts(child, out);
  return out;
};

const findButtonByText = (node: FakeElement, text: string): FakeElement | null => {
  if (node.tagName === 'BUTTON') {
    const values = collectTexts(node, []);
    if (values.includes(text)) return node;
  }
  for (const child of node.children) {
    const result = findButtonByText(child, text);
    if (result) return result;
  }
  return null;
};

describe('Outliner', () => {
  test('renders /Player when camera is injected before render', () => {
    const oldDocument = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => new FakeElement(tag)
    };

    const eventBus = createEventBus();
    const container = new FakeElement('div');
    const outliner = new Outliner({ container: container as any, eventBus });

    outliner.scene = { isScene: true, children: [] } as any;
    outliner.camera = { isCamera: true, uuid: 'camera-1' } as any;
    outliner.render();

    const texts = collectTexts(container);
    expect(texts).toContain('/Player');
    expect(texts).toContain('Player');

    outliner.dispose();
    (globalThis as any).document = oldDocument;
  });

  test('emits world selection payload when /World is clicked', () => {
    const oldDocument = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => new FakeElement(tag)
    };

    const eventBus = createEventBus();
    const container = new FakeElement('div');
    const outliner = new Outliner({ container: container as any, eventBus });
    outliner.scene = { isScene: true, children: [] } as any;
    outliner.camera = { isCamera: true, uuid: 'camera-1' } as any;
    outliner.render();

    let selectionPayload: any = null;
    const disposeSelection = eventBus.on('selectionChanged', (payload) => {
      selectionPayload = payload;
    });

    const worldButton = findButtonByText(container, '/World');
    expect(worldButton).not.toBeNull();
    for (const handler of worldButton?.listeners.get('click') ?? []) {
      handler();
    }

    expect(selectionPayload).toEqual({
      target: 'world',
      label: 'World / Level Settings',
      uuids: [],
      object: null
    });

    disposeSelection();
    outliner.dispose();
    (globalThis as any).document = oldDocument;
  });
});
