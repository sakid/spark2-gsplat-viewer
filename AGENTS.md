# AGENTS.md - SPARK 2.0 Developer Guide

This file provides guidelines and reference information for agentic coding agents working on the SPARK 2.0 Gaussian Splat Viewer project.

---

## 1. Project Overview

- **Project Name**: spark2-gsplat-viewer
- **Type**: TypeScript/Vite-based 3D webapp using Three.js and Spark renderer
- **Runtime**: Browser-based WebGL viewer with proxy mesh animation
- **Key Dependencies**: three, @sparkjsdev/spark, tweakpane, dockview-core, vitest

---

## 2. Build, Lint, and Test Commands

### Development
```bash
npm run dev              # Start Vite dev server
```

### Building
```bash
npm run build            # Production build (includes file size check)
npm run preview          # Preview production build
```

### Testing
```bash
npm test                 # Run all tests once
npm run test:watch       # Run tests in watch mode (dev workflow)
```

#### Running a Single Test
```bash
# Run specific test file
npx vitest run tests/eventBus.test.ts

# Run tests matching a pattern
npx vitest run --grep "eventBus"

# Run tests in a specific directory
npx vitest run tests/
```

### Other Commands
```bash
npm run check:file-sizes   # Validate bundle sizes
npm run check:lines        # Check line counts
npm run test:collision-smoke  # Collision system smoke test
npm run test:deform-smoke  # Deformation system smoke test
npm run convert:ply-to-spz # Convert PLY files to SPZ format
npm run convert:proxy      # Convert proxy meshes
```

---

## 3. Code Style Guidelines

### TypeScript Configuration
- **Target**: ES2022
- **Module**: ESNext
- **Strict mode**: Enabled
- **Module resolution**: Bundler
- **No implicit any**: Enabled via strict mode

Always use explicit types. Avoid `any` unless absolutely necessary.

### Imports

**Group imports by category** (order matters):
1. Node/standard library imports
2. Third-party imports (three, vitest, etc.)
3. Local relative imports (../, ./)

```typescript
// 1. Node/standard library
import path from 'path';
import fs from 'fs';

// 2. Third-party
import * as THREE from 'three';
import { describe, expect, test, vi } from 'vitest';

// 3. Local
import { createPanel } from './ui/panel';
import type { SparkModuleLike } from './spark/previewAdapter';
```

**Use named exports** for almost everything:
```typescript
// Preferred
export function createPanel() { }
export interface SceneLightV2 { }

// Avoid default exports unless for configuration compatibility
```

**Use type-only imports** for types:
```typescript
import type { SplatMeshLike } from './spark/previewAdapter';
import { type LightGizmoSubmode } from './viewer/lights';
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `sceneState.ts`, `loadSplat.ts` |
| Classes | PascalCase | `class DummySparkRenderer` |
| Interfaces | PascalCase | `SceneLightV2`, `AppState` |
| Functions | camelCase | `createPanel()`, `loadFromFile()` |
| Variables | camelCase | `sparkModule`, `container` |
| Constants | UPPER_SNAKE_CASE | `MAX_PROXY_FILE_BYTES`, `SCENE_SLOT_LIMIT` |
| Enums/Const objects | PascalCase | `SceneToneMapping` |
| Types | PascalCase | `SceneFileVersion`, `LoadMode` |

### Arrays and Tuples

Use explicit array syntax when possible:
```typescript
// Array of specific type
const lights: SceneLightV2[] = [];

// Tuple with explicit typing
const position: [number, number, number] = [0, 0, 0];
const quaternion: [number, number, number, number] = [0, 0, 0, 1];
```

### Error Handling

Use descriptive error messages with context:

```typescript
// Validation errors
throw new Error(`Scene validation failed: ${name} must be a string.`);
throw new Error(`Scene validation failed: lights[${index}] must be be an object.`);

// Missing elements
throw new Error('Missing #scene-container element.');
throw new Error(`Missing dialog node "${cursor}"`);

// Unsupported operations
throw new Error(`Unsupported proxy mesh format "${ext}". Supported: .glb, .gltf, .obj`);
throw new Error(`Unsupported dialog node type: ${node.type}`);
```

### Null/Undefined Handling

- Use optional chaining: `obj?.property`
- Use nullish coalescing: `value ?? defaultValue`
- Avoid loose equality: use `===` and `!==`

### Async/Await

Always handle errors with try/catch for async operations:
```typescript
async function loadSparkModule(): Promise<SparkModuleLike> {
  try {
    const module = await import(/* @vite-ignore */ url);
    return module;
  } catch (error) {
    throw new Error(`Failed to load Spark module: ${error}`);
  }
}
```

---

## 4. Testing Guidelines

### Test Structure (Vitest)
```typescript
import { describe, expect, test, vi } from 'vitest';

describe('eventBus', () => {
  test('subscribes, emits, and unsubscribes', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.emit('hello', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

### Test File Naming
- Unit tests: `*.test.ts`
- Smoke tests: `*.smoke.test.ts`
- Place in `tests/` directory at project root

### Mocking
- Use `vi.fn()` for function mocks
- Use `vi.mock()` for module mocking
- Import source files using relative paths: `../src/utils/eventBus`

---

## 5. Project Structure

```
src/
├── main.ts              # Entry point (large, ~2400 lines)
├── app/                 # Application logic
│   ├── bootstrap.ts     # Spark module initialization
│   ├── lighting.ts      # Lighting probe rigs
│   ├── sceneSlots.ts    # Scene persistence
│   └── voxelEditing.ts  # Voxel editing utilities
├── scene/
│   └── sceneState.ts    # Scene file format & validation
├── spark/
│   └── previewAdapter.ts # Spark renderer adapter
├── ui/
│   ├── panel.ts         # Main UI panel
│   └── panel/           # UI components
├── utils/
│   └── eventBus.ts      # Event bus implementation
├── viewer/
│   ├── camera.ts        # Camera controls
│   ├── initScene.ts     # Scene initialization
│   ├── loadSplat.ts     # Splat loading logic
│   ├── lights.ts        # Light management
│   └── voxelizer.ts     # Voxel generation
├── js/                  # Legacy JavaScript (gameplay, dialog)
└── export/
    └── gltfExport.ts    # GLTF export functionality
```

---

## 6. Common Patterns

### URL Parameter Handling
```typescript
const params = new URLSearchParams(window.location.search);
const noSpark = params.get('noSpark') === '1';
```

### Global Window Extensions
```typescript
declare global {
  interface Window {
    __SPARK2_VIEWER__?: ReturnType<typeof initViewer>;
  }
}
```

### Three.js Common Patterns
```typescript
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// Extend built-in classes
class DummySparkRenderer extends THREE.Object3D {
  enableLod = true;
  dispose() {}
}
```

### DOM Element Queries
```typescript
const container = document.getElementById('scene-container');
if (!container) {
  throw new Error('Missing #scene-container element.');
}
```

---

## 7. Debugging

- Access debug globals via `window.__SPARK2_VIEWER__` in dev mode
- Event bus available for runtime debugging: `window.__SPARK2_DEBUG__?.eventBus`
- URL params: `?noSpark=1` for dummy mode, `?npc=1` for gameplay demo

---

## 8. Performance Considerations

- LOD splat counts: 1,500,000 (desktop), 500,000 (mobile)
- Max std dev: `Math.sqrt(8)`
- Proxy file size limit: 2 GiB hard stop, 512 MiB practical limit for OBJ
- Scene slot limit: 50

---

## 9. Version Information

- Current schema version: 2
- Uses localStorage for scene persistence (`spark2.scene.slots.v2`)
- Dialog/game state: `localStorage` key `spark-game-save-v1`
