import * as THREE from 'three';

function toneMappingMode(mode) {
  if (mode === 'Neutral') return THREE.NeutralToneMapping;
  if (mode === 'None') return THREE.NoToneMapping;
  return THREE.ACESFilmicToneMapping;
}

function createProbeRig() {
  const root = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#3f3f46' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.85;
  const matte = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 20), new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9 }));
  matte.position.set(-0.85, -0.4, 0);
  const glossy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 20), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.12, metalness: 0.9 }));
  glossy.position.set(0.85, -0.4, 0.15);
  root.add(ground, matte, glossy);
  return root;
}

// NEW PROXY ANIMATION
export class GeneralLights {
  constructor() {
    this.unsubscribers = [];
  }

  async init(context) {
    this.context = context;
    this.lightRoot = new THREE.Group();
    this.lightRoot.name = 'light-root';
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.key = new THREE.DirectionalLight(0xffffff, 2.8);
    this.key.position.set(5, 8, 2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.lightRoot.add(this.ambient, this.key, this.key.target);
    context.scene.add(this.lightRoot);

    this.keyHelper = new THREE.DirectionalLightHelper(this.key, 0.75, 0xfef08a);
    this.gizmo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true }));
    this.gizmo.position.copy(this.key.position);
    context.scene.add(this.keyHelper, this.gizmo);

    this.probeRig = createProbeRig();
    context.scene.add(this.probeRig);

    const on = (event, handler) => this.unsubscribers.push(context.eventBus.on(event, handler));
    on('lights:showProbes', (enabled) => { this.probeRig.visible = enabled; });
    on('lights:showHelpers', (enabled) => { this.keyHelper.visible = enabled; });
    on('lights:showGizmos', (enabled) => { this.gizmo.visible = enabled; });
    on('lights:showMovementControls', () => {});
    on('lights:rendererSettings', (settings) => {
      const renderer = context.renderer;
      renderer.toneMapping = toneMappingMode(settings.toneMapping);
      renderer.toneMappingExposure = Math.max(0.05, Number(settings.toneMappingExposure || 1));
      renderer.shadowMap.enabled = Boolean(settings.shadowsEnabled);
      if ('useLegacyLights' in renderer) renderer.useLegacyLights = !settings.physicallyCorrectLights;
    });
  }

  update(delta) {
    if (this.context.camera) {
      this.probeRig.position.x = this.context.camera.position.x * 0.2;
      this.probeRig.position.z = this.context.camera.position.z * 0.2;
    }
    this.keyHelper.update();
    this.gizmo.position.copy(this.key.position);
    this.gizmo.scale.setScalar(1);
  }

  dispose() {
    for (const unbind of this.unsubscribers.splice(0)) unbind();
    this.context.scene.remove(this.lightRoot, this.probeRig, this.keyHelper, this.gizmo);
    this.keyHelper.dispose();
    this.gizmo.geometry.dispose();
    this.gizmo.material.dispose();
  }
}
