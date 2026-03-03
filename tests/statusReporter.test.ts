import { afterEach, describe, expect, test } from 'vitest';
import { createStatusReporter } from '../src/js/internal/status';

interface FakeStatusElement {
  textContent: string;
  className: string;
  dataset: { kind?: string };
  isConnected: boolean;
}

function createFakeStatusElement(): FakeStatusElement {
  return {
    textContent: '',
    className: '',
    dataset: {},
    isConnected: true
  };
}

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument) {
    globalThis.document = originalDocument;
    return;
  }
  Reflect.deleteProperty(globalThis, 'document');
});

describe('status reporter', () => {
  test('writes status to provided element', () => {
    const status = createFakeStatusElement();
    const reporter = createStatusReporter(status);
    reporter.setStatus('Engine ready.', 'success');

    expect(status.textContent).toBe('Engine ready.');
    expect(status.className).toBe('success');
    expect(status.dataset.kind).toBe('success');
  });

  test('resyncs latest status into remounted controls root', () => {
    const initial = createFakeStatusElement();
    const reporter = createStatusReporter(initial);
    reporter.setStatus('Proxy deformation active (transform).', 'success');

    initial.isConnected = false;
    const remounted = createFakeStatusElement();
    const root = {
      querySelector: (selector: string): FakeStatusElement | null => (selector === '#status' ? remounted : null)
    };

    reporter.resync(root);

    expect(remounted.textContent).toBe('Proxy deformation active (transform).');
    expect(remounted.className).toBe('success');
    expect(remounted.dataset.kind).toBe('success');
  });
});
