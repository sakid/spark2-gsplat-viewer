# Performance Improvement Plan for Spark 2.0 Gaussian‑Splat Viewer

This document enumerates concrete, research‑backed optimisations that can be applied to the **Spark 2.0** viewer (three.js‑based Gaussian splatting).  Each item contains a short description, why it matters, and a reference to official documentation or a reputable article.

---

## ✅ Performance‑Improvement Checklist

| # | Area | Recommendation | Rationale / Expected Gain | Reference |
|---|------|----------------|---------------------------|-----------|
| 1️⃣ | **Render Backend** | **Prefer WebGPU when supported** – fallback to WebGL only when necessary. | WebGPU can run compute‑shaders and storage‑buffer pipelines, allowing the splat‑generation and LOD calculations to stay on‑GPU instead of CPU. This reduces main‑thread work and memory copies. | `UnifiedRenderer` already detects WebGPU – see <https://gpuweb.github.io/gpuweb/> and three.js WebGPU docs <https://threejs.org/docs/#examples/en/renderers/WebGPURenderer> |
| 2️⃣ | **GPU Instancing** | Render splats via `THREE.InstancedMesh` (or a custom `GPUInstancedBufferGeometry`) instead of a separate mesh per point. | Instancing collapses thousands‑of‑draw‑calls into a single call, dramatically lowering driver overhead. | <https://threejs.org/docs/#api/en/core/InstancedMesh> |
| 3️⃣ | **Data‑Texture Attributes** | Store per‑splat attributes (position, covariant, colour, opacity) in a **GPU data texture** and sample in the shader rather than using vertex attributes. | A data texture can hold millions of splats while staying within the vertex‑attribute limit, and avoids the need to re‑upload large `Float32Array`s each frame. | “GPU‑Based Particle Systems with Data Textures” – <https://threejs.org/examples/?q=data+texture#webgl2_materials_texture2darray> |
| 4️⃣ | **LOD & Visibility Culling** | • Enforce **screen‑space LOD** thresholds based on splat size. <br>• Add **frustum culling** per‑LOD group (or use three‑js built‑in `Frustum.intersectsBox`). | Already have LOD (`lod: true`), but tightening the size‑based cutoff prevents drawing splats that are sub‑pixel – saving fill‑rate. Frustum culling skips entire clusters outside the view. | <https://threejs.org/docs/#api/en/math/Frustum> |
| 5️⃣ | **BVH for Raycasting** | Ensure the **BVH** used for proxy‑mesh raycasting is also employed for **splat‑raycasting** (if any). | BVH reduces ray‑intersection tests from O(N) to O(log N). The project already installs `installBvhRaycastExtensions`; extending it to splats cuts collision checks when the user clicks or moves the capsule. | <https://github.com/gkjohnson/three-mesh-bvh> |
| 6️⃣ | **Memory Reuse / Pooling** | Re‑use `Uint8Array` / `Float32Array` buffers for consecutive file loads (e.g., keep a pre‑allocated pool that can be resized). | Avoids frequent GC pressure when loading many large `.spz` files. | “Avoiding Garbage Collection in WebGL Apps” – <https://web.dev/performance-memory/> |
| 7️⃣ | **Worker Thread for Decoding** | Offload the **splats decoding** (the `new sparkModule.SplatMesh` step) to a **Web Worker**. | Decoding can take seconds for > 500 MB files; moving it off the main thread keeps UI responsive and allows the progress callback to be displayed. | <https://developer.mozilla.org/en-US/docs/Web/API/Worker> |
| 8️⃣ | **Texture‑Size & Format** | Use **compressed texture formats** (e.g., `BC7`, `ASTC`) for any colour‑lookup textures used by the splat shader. | Reduces GPU memory bandwidth and improves cache locality. | <https://threejs.org/docs/#api/en/textures/CompressedTexture> |
| 9️⃣ | **Shader Optimisation** | • Remove unused uniforms. <br>• Use `#ifdef` to compile only the needed paths (e.g., disable shadow‑mapping when not in use). <br>• Prefer `vec4` over separate `float`s to align with GPU memory lanes. | Smaller shaders compile faster and execute with fewer cycles per fragment. | “Shader Performance Tips” – <https://developer.nvidia.com/gpugems/gpugems2/particle-systems> |
| 🔟 | **Render Loop Hygiene** | • **Throttle UI / GUI updates** (e.g., Tweakpane) to ≤ 30 Hz. <br>• **Batch DOM reads/writes** (use a single `requestAnimationFrame` pass). <br>• **Avoid per‑frame allocations** (e.g., reuse `THREE.Vector3` objects – already done, but audit any `new` inside the `tick` loop). | Reduces main‑thread work, prevents jank, and lowers GC spikes. | <https://threejs.org/docs/#manual/en/introduction/Creating-a-scene> (section “Animation loop patterns”) |
| 1️⃣1️⃣ | **Asset‑Size Limits** | Enforce a **hard limit** on the number of proxy‑mesh triangles (`MAX_PROXY_TRIANGLES_FOR_BVH`) **before** BVH construction; skip BVH for meshes above a safe threshold or simplify them on‑the‑fly. | BVH build scales roughly O(N log N). Very large meshes can stall loading; simplifying (e.g., `MeshSimplifier`) keeps it fast. | <https://github.com/spite/meshoptimizer#simplify> |
| 1️⃣2️⃣ | **Dynamic Resolution Scaling** | Implement **resolution‑dependent rendering** (render to a lower‑resolution render target when FPS drops below a threshold, then upscale). | Keeps interaction fluid on low‑end hardware without sacrificing visual quality at rest. | “Adaptive Rendering” – <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled> (applies to three.js render targets) |
| 1️⃣3️⃣ | **GPU‑Driven Culling** | When WebGPU is active, leverage **compute‑shader culling** (e.g., `IndirectDrawBuffer`) to skip invisible splats entirely. | Moves culling from CPU to GPU, which is especially beneficial for millions of splats. | WebGPU spec – <https://gpuweb.github.io/gpuweb/#draw-calls> |
| 1️⃣4️⃣ | **Avoid `console.log` / `console.warn` in hot paths** | Remove or guard debug prints in the render loop (`console` calls are expensive). | Prevents unnecessary stalls when the developer console is open. | General JS perf advice – <https://web.dev/console-performance/> |
| 1️⃣5️⃣ | **Pre‑compute Bounding Spheres** | Store a **per‑LOD‑group bounding sphere** for quick sphere‑culling before deeper frustum checks. | One cheap sphere test eliminates many expensive box tests. | <https://threejs.org/docs/#api/en/math/Sphere> |

---

## How to Verify / Prioritise
1. **Benchmark baseline** – run the existing viewer with a large `.spz` (≈ 500 MB) and record FPS, load time, and memory usage (use Chrome DevTools Performance + Memory panels).
2. **Apply changes incrementally** (e.g., start with InstancedMesh, then add WebGPU‑only paths). After each change, re‑run the benchmark and note the delta.
3. **Focus on the low‑hanging fruit** – items 1‑4 (WebGPU fallback, Instancing, data textures, tightened LOD) typically give the biggest win with minimal code churn.

## Suggested Next Steps (if you decide to act)
1. **Create a small prototype** that renders a million splats using `InstancedMesh` + a data‑texture shader (you can copy the three.js “gpu‑particles” example as a base).
2. **Wrap the SplatMesh decode** in a Web Worker and expose a Promise‑based API (`loadFromFileInWorker`).
3. **Add a runtime switch** (`preferWebGPU`) that enables the compute‑shader culling path when `backend === 'webgpu'`.

Feel free to pick any subset of the above list that matches your current development capacity. Each item is self‑contained and documented, so you can dive straight into implementation after you’ve verified the expected gain with the benchmark.