export function createDefaultLayout(dockviewApi) {
  dockviewApi.clear();
  const viewport = dockviewApi.addPanel({ id: 'viewport', component: 'viewport', title: 'Viewport' });
  const hierarchy = dockviewApi.addPanel({
    id: 'hierarchy',
    component: 'hierarchy',
    title: 'Hierarchy',
    position: { direction: 'left', referencePanel: viewport }
  });
  const inspector = dockviewApi.addPanel({
    id: 'inspector',
    component: 'inspector',
    title: 'Inspector',
    position: { direction: 'right', referencePanel: viewport }
  });
  const controls = dockviewApi.addPanel({
    id: 'controls',
    component: 'controls',
    title: 'Controls',
    position: { direction: 'below', referencePanel: inspector }
  });
  dockviewApi.addPanel({
    id: 'dialog',
    component: 'dialog',
    title: 'Dialog',
    position: { direction: 'below', referencePanel: controls }
  });
  dockviewApi.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { direction: 'below', referencePanel: hierarchy }
  });
}

