import { describe, expect, test, vi } from 'vitest';
import { createEventBus } from '../src/utils/eventBus';
import { bindUi } from '../src/js/internal/uiBindings';

class FakeElement {
  value = '';
  checked = false;
  disabled = false;
  textContent = '';
  files: Array<{ name: string }> = [];
  listeners = new Map<string, Set<(event?: { type: string; target: FakeElement }) => void>>();

  addEventListener(type: string, handler: (event?: { type: string; target: FakeElement }) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(handler);
  }

  removeEventListener(type: string, handler: (event?: { type: string; target: FakeElement }) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ type, target: this });
    }
  }
}

function rootWith(ids: Map<string, FakeElement>) {
  return {
    querySelector: (selector: string) => {
      if (!selector.startsWith('#')) return null;
      return ids.get(selector.slice(1)) ?? null;
    },
    querySelectorAll: () => []
  };
}

describe('uiBindings workflow controls', () => {
  test('runs full voxel workflow from selected splat and updates applicability', () => {
    const ids = new Map<string, FakeElement>([
      ['file-input', new FakeElement()],
      ['splat-loaded-name', new FakeElement()],
      ['load-btn', new FakeElement()],
      ['clear-btn', new FakeElement()],
      ['run-voxel-workflow-btn', new FakeElement()],
      ['workflow-summary', new FakeElement()],
      ['proxy-file-input', new FakeElement()],
      ['realign-proxy-btn', new FakeElement()],
      ['proxy-flip-updown', new FakeElement()],
      ['proxy-mirror-x', new FakeElement()],
      ['proxy-mirror-z', new FakeElement()],
      ['proxy-align-profile', new FakeElement()],
      ['generate-voxel-btn', new FakeElement()],
      ['regenerate-voxel-rig-btn', new FakeElement()],
      ['export-voxel-glb-btn', new FakeElement()],
      ['voxel-edit-mode', new FakeElement()],
      ['view-mode', new FakeElement()],
      ['show-proxy-mesh', new FakeElement()],
      ['show-proxy-bones', new FakeElement()],
      ['show-light-helpers', new FakeElement()],
      ['show-light-gizmos', new FakeElement()],
      ['show-lighting-probes', new FakeElement()],
      ['collision-enabled', new FakeElement()]
    ]);

    const splatLoadedName = ids.get('splat-loaded-name') as FakeElement;
    splatLoadedName.textContent = 'Loaded: none';

    const viewMode = ids.get('view-mode') as FakeElement;
    viewMode.value = 'full';

    const runButton = ids.get('run-voxel-workflow-btn') as FakeElement;
    const generateVoxel = ids.get('generate-voxel-btn') as FakeElement;
    const regenerateRig = ids.get('regenerate-voxel-rig-btn') as FakeElement;
    const exportVoxel = ids.get('export-voxel-glb-btn') as FakeElement;
    const collisionEnabled = ids.get('collision-enabled') as FakeElement;
    const workflowSummary = ids.get('workflow-summary') as FakeElement;
    const fileInput = ids.get('file-input') as FakeElement;

    const eventBus = createEventBus();
    const runWorkflowSpy = vi.fn();
    const regenerateRigSpy = vi.fn();
    eventBus.on('environment:runVoxelWorkflow', runWorkflowSpy);
    eventBus.on('environment:regenerateVoxelRig', regenerateRigSpy);

    const dispose = bindUi(eventBus, rootWith(ids) as any);
    expect(runButton.disabled).toBe(true);
    expect(generateVoxel.disabled).toBe(true);
    expect(regenerateRig.disabled).toBe(true);
    expect(exportVoxel.disabled).toBe(true);
    expect(collisionEnabled.disabled).toBe(true);
    expect(workflowSummary.textContent).toContain('choose a splat file');

    const testFile = { name: 'custom-test.spz' };
    fileInput.files = [testFile];
    fileInput.dispatch('change');
    expect(runButton.disabled).toBe(false);
    expect(workflowSummary.textContent).toContain('file selected');

    runButton.dispatch('click');
    expect(runWorkflowSpy).toHaveBeenCalledTimes(1);
    expect(runWorkflowSpy.mock.calls[0][0]).toEqual({ file: testFile });

    eventBus.emit('environment:splatLoaded', { name: 'mesh' });
    expect(generateVoxel.disabled).toBe(false);
    expect(workflowSummary.textContent).toContain('Step 1 complete');

    eventBus.emit('environment:proxyKind', 'voxel');
    expect(regenerateRig.disabled).toBe(false);
    expect(exportVoxel.disabled).toBe(false);
    expect(collisionEnabled.disabled).toBe(false);
    expect(workflowSummary.textContent).toContain('complete');
    regenerateRig.dispatch('click');
    expect(regenerateRigSpy).toHaveBeenCalledTimes(1);

    dispose();
  });

  test('emits sheep realign/crop events and syncs state from environment', () => {
    const ids = new Map<string, FakeElement>([
      ['file-input', new FakeElement()],
      ['splat-loaded-name', new FakeElement()],
      ['load-btn', new FakeElement()],
      ['clear-btn', new FakeElement()],
      ['run-voxel-workflow-btn', new FakeElement()],
      ['workflow-summary', new FakeElement()],
      ['proxy-file-input', new FakeElement()],
      ['realign-proxy-btn', new FakeElement()],
      ['proxy-flip-updown', new FakeElement()],
      ['proxy-mirror-x', new FakeElement()],
      ['proxy-mirror-z', new FakeElement()],
      ['proxy-align-profile', new FakeElement()],
      ['generate-voxel-btn', new FakeElement()],
      ['regenerate-voxel-rig-btn', new FakeElement()],
      ['export-voxel-glb-btn', new FakeElement()],
      ['voxel-edit-mode', new FakeElement()],
      ['view-mode', new FakeElement()],
      ['show-proxy-mesh', new FakeElement()],
      ['show-proxy-bones', new FakeElement()],
      ['show-light-helpers', new FakeElement()],
      ['show-light-gizmos', new FakeElement()],
      ['show-lighting-probes', new FakeElement()],
      ['collision-enabled', new FakeElement()],
      ['sheep-align-x', new FakeElement()],
      ['sheep-align-y', new FakeElement()],
      ['sheep-align-z', new FakeElement()],
      ['sheep-align-pitch', new FakeElement()],
      ['sheep-align-yaw', new FakeElement()],
      ['sheep-align-roll', new FakeElement()],
      ['sheep-align-scale', new FakeElement()],
      ['sheep-gizmo-enabled', new FakeElement()],
      ['sheep-gizmo-target', new FakeElement()],
      ['sheep-gizmo-mode', new FakeElement()],
      ['sheep-align-apply-btn', new FakeElement()],
      ['sheep-align-autocenter-btn', new FakeElement()],
      ['sheep-align-reset-btn', new FakeElement()],
      ['sheep-crop-enabled', new FakeElement()],
      ['sheep-crop-show-box', new FakeElement()],
      ['sheep-crop-center-x', new FakeElement()],
      ['sheep-crop-center-y', new FakeElement()],
      ['sheep-crop-center-z', new FakeElement()],
      ['sheep-crop-size-x', new FakeElement()],
      ['sheep-crop-size-y', new FakeElement()],
      ['sheep-crop-size-z', new FakeElement()],
      ['sheep-crop-apply-btn', new FakeElement()],
      ['sheep-crop-fit-btn', new FakeElement()],
      ['sheep-crop-reset-btn', new FakeElement()]
    ]);

    (ids.get('splat-loaded-name') as FakeElement).textContent = 'Loaded: none';
    (ids.get('view-mode') as FakeElement).value = 'full';

    const eventBus = createEventBus();
    const alignSpy = vi.fn();
    const cropBoxSpy = vi.fn();
    const cropEnabledSpy = vi.fn();
    const gizmoEnabledSpy = vi.fn();
    const gizmoModeSpy = vi.fn();
    const gizmoTargetSpy = vi.fn();
    const autoCenterSpy = vi.fn();
    const cropFitSpy = vi.fn();
    const cropResetSpy = vi.fn();

    eventBus.on('environment:sheepAlign', alignSpy);
    eventBus.on('environment:sheepCropBox', cropBoxSpy);
    eventBus.on('environment:sheepCropEnabled', cropEnabledSpy);
    eventBus.on('environment:sheepGizmoEnabled', gizmoEnabledSpy);
    eventBus.on('environment:sheepGizmoMode', gizmoModeSpy);
    eventBus.on('environment:sheepGizmoTarget', gizmoTargetSpy);
    eventBus.on('environment:sheepAlignAutoCenter', autoCenterSpy);
    eventBus.on('environment:sheepCropAutoFit', cropFitSpy);
    eventBus.on('environment:sheepCropReset', cropResetSpy);

    const dispose = bindUi(eventBus, rootWith(ids) as any);

    eventBus.emit('environment:splatLoaded', { name: 'mesh' });

    const gizmoEnabled = ids.get('sheep-gizmo-enabled') as FakeElement;
    const gizmoTarget = ids.get('sheep-gizmo-target') as FakeElement;
    const gizmoMode = ids.get('sheep-gizmo-mode') as FakeElement;
    gizmoTarget.value = 'crop';
    gizmoTarget.dispatch('change');
    gizmoMode.value = 'rotate';
    gizmoMode.dispatch('change');
    gizmoEnabled.checked = true;
    gizmoEnabled.dispatch('change');
    expect(gizmoTargetSpy).toHaveBeenCalledWith('crop');
    expect(gizmoModeSpy).toHaveBeenCalledWith('rotate');
    expect(gizmoEnabledSpy).toHaveBeenCalledWith(true);

    const alignX = ids.get('sheep-align-x') as FakeElement;
    const alignY = ids.get('sheep-align-y') as FakeElement;
    const alignZ = ids.get('sheep-align-z') as FakeElement;
    const alignYaw = ids.get('sheep-align-yaw') as FakeElement;
    const alignScale = ids.get('sheep-align-scale') as FakeElement;
    const applyAlign = ids.get('sheep-align-apply-btn') as FakeElement;
    alignX.value = '1.5';
    alignY.value = '0.25';
    alignZ.value = '-2';
    alignYaw.value = '90';
    alignScale.value = '1.2';
    applyAlign.dispatch('click');

    expect(alignSpy).toHaveBeenCalled();
    const lastAlignPayload = alignSpy.mock.calls[alignSpy.mock.calls.length - 1]?.[0];
    expect(lastAlignPayload).toMatchObject({
      x: 1.5,
      y: 0.25,
      z: -2,
      yaw: 90,
      scale: 1.2
    });

    const cropCenterX = ids.get('sheep-crop-center-x') as FakeElement;
    const cropCenterY = ids.get('sheep-crop-center-y') as FakeElement;
    const cropCenterZ = ids.get('sheep-crop-center-z') as FakeElement;
    const cropSizeX = ids.get('sheep-crop-size-x') as FakeElement;
    const cropSizeY = ids.get('sheep-crop-size-y') as FakeElement;
    const cropSizeZ = ids.get('sheep-crop-size-z') as FakeElement;
    const applyCrop = ids.get('sheep-crop-apply-btn') as FakeElement;
    cropCenterX.value = '0.4';
    cropCenterY.value = '0.5';
    cropCenterZ.value = '-0.6';
    cropSizeX.value = '1.1';
    cropSizeY.value = '1.2';
    cropSizeZ.value = '1.3';
    applyCrop.dispatch('click');

    expect(cropBoxSpy).toHaveBeenCalled();
    const lastCropPayload = cropBoxSpy.mock.calls[cropBoxSpy.mock.calls.length - 1]?.[0];
    expect(lastCropPayload).toEqual({
      center: { x: 0.4, y: 0.5, z: -0.6 },
      size: { x: 1.1, y: 1.2, z: 1.3 }
    });

    const cropEnabled = ids.get('sheep-crop-enabled') as FakeElement;
    cropEnabled.checked = true;
    cropEnabled.dispatch('change');
    expect(cropEnabledSpy).toHaveBeenCalledWith(true);

    (ids.get('sheep-align-autocenter-btn') as FakeElement).dispatch('click');
    (ids.get('sheep-crop-fit-btn') as FakeElement).dispatch('click');
    (ids.get('sheep-crop-reset-btn') as FakeElement).dispatch('click');
    expect(autoCenterSpy).toHaveBeenCalledTimes(1);
    expect(cropFitSpy).toHaveBeenCalledTimes(1);
    expect(cropResetSpy).toHaveBeenCalledTimes(1);

    eventBus.emit('environment:sheepAlignState', {
      x: 3,
      y: 4,
      z: 5,
      pitch: 6,
      yaw: 7,
      roll: 8,
      scale: 0.9
    });
    expect(alignX.value).toBe('3');
    expect(alignY.value).toBe('4');
    expect(alignZ.value).toBe('5');
    expect((ids.get('sheep-align-pitch') as FakeElement).value).toBe('6');
    expect(alignYaw.value).toBe('7');
    expect((ids.get('sheep-align-roll') as FakeElement).value).toBe('8');
    expect(alignScale.value).toBe('0.9');

    eventBus.emit('environment:sheepCropState', {
      enabled: false,
      helperVisible: true,
      center: { x: 9, y: 8, z: 7 },
      size: { x: 6, y: 5, z: 4 }
    });
    expect(cropEnabled.checked).toBe(false);
    expect((ids.get('sheep-crop-show-box') as FakeElement).checked).toBe(true);
    expect(cropCenterX.value).toBe('9');
    expect(cropCenterY.value).toBe('8');
    expect(cropCenterZ.value).toBe('7');
    expect(cropSizeX.value).toBe('6');
    expect(cropSizeY.value).toBe('5');
    expect(cropSizeZ.value).toBe('4');

    dispose();
  });
});
