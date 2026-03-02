import * as THREE from 'three';

export type RenderBackend = 'webgpu' | 'webgl';

export interface RenderBackendCapabilities {
  backend: RenderBackend;
  maxTextureSize: number;
  maxComputeWorkgroupSize: number;
  supportsComputeShaders: boolean;
  supportsStorageBuffers: boolean;
  supportsRaytracing: boolean;
}

export interface RenderBackendAdapter {
  readonly capabilities: RenderBackendCapabilities;
  readonly renderer: THREE.WebGLRenderer | unknown;
  readonly device?: unknown;
  
  initialize(): Promise<void>;
  dispose(): void;
  submit(commandBuffer?: unknown): void;
  waitForCompletion(): Promise<void>;
}

export interface RendererConfig {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  powerPreference?: 'high-performance' | 'low-power';
  preferWebGPU?: boolean;
}

export async function detectWebGPUSupport(): Promise<{ supported: boolean; adapter: unknown }> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { supported: false, adapter: null };
  }
  
  const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) {
    return { supported: false, adapter: null };
  }
  
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, adapter: null };
    }
    return { supported: true, adapter };
  } catch {
    return { supported: false, adapter: null };
  }
}

export class UnifiedRenderer {
  private backend: RenderBackendAdapter | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement;
  private config: RendererConfig;
  private capabilities: RenderBackendCapabilities | null = null;
  
  constructor(config: RendererConfig) {
    this.canvas = config.canvas;
    this.config = config;
  }
  
  async initialize(): Promise<RenderBackendCapabilities> {
    if (this.config.preferWebGPU !== false) {
      const { supported, adapter } = await detectWebGPUSupport();
      
      if (supported && adapter) {
        try {
          const device = await (adapter as { requestDevice: () => Promise<unknown> }).requestDevice();
          const context = this.canvas.getContext('webgpu');
          
          if (context && device) {
            const gpu = (navigator as { gpu?: { getPreferredCanvasFormat: () => string } }).gpu;
            const format = gpu?.getPreferredCanvasFormat() ?? 'bgra8unorm';
            
            (context as { configure: (config: unknown) => void }).configure({
              device,
              format,
              alphaMode: 'premultiplied'
            });
            
            this.backend = this.createWebGPUBackend(device as Device, context, format);
            console.log('[Renderer] Using WebGPU backend');
            this.capabilities = this.backend.capabilities;
            return this.capabilities;
          }
        } catch (e) {
          console.warn('[Renderer] WebGPU initialization failed, falling back to WebGL:', e);
        }
      }
    }
    
    console.log('[Renderer] Using WebGL2 backend');
    return this.initializeWebGL();
  }
  
  private initializeWebGL(): RenderBackendCapabilities {
    this.threeRenderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.config.antialias ?? false,
      powerPreference: this.config.powerPreference ?? 'high-performance'
    });
    
    this.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.threeRenderer.shadowMap.enabled = true;
    this.threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.threeRenderer.toneMappingExposure = 1.0;
    
    this.capabilities = {
      backend: 'webgl',
      maxTextureSize: this.threeRenderer.capabilities.maxTextureSize,
      maxComputeWorkgroupSize: 0,
      supportsComputeShaders: false,
      supportsStorageBuffers: false,
      supportsRaytracing: false
    };
    
    return this.capabilities;
  }
  
  private createWebGPUBackend(
    device: Device,
    context: GPUCanvasContext,
    format: GPUTextureFormat
  ): RenderBackendAdapter {
    const limits = device.limits;
    
    return {
      capabilities: {
        backend: 'webgpu',
        maxTextureSize: limits.maxTextureDimension2D,
        maxComputeWorkgroupSize: limits.maxComputeWorkgroupSizeX,
        supportsComputeShaders: true,
        supportsStorageBuffers: true,
        supportsRaytracing: limits.maxRayPipelineStorageBuffers > 0
      },
      renderer: context,
      device,
      
      async initialize() {},
      
      dispose() {
        device.destroy();
      },
      
      submit(commandBuffer?: GPUCommandBuffer) {
        if (commandBuffer) {
          device.queue.submit([commandBuffer]);
        }
      },
      
      async waitForCompletion() {
        await device.queue.onSubmittedWorkDone();
      }
    };
  }
  
  getThreeRenderer(): THREE.WebGLRenderer | null {
    return this.threeRenderer;
  }
  
  getBackend(): RenderBackendAdapter | null {
    return this.backend;
  }
  
  getCapabilities(): RenderBackendCapabilities | null {
    return this.capabilities;
  }
  
  isWebGPU(): boolean {
    return this.backend?.capabilities.backend === 'webgpu';
  }
  
  isWebGL(): boolean {
    return !this.isWebGPU();
  }
  
  resize(width: number, height: number): void {
    if (this.threeRenderer) {
      this.threeRenderer.setSize(width, height);
    }
    if (this.backend?.capabilities.backend === 'webgpu') {
      const context = this.backend.renderer as GPUCanvasContext;
      const format = (navigator as { gpu?: { getPreferredCanvasFormat: () => string } }).gpu?.getPreferredCanvasFormat() ?? 'bgra8unorm';
      context.configure({
        device: this.backend.device,
        format,
        alphaMode: 'premultiplied'
      });
    }
  }
  
  dispose(): void {
    this.backend?.dispose();
    this.threeRenderer?.dispose();
  }
}

export function createRenderer(config: RendererConfig): UnifiedRenderer {
  return new UnifiedRenderer(config);
}
