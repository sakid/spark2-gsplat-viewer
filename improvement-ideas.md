# SPARK 2.0 - Potential Improvements

## 1. Multi-Splat Scene Support
Currently only one splat can be loaded at a time. Allow loading multiple splats with individual transforms, visibility toggles, and LOD controls. This would enable scene composition with multiple Gaussian splat assets.

## 2. Undo/Redo System
Only voxel editing has undo support. Implement a comprehensive undo/redo stack for:
- Light transformations and property changes
- Proxy mesh transformations
- Splat visibility and transform changes
- Scene settings modifications

## 3. Modularize main.ts
The main.ts file is ~2445 lines and contains event handlers, collision logic, movement code, and orchestration. Extract into focused modules:
- `src/app/eventHandlers.ts` - All UI event callbacks
- `src/app/collision.ts` - FPS collision and unstuck logic
- `src/app/transforms.ts` - Flip and alignment calculations
- `src/app/animationLoop.ts` - Render loop orchestration

## 4. Keyboard Shortcut System
Only voxel edit mode has keyboard shortcuts. Add a global shortcut manager:
- `L` - Toggle light edit mode
- `P` - Toggle proxy edit mode
- `V` - Toggle voxel edit mode
- `Ctrl+S` - Save scene to current slot
- `Ctrl+Z/Y` - Undo/Redo
- `Delete` - Delete selected object
- `F` - Focus on selected object

## 5. Splat Animation Timeline
Add keyframe animation recording for splat transforms, camera paths, and light movements. Include:
- Timeline UI with scrubber
- Keyframe interpolation (linear, bezier, step)
- Play/pause/record controls
- Export animations to JSON

## 6. Progressive BVH Building
BVH building is skipped for meshes over 1.5M triangles. Implement progressive BVH construction that works in Web Workers and builds incrementally, allowing large proxy meshes to have collision without blocking the main thread.

## 7. Visual Regression Testing
Add screenshot-based regression tests for UI panels and 3D viewport rendering. Use a tool like Playwright or Percy to catch visual regressions before they ship.

## 8. Mobile-First UI Redesign
The control panel uses fixed sizing that may not work well on tablets. Create responsive UI with:
- Collapsible sections
- Touch-friendly button sizes
- Portrait/landscape layouts
- Gesture controls (pinch to zoom, two-finger pan)

## 9. Splat Material Presets
Add preset profiles for different rendering scenarios:
- Cinema: High contrast, filmic tone mapping, soft shadows
- Architectural: Neutral colors, accurate scale, sharp shadows
- Game: Performance-optimized, lower LOD, faster collision
- VR: Stereo-optimized, reduced LOD, comfort features

## 10. Collaborative Scene Editing
Add real-time collaboration features using WebRTC or WebSocket:
- Share scene state between multiple users
- Show other users' cursors and selections
- Lock objects while editing
- Chat or comment system

## 11. Comprehensive Error Handling
Replace generic `Error` throws with custom error classes:
- `SceneValidationError` - For scene file validation failures
- `LoadError` - For splat/proxy loading failures
- `RenderError` - For Spark renderer issues
- `ExportError` - For GLTF export failures
Include error codes and recovery suggestions.

## 12. Onboarding Tutorial
Add an interactive tutorial for new users:
- Step-by-step guide on first load
- Highlight UI sections with explanations
- Practice tasks (load splat, add light, edit voxel)
- Skip option for returning users
- Store completion state in localStorage

## 13. Splat Clipping Planes
Add clipping plane controls for cross-section viewing:
- Add/remove clipping planes
- Plane normal and position controls
- Per-plane enable/disable toggles
- Caps rendering for clipped surfaces

## 14. Environment Map Support
Add support for image-based lighting:
- Load HDR environment maps (.hdr, .exr)
- Real-time reflections on proxy mesh
- Background blur controls
- Generate lighting from environment map

## 15. Scene Comparison Mode
Add ability to compare two scenes or scene states:
- Side-by-side viewport
- Slider comparison (drag to reveal before/after)
- Difference highlighting
- Useful for A/B testing lighting changes

## 16. Performance Profiler
Add built-in performance profiling tools:
- Frame time graph
- Memory usage tracking
- Draw call counter
- GPU metrics (if available)
- Export performance reports

## 17. Splat Selection and Editing
Add ability to select and edit individual splats:
- Brush selection tool
- Delete selected splats
- Move/rotate/scale selected splats
- Clone selected splats
- Color/opacity adjustment

## 18. Scene Templates
Create reusable scene templates:
- Empty outdoor scene (sun + sky)
- Indoor studio (soft boxes + ambient)
- Product showcase (turntable + spotlight)
- Architectural interior (area lights)
Templates include pre-configured lights, camera, and settings.

## 19. Export Format Options
Expand export capabilities:
- USDZ export for AR applications
- FBX export with lights and cameras
- OBJ export for proxy mesh
- glTF with extensions (KHR_lights_punctual, etc.)
- Custom Spark scene package format

## 20. Accessibility Improvements
Improve accessibility for users with disabilities:
- ARIA labels on all interactive elements
- Keyboard navigation for entire UI
- High contrast theme option
- Screen reader announcements for state changes
- Reduced motion mode for animations

## 21. Splat Segmentation Tool
Add automatic segmentation of splats into distinct objects:
- Cluster-based segmentation using splat positions
- Interactive region growing selection
- Manual paint selection for refining boundaries
- Export segments as separate splat files
- Useful for extracting characters from environments

## 22. Voxel-Based Physics
Implement physics simulation using the voxel collision data:
- Rigid body physics for dynamic objects
- Gravity and collision response
- Stackable objects with realistic behavior
- Physics debug visualization
- Export physics-enabled scenes

## 23. Splat Compression Pipeline
Add compression options for reducing splat file sizes:
- Lossy compression with quality slider
- Spatial quantization options
- Color depth reduction
- Automatic LOD generation
- Batch compression for multiple files

## 24. Camera Path Recording
Record and playback camera movements:
- Record keyframes while navigating
- Smooth interpolation between keyframes
- Adjustable playback speed
- Export camera paths as JSON
- Import/export for sharing

## 25. Light Baking System
Pre-compute lighting for static scenes:
- Bake ambient occlusion into vertex colors
- Generate light maps for proxy mesh
- Progressive baking with preview
- Support for multiple bounces
- Export baked lighting to standard formats

## 26. Splat Color Correction
Add real-time color correction tools:
- Brightness/contrast/exposure controls
- White balance adjustment
- Color grading LUTs (lookup tables)
- Per-channel adjustments (RGB)
- HSL/HSV sliders

## 27. Proxy Mesh Sculpting
Add sculpting tools for proxy mesh modification:
- Push/pull brush
- Smooth brush
- Flatten brush
- Symmetry options
- Dynamic topology updates

## 28. Splat Density Visualization
Visualize splat density and quality:
- Heat map showing splat density
- Quality metrics overlay
- Problem area highlighting
- Splat count per region
- Quality score calculations

## 29. Scene Version History
Track changes to scenes over time:
- Automatic version snapshots
- Diff viewer for comparing versions
- Rollback to previous versions
- Branch versions for experiments
- Merge version branches

## 30. Splat LOD Preview
Preview different LOD levels interactively:
- Slider to adjust LOD in real-time
- Split-screen comparison
- Performance impact estimation
- Quality metrics at each LOD
- Automatic LOD recommendation

## 31. Cross-Platform Desktop App
Package as a standalone desktop application:
- Electron or Tauri wrapper
- Native file dialogs
- Offline functionality
- System tray integration
- Hardware acceleration options

## 32. Splat Alignment Tools
Tools for aligning multiple splats:
- Point cloud registration
- Manual alignment controls
- ICP (Iterative Closest Point) algorithm
- Alignment preview with ghost overlay
- Snap-to-surface features

## 33. Batch Processing Mode
Process multiple splat files at once:
- Batch import/export
- Automated workflows
- Scriptable actions
- Progress tracking
- Error handling and reporting

## 34. Splat Noise Reduction
Remove noise and artifacts from splats:
- Statistical outlier removal
- Gaussian smoothing
- Median filtering
- Preserve edges option
- Preview before/after

## 35. Custom Shader Support
Allow custom shaders for splat rendering:
- Shader editor UI
- Uniform/attribute binding
- Shader presets library
- Hot reload during editing
- Export shaders with scenes

## 36. Voxel Editing Brushes
Add brush-based voxel editing:
- Add voxel brush
- Remove voxel brush
- Smooth voxel brush
- Paint voxel colors
- Brush size and strength controls

## 37. Splat Measurement Tools
Add measurement capabilities:
- Distance measurement tool
- Angle measurement
- Area calculation
- Volume estimation
- Measurement annotations

## 38. Scene Metadata System
Add rich metadata to scenes:
- Author and creation date
- Tags and categories
- License information
- External references
- Custom metadata fields

## 39. Splat Animation Import
Import animations from external sources:
- Import BVH motion capture
- Import FBX animations
- Retargeting controls
- Animation blending
- Loop and timing controls

## 40. VR Hand Controllers
Full VR hand controller support:
- Hand tracking integration
- Gestural controls
- Haptic feedback
- Two-handed manipulation
- Virtual keyboard for text input

## 41. Splat Proxy Matching
Automatically match splats to proxy meshes:
- Auto-rigging integration
- Bone mapping suggestions
- Weight painting assistance
- Proportion matching
- Pose alignment

## 42. Network Proxy Streaming
Stream proxy meshes from network:
- Load proxies from URLs
- Progressive loading with priority
- Cache management
- Offline fallback
- CDN integration

## 43. Splat UV Unwrapping
Generate UV coordinates for splats:
- Automatic UV unwrapping
- Texture projection modes
- UV editing tools
- Export UV layout
- Apply textures to splats

## 44. Scene Scripting API
Add scripting capabilities:
- JavaScript/TypeScript API
- Scene manipulation methods
- Event handling
- Custom component system
- Script debugging tools

## 45. Splat Blending Modes
Add blending modes for splat rendering:
- Additive blending
- Multiplicative blending
- Screen blending
- Overlay blending
- Per-splat blend controls

## 46. Quality Assurance Dashboard
Add QA tools for splat inspection:
- Missing data detection
- Invalid splat highlighting
- Quality score metrics
- Automatic fix suggestions
- Export QA reports

## 47. Splat Pose Library
Store and apply poses to rigged splats:
- Pose library UI
- Save current pose
- Blend between poses
- Pose categories/tags
- Import/export poses

## 48. Multi-Resolution Export
Export at multiple resolutions:
- Mobile-optimized version
- Desktop version
- Full quality version
- Automatic resolution selection
- Batch export all versions

## 49. Splat Background Removal
Automatically remove background splats:
- Foreground/background segmentation
- Manual refinement tools
- Preserve edge quality
- Export foreground only
- Replace background options

## 50. Scene Lighting Presets
Pre-built lighting setups:
- Studio lighting (3-point)
- Outdoor daylight
- Golden hour
- Moonlight
- Neon/cyberpunk
- Custom preset saving

## 51. Splat Morph Targets
Add morph target animation support:
- Import morph targets
- Blend shape controls
- Animation keyframing
- Export with morph targets
- Real-time morph preview

## 52. Collision Layer System
Organize collision by layers:
- Define collision layers
- Layer visibility toggles
- Inter-layer collision rules
- Layer-based filtering
- Debug visualization per layer

## 53. Splat Noise Injection
Add procedural noise to splats:
- Position noise (jitter)
- Color noise
- Scale noise
- Noise patterns (Perlin, simplex)
- Animation over time

## 54. Scene State Snapshots
Capture and restore arbitrary scene states:
- Quick snapshot hotkey
- Snapshot gallery UI
- Named snapshots
- Snapshot comparison
- Auto-save snapshots

## 55. Splat Bounds Editing
Manually adjust splat bounding box:
- Drag bounds corners
- Automatic bounds calculation
- Per-axis scaling
- Center point adjustment
- Export modified bounds

## 56. Proxy Animation Blending
Blend between proxy animations:
- Cross-fade controls
- Additive animation layers
- Animation tree editor
- State machine for animations
- Preview blending in real-time

## 57. Splat Spatial Queries
Query splats by spatial criteria:
- Ray intersection
- Sphere overlap
- Frustum culling
- Nearest neighbor search
- Distance queries

## 58. Scene Dependency Graph
Visualize scene dependencies:
- Asset dependency tree
- Circular dependency detection
- Missing asset warnings
- Dependency resolution
- Export dependency report

## 59. Splat Instance System
Create instances of splat groups:
- Instance placement tool
- Per-instance overrides
- Instance scatter brush
- LOD per instance
- Instance editing mode

## 60. Advanced Voxel Shapes
Support non-cube voxel shapes:
- Sphere voxels
- Cylinder voxels
- Custom mesh voxels
- Mixed voxel types
- Automatic shape selection
