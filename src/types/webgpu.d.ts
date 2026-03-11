export {};

declare global {
  interface Navigator {
    gpu?: GPU;
  }
  
  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
  }
  
  interface GPURequestAdapterOptions {
    powerPreference?: GPUPowerPreference;
    forceFallbackAdapter?: boolean;
  }
  
  type GPUPowerPreference = 'low-power' | 'high-performance';
  type GPUTextureFormat = 'rgba8unorm' | 'bgra8unorm' | 'rgba16float' | 'rgba32float';
  
  interface GPUAdapter {
    readonly name: string;
    readonly features: GPUSupportedFeatures;
    readonly limits: GPUSupportedLimits;
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  }
  
  interface GPUDeviceDescriptor {
    requiredFeatures?: GPUFeatureName[];
    requiredLimits?: GPURequiredLimits;
  }
  
  type GPUFeatureName = 
    | 'depth-clip-control'
    | 'pass-through'
    | 'timestamp-query'
    | 'indirect-first-instance'
    | 'shader-f16'
    | 'rg11b10ufloat-renderable'
    | 'bgra8unorm-storage'
    | 'float32-filterable';
  
  interface GPUSupportedFeatures {
    has(feature: GPUFeatureName): boolean;
  }
  
  interface GPUSupportedLimits {
    maxTextureDimension1D: number;
    maxTextureDimension2D: number;
    maxTextureDimension3D: number;
    maxTextureArrayLayers: number;
    maxBindGroups: number;
    maxBindGroupsPlusVertexBuffers: number;
    maxBuffersPerBindGroup: number;
    maxDynamicBuffersPerPipelineLayout: number;
    maxDynamicStorageBuffersPerPipelineLayout: number;
    maxSampledTexturesPerShaderStage: number;
    maxSamplersPerShaderStage: number;
    maxStorageBuffersPerShaderStage: number;
    maxStorageTexturesPerShaderStage: number;
    maxUniformBuffersPerShaderStage: number;
    maxUniformBufferBindingSize: number;
    maxStorageBufferBindingSize: number;
    maxVertexBuffers: number;
    maxVertexAttributes: number;
    maxVertexBufferArrayStride: number;
    minStorageBufferOffsetAlignment: number;
    minUniformBufferOffsetAlignment: number;
    maxComputeWorkgroupSizeX: number;
    maxComputeWorkgroupSizeY: number;
    maxComputeWorkgroupSizeZ: number;
    maxComputeWorkgroupsPerDimension: number;
    maxComputeStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize: number;
    maxComputeInvocationsPerWorkgroup: number;
    maxFragmentCombinedTexturesAndSamplers: number;
    maxMessageLength: number;
    maxComputeVariableWorkgroupStorageSize: number;
    maxNonStableComputeWorkgroupSize: number;
    maxStableComputeWorkgroupSize: number;
    maxStableWorkgroupSize: number;
    maxWorkgroupSize: number;
    maxRayPipelineStorageBuffers: number;
    maxRayCandidateDataSize: number;
    maxRayDispatchThreadgroups: number;
    maxRayRecursionDepth: number;
  }
  
  type GPURequiredLimits = Record<string, number>;
  
  interface GPUObjectBase {
    label?: string;
  }
  
  interface GPUDevice extends GPUObjectBase {
    readonly features: GPUSupportedFeatures;
    readonly limits: GPUSupportedLimits;
    readonly queue: GPUQueue;
    destroy(): void;
    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
    createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
    createSampler(descriptor: GPUSamplerDescriptor): GPUSampler;
    createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
    createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
    createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
    createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
    createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
    createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
    createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder;
    getCurrentTexture(): GPUTexture;
  }
  
  interface GPUBufferDescriptor extends GPUObjectBase {
    size: number;
    usage: GPUBufferUsageFlags;
    mappedAtCreation?: boolean;
  }
  
  type GPUBufferUsageFlags = number;
  
  const GPUBufferUsage: {
    readonly COPY_SRC: 0x01;
    readonly COPY_DST: 0x02;
    readonly MAP_READ: 0x04;
    readonly MAP_WRITE: 0x08;
    readonly INDEX: 0x10;
    readonly VERTEX: 0x20;
    readonly UNIFORM: 0x40;
    readonly STORAGE: 0x80;
    readonly INDIRECT: 0x100;
    readonly QUERY_RESOLVE: 0x200;
  };
  
  interface GPUTextureDescriptor extends GPUObjectBase {
    size: GPUExtent3D;
    mipLevelCount?: number;
    sampleCount?: number;
    dimension?: GPUTextureDimension;
    format: GPUTextureFormat;
    usage: GPUTextureUsageFlags;
    viewFormats?: GPUTextureFormat[];
  }
  
  type GPUTextureDimension = '1d' | '2d' | '3d';
  type GPUTextureUsageFlags = number;
  
  const GPUTextureUsage: {
    readonly COPY_SRC: 0x01;
    readonly COPY_DST: 0x02;
    readonly RENDER_ATTACHMENT: 0x10;
    readonly STORAGE_BINDING: 0x20;
    readonly TEXTURE_BINDING: 0x40;
  };
  
  interface GPUExtent3D {
    width: number;
    height?: number;
    depthOrArrayLayers?: number;
  }
  
  interface GPUBuffer {
    mapAsync(mode: GPUMapModeFlags, offset?: number, size?: number): Promise<void>;
    getMappedRange(offset?: number, size?: number): ArrayBuffer;
    unmap(): void;
    destroy(): void;
  }
  
  type GPUMapModeFlags = number;
  
  const GPUMapMode: {
    readonly READ: 0x01;
    readonly WRITE: 0x02;
  };
  
  interface GPUTexture {
    createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
    destroy(): void;
  }
  
  interface GPUTextureViewDescriptor extends GPUObjectBase {
    format?: GPUTextureFormat;
    dimension?: GPUTextureViewDimension;
    aspect?: GPUTextureAspect;
    baseMipLevel?: number;
    mipLevelCount?: number;
    baseArrayLayer?: number;
    arrayLayerCount?: number;
  }
  
  type GPUTextureViewDimension = '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
  type GPUTextureAspect = 'all' | 'stencil-only' | 'depth-only';
  
  interface GPUSamplerDescriptor extends GPUObjectBase {
    addressModeU?: GPUAddressMode;
    addressModeV?: GPUAddressMode;
    addressModeW?: GPUAddressMode;
    magFilter?: GPUFilterMode;
    minFilter?: GPUFilterMode;
    mipmapFilter?: GPUFilterMode;
    lodMinClamp?: number;
    lodMaxClamp?: number;
    compare?: GPUCompareFunction;
    maxAnisotropy?: number;
  }
  
  type GPUAddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  type GPUFilterMode = 'nearest' | 'linear';
  type GPUCompareFunction = 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'greater-equal' | 'always';
  
  interface GPUBindGroupLayoutDescriptor extends GPUObjectBase {
    entries: GPUBindGroupLayoutEntry[];
  }
  
  interface GPUBindGroupLayoutEntry {
    binding?: number;
    visibility?: GPUShaderStageFlags;
    buffer?: GPUBufferBindingLayout;
    texture?: GPUTextureBindingLayout;
    sampler?: GPUSamplerBindingLayout;
    storageTexture?: GPUStorageTextureBindingLayout;
  }
  
  type GPUShaderStageFlags = number;
  
  const GPUShaderStage: {
    readonly VERTEX: 0x1;
    readonly FRAGMENT: 0x2;
    readonly COMPUTE: 0x4;
  };
  
  interface GPUBufferBindingLayout {
    type?: GPUBufferBindingType;
    hasDynamicOffset?: boolean;
    minBindingSize?: number;
  }
  
  type GPUBufferBindingType = 'uniform' | 'storage' | 'read-only-storage';
  
  interface GPUTextureBindingLayout {
    sampleType?: GPUTextureSampleType;
    viewDimension?: GPUTextureViewDimension;
    multisampled?: boolean;
  }
  
  type GPUTextureSampleType = 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
  
  interface GPUSamplerBindingLayout {
    type?: GPUSamplerBindingType;
  }
  
  type GPUSamplerBindingType = 'filtering' | 'non-filtering' | 'comparison';
  
  interface GPUStorageTextureBindingLayout {
    access?: GPUStorageTextureAccess;
    format: GPUTextureFormat;
    viewDimension?: GPUTextureViewDimension;
  }
  
  type GPUStorageTextureAccess = 'write-only' | 'read-only' | 'read-write';
  
  interface GPUBindGroupDescriptor extends GPUObjectBase {
    layout: GPUBindGroupLayout;
    entries: GPUBindGroupEntry[];
  }
  
  interface GPUBindGroupLayout extends GPUObjectBase {}
  
  interface GPUBindGroupEntry {
    binding?: number;
    resource: GPUBindingResource;
  }
  
  type GPUBindingResource = GPUBufferBinding | GPUTextureView | GPUSampler;
  
  interface GPUBufferBinding {
    buffer: GPUBuffer;
    offset?: number;
    size?: number;
  }
  
  interface GPUPipelineLayoutDescriptor extends GPUObjectBase {
    bindGroupLayouts: GPUBindGroupLayout[];
  }
  
  interface GPUComputePipelineDescriptor extends GPUObjectBase {
    layout?: GPUPipelineLayout;
    compute: GPUProgrammableStage;
  }
  
  interface GPUProgrammableStage {
    module: GPUShaderModule;
    entryPoint: string;
    constants?: Record<string, number>;
  }
  
  interface GPUComputePipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
  }
  
  interface GPUPipelineLayout extends GPUObjectBase {}
  
  interface GPUShaderModule extends GPUObjectBase {}
  
  interface GPUCommandEncoderDescriptor extends GPUObjectBase {}
  
  interface GPUCommandEncoder {
    beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder;
    beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
    finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
  }
  
  interface GPUComputePassDescriptor extends GPUObjectBase {
    timestampWrites?: GPUComputePassTimestampWrites;
  }
  
  interface GPUComputePassTimestampWrites {
    querySet: GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }
  
  interface GPUQuerySet extends GPUObjectBase {}
  
  interface GPUComputePassEncoder {
    setPipeline(pipeline: GPUComputePipeline): void;
    dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
    end(): void;
  }
  
  interface GPURenderPassDescriptor extends GPUObjectBase {
    colorAttachments: GPURenderPassColorAttachment[];
    depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  }
  
  interface GPURenderPassColorAttachment {
    view: GPUTextureView;
    resolveTarget?: GPUTextureView;
    clearValue?: GPUColor;
    loadOp?: GPULoadOp;
    storeOp?: GPUStoreOp;
  }
  
  interface GPUColor {
    r: number;
    g: number;
    b: number;
    a: number;
  }
  
  type GPULoadOp = 'load' | 'clear';
  type GPUStoreOp = 'store' | 'discard';
  
  interface GPURenderPassDepthStencilAttachment {
    view: GPUTextureView;
    depthClearValue?: number;
    depthLoadOp?: GPULoadOp;
    depthStoreOp?: GPUStoreOp;
    depthReadOnly?: boolean;
    stencilClearValue?: number;
    stencilLoadOp?: GPULoadOp;
    stencilStoreOp?: GPUStoreOp;
    stencilReadOnly?: boolean;
  }
  
  interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup?: GPUBindGroup, dynamicOffsets?: number[]): void;
    setVertexBuffer(slot: number, buffer?: GPUBuffer, offset?: number, size?: number): void;
    setIndexBuffer(buffer: GPUBuffer, indexFormat?: GPUIndexFormat, offset?: number, size?: number): void;
    draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
    drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
    end(): void;
  }
  
  interface GPURenderPipeline extends GPUObjectBase {}
  
  interface GPUCommandBufferDescriptor extends GPUObjectBase {}
  
  interface GPUCommandBuffer extends GPUObjectBase {}
  
  interface GPUQueue {
    submit(commandBuffers: GPUCommandBuffer[]): void;
    onSubmittedWorkDone(): Promise<void>;
    writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource, dataOffset?: number, size?: number): void;
    writeTexture(destination: GPUImageCopyTexture, data: BufferSource, dataLayout: GPUImageDataLayout, size: GPUExtent3D): void;
  }
  
  interface GPUImageCopyTexture {
    texture: GPUTexture;
    mipLevel?: number;
    origin?: GPUOrigin3D;
    aspect?: GPUTextureAspect;
  }
  
  type GPUOrigin3D = { x?: number; y?: number; z?: number };
  
  interface GPUImageDataLayout {
    offset?: number;
    bytesPerRow?: number;
    rowsPerImage?: number;
  }
  
  type GPUIndexFormat = 'uint16' | 'uint32';
  
  interface GPUCanvasContext {
    configure(config: GPUCanvasConfiguration): void;
    getCurrentTexture(): GPUTexture;
  }
  
  interface GPUCanvasConfiguration {
    device: GPUDevice;
    format: GPUTextureFormat;
    alphaMode?: GPUAlphaMode;
    width?: number;
    height?: number;
    preferredFormat?: GPUTextureFormat;
  }
  
  type GPUAlphaMode = 'opaque' | 'premultiplied';
  
  interface GPURenderBundleEncoderDescriptor extends GPUObjectBase {
    colorFormats: GPUTextureFormat[];
    depthStencilFormat?: GPUTextureFormat;
    sampleCount?: number;
  }
  
  interface GPURenderBundleEncoder {
    finish(descriptor?: GPURenderBundleDescriptor): GPURenderBundle;
  }
  
  interface GPURenderBundleDescriptor extends GPUObjectBase {}
  
  interface GPURenderBundle extends GPUObjectBase {}
  
  interface GPUSampler extends GPUObjectBase {}
  
  interface GPUTextureView extends GPUObjectBase {}
  
  interface GPURenderPipelineDescriptor extends GPUObjectBase {
    layout?: GPUPipelineLayout;
    vertex: GPUVertexState;
    fragment: GPUFragmentState;
    primitive?: GPUPrimitiveState;
    depthStencil?: GPUDepthStencilState;
    multisample?: GPUMultisampleState;
  }
  
  interface GPUVertexState {
    module: GPUShaderModule;
    entryPoint: string;
    constants?: Record<string, number>;
    buffers?: GPUVertexBufferLayout[];
  }
  
  interface GPUVertexBufferLayout {
    arrayStride?: number;
    stepMode?: GPUVertexStepMode;
    attributes?: GPUVertexAttribute[];
  }
  
  type GPUVertexStepMode = 'vertex' | 'instance';
  
  interface GPUVertexAttribute {
    format: GPUVertexFormat;
    offset: number;
    shaderLocation: number;
  }
  
  type GPUVertexFormat = 
    | 'uint8x2' | 'uint8x4'
    | 'sint8x2' | 'sint8x4'
    | 'unorm8x2' | 'unorm8x4'
    | 'snorm8x2' | 'snorm8x4'
    | 'uint16x2' | 'uint16x4'
    | 'sint16x2' | 'sint16x4'
    | 'unorm16x2' | 'unorm16x4'
    | 'snorm16x2' | 'snorm16x4'
    | 'float16x2' | 'float16x4'
    | 'float32' | 'float32x2' | 'float32x3' | 'float32x4'
    | 'uint32' | 'uint32x2' | 'uint32x3' | 'uint32x4'
    | 'sint32' | 'sint32x2' | 'sint32x3' | 'sint32x4';
  
  interface GPUFragmentState {
    module: GPUShaderModule;
    entryPoint: string;
    constants?: Record<string, number>;
    targets: GPUColorTargetState[];
  }
  
  interface GPUColorTargetState {
    format: GPUTextureFormat;
    blend?: GPUBlendState;
    writeMask?: GPUColorWriteFlags;
  }
  
  interface GPUBlendState {
    color: GPUBlendComponent;
    alpha: GPUBlendComponent;
  }
  
  interface GPUBlendComponent {
    operation?: GPUBlendOperation;
    srcFactor?: GPUBlendFactor;
    dstFactor?: GPUBlendFactor;
  }
  
  type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';
  type GPUBlendFactor = 'zero' | 'one' | 'src' | 'one-minus-src' | 'src-alpha' | 'one-minus-src-alpha' | 'dst' | 'one-minus-dst' | 'dst-alpha' | 'one-minus-dst-alpha' | 'src-alpha-saturated' | 'constant' | 'one-minus-constant';
  type GPUColorWriteFlags = number;
  
  const GPUColorWrite: {
    readonly RED: 0x1;
    readonly GREEN: 0x2;
    readonly BLUE: 0x4;
    readonly ALPHA: 0x8;
    readonly ALL: 0xF;
  };
  
  interface GPUPrimitiveState {
    topology?: GPUPrimitiveTopology;
    stripIndexFormat?: GPUIndexFormat;
    frontFace?: GPUFrontFace;
    cullMode?: GPUCullMode;
  }
  
  type GPUPrimitiveTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
  type GPUFrontFace = 'ccw' | 'cw';
  type GPUCullMode = 'none' | 'front' | 'back';
  
  interface GPUDepthStencilState {
    format: GPUTextureFormat;
    depthWriteEnabled?: boolean;
    depthCompare?: GPUCompareFunction;
    stencilBack?: GPUStencilStateFace;
    stencilFront?: GPUStencilStateFace;
    stencilReadMask?: number;
    stencilWriteMask?: number;
  }
  
  interface GPUStencilStateFace {
    compare?: GPUCompareFunction;
    failOp?: GPUStencilOperation;
    depthFailOp?: GPUStencilOperation;
    passOp?: GPUStencilOperation;
  }
  
  type GPUStencilOperation = 'keep' | 'zero' | 'replace' | 'invert' | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';
  
  interface GPUMultisampleState {
    count?: number;
    mask?: number;
    alphaToCoverageEnabled?: boolean;
  }
}
