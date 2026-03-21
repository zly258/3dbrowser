# 3DBrowser Architecture

## Overview

3DBrowser is built on a modular architecture that separates concerns between UI rendering, 3D scene management, and model loading. This document provides detailed architectural guidance for developers.

## Core Architecture Layers

```
┌─────────────────────────────────────────┐
│         UI Layer (React)                │
│  - Components                           │
│  - State Management                    │
│  - Event Handling                       │
├─────────────────────────────────────────┤
│     Business Logic Layer                │
│  - SceneManager (Core)                 │
│  - Tool Managers (Measure, Clip)        │
│  - Selection Manager                    │
├─────────────────────────────────────────┤
│      3D Engine Layer (Three.js)         │
│  - Renderer                             │
│  - Scene Graph                          │
│  - Camera & Controls                   │
├─────────────────────────────────────────┤
│      Data Layer                         │
│  - Model Loaders                        │
│  - Format Parsers                       │
│  - Data Converters                      │
└─────────────────────────────────────────┘
```

## SceneManager - The Core

SceneManager is the central orchestrator for all 3D operations. It follows a singleton pattern within the ThreeViewer component lifecycle.

### Responsibilities

1. **Scene Management**
   - Initialize and maintain Three.js scene
   - Manage camera and controls
   - Handle lighting setup
   - Coordinate rendering loop

2. **Model Management**
   - Load models from various sources
   - Track loaded models by UUID
   - Manage model lifecycle (load, update, remove)
   - Handle model transforms and visibility

3. **Interaction Management**
   - Handle mouse/touch input
   - Raycasting for object selection
   - Implement measurement tools
   - Manage clipping planes

4. **Performance Management**
   - Implement frustum culling
   - Manage rendering optimization
   - Handle resource cleanup
   - Monitor performance metrics

### Key Data Structures

```typescript
class SceneManager {
  // Three.js core objects
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  
  // Scene groups
  contentGroup: THREE.Group;        // Loaded models
  helpersGroup: THREE.Group;        // Visual helpers
  measureGroup: THREE.Group;        // Measurement visuals
  clipHelpersGroup: THREE.Group;    // Clipping plane helpers
  
  // State
  models: Map<string, ModelData>;   // UUID -> ModelData
  selectedUuid: string | null;
  highlightedUuids: Set<string>;
  
  // Tools
  measureType: MeasureType;
  clippingPlanes: THREE.Plane[];
}
```

### Model Loading Architecture

Models are loaded through a unified loader interface:

```typescript
interface ModelLoader {
  load(source: File | string, progress?: ProgressCallback): Promise<string>;
  dispose(uuid: string): void;
  getMetadata(uuid: string): ModelMetadata;
}
```

Supported loaders:
- `IFCLoader`: BIM IFC files using web-ifc
- `GLTFLoader`: Standard GLB/GLTF format
- `OBJSLoader`: Wavefront OBJ format
- `TilesLoader`: 3D Tiles for massive models
- `NBIMLoader`: Custom high-performance format
- `OCCTLoader`: CAD formats via OCCT

### Selection System

The selection system uses a UUID-based approach:

1. **Selection Flow**
   - User clicks on object → Raycast from camera
   - Find intersected mesh → Traverse up to find model root
   - Get model UUID from userData
   - Update selection state → Notify listeners
   - Update UI (highlight, properties panel)

2. **Multi-Selection**
   - Use Set<string> for multiple selected UUIDs
   - Ctrl+Click adds/removes from selection
   - Shift+Click for range selection (in tree view)

### Measurement System

Measurements are implemented as visual overlays:

```typescript
interface MeasurementRecord {
  id: string;
  type: 'dist' | 'angle' | 'coord';
  val: string;         // Formatted value
  points: Vector3[];   // Measured points
  group: THREE.Group;  // Visual representation
  modelUuid?: string;  // Associated model
}
```

Measurement workflow:
1. User starts measurement tool
2. Click points in 3D space
3. Calculate distance/angle/coordinate
4. Create visual representation (lines, markers, text)
5. Store measurement record
6. Allow editing/clearing

### Clipping System

Clipping uses Three.js clipping planes:

1. **Setup**
   - Create clipping planes for X, Y, Z axes
   - Attach planes to renderer and materials
   - Create visual helpers for planes

2. **Operation**
   - Enable/disable clipping planes
   - Adjust plane position via slider
   - Update material clipping properties
   - Sync visual helpers

## Component Architecture

### Component Hierarchy

```
ThreeViewer (Root)
├── MenuBar / Toolbar (Conditional)
├── CanvasContainer
│   ├── ThreeCanvas
│   └── ViewCube
├── FloatingPanels
│   ├── SceneTree
│   ├── PropertiesPanel
│   ├── MeasurementPanel
│   ├── ClipPanel
│   ├── SettingsPanel
│   └── StatsPanel
├── LoadingOverlay
├── ErrorBoundary
└── ContextMenus
```

### Component Communication

Components communicate through:
1. **Props**: Parent → Child (one-way data flow)
2. **Callbacks**: Child → Parent (events)
3. **Context**: Deep state (theme, language, settings)
4. **Event Bus**: Cross-component events (using custom hooks)

### State Management

State is managed at multiple levels:

1. **Local Component State**: useState for component-specific state
2. **SceneManager State**: 3D scene state in SceneManager
3. **Context State**: Global app state (theme, language, settings)
4. **URL State**: View state in URL for sharing

## Performance Architecture

### Rendering Pipeline

```
Input → Update → Culling → Render → Present
  ↓      ↓        ↓        ↓        ↓
Events Logic  Optimize  WebGL   Display
```

### Optimization Strategies

1. **Instanced Rendering**
   - Batch repeated geometry
   - Use InstancedMesh for similar objects
   - Reduce draw calls significantly

2. **Frustum Culling**
   - Skip objects outside camera view
   - Bounding box pre-check
   - Octree for spatial queries

3. **Level of Detail (LOD)**
   - High detail for close objects
   - Low detail for distant objects
   - Smooth transitions

4. **Lazy Loading**
   - Load visible chunks first
   - Load detail on demand
   - Progressive refinement

### Memory Management

1. **Resource Disposal**
   - Dispose geometries, materials, textures
   - Clear unused buffers
   - Release WebGL resources

2. **Object Pooling**
   - Reuse temporary objects
   - Pool markers and helpers
   - Reduce GC pressure

3. **Chunk Management**
   - Load/unload model chunks
   - LRU cache for chunks
   - Priority-based loading

## Error Handling Architecture

### Error Types

1. **Loading Errors**
   - File format not supported
   - Corrupted file data
   - Network failures
   - Out of memory

2. **Rendering Errors**
   - WebGL context lost
   - Shader compilation errors
   - Texture loading failures

3. **Runtime Errors**
   - Invalid user input
   - Tool state conflicts
   - API misuse

### Error Flow

```
Error Occurs
    ↓
Catch in try-catch
    ↓
Log error with context
    ↓
Show user-friendly message
    ↓
Provide recovery options
    ↓
Update error monitoring
```

### Recovery Strategies

1. **Retry Operation**: For transient errors
2. **Fallback**: Use alternative loading method
3. **Graceful Degradation**: Disable features that fail
4. **Clear State**: Reset to safe state

## Extension Points

### Adding New Model Format

1. Create loader class implementing ModelLoader interface
2. Add format detection logic
3. Register loader in SceneManager
4. Add format-specific metadata extraction
5. Update UI for format-specific options

### Adding New Tool

1. Create tool manager class
2. Integrate with SceneManager
3. Create UI panel component
4. Add toolbar button/menu item
5. Handle keyboard shortcuts

### Adding New Panel

1. Create panel component extending BasePanel
2. Add panel ID to hiddenMenus
3. Implement panel state management
4. Add panel toggling logic
5. Persist panel state (optional)

## Data Flow

### Model Loading Flow

```
User selects file
    ↓
Validate file type
    ↓
Choose appropriate loader
    ↓
Show loading overlay
    ↓
Load model in worker/thread
    ↓
Update progress callback
    ↓
Create Three.js objects
    ↓
Add to scene
    ↓
Generate UUID
    ↓
Update structure tree
    ↓
Hide loading overlay
    ↓
Fit view to model
```

### Selection Flow

```
User clicks in canvas
    ↓
Get mouse coordinates
    ↓
Raycast from camera
    ↓
Find intersected object
    ↓
Get model UUID from userData
    ↓
Update selectedUuid in SceneManager
    ↓
Trigger onSelect callback
    ↓
Update UI highlights
    ↓
Update properties panel
    ↓
Update scene tree selection
```

## Security Considerations

### File Handling

1. **Validation**
   - Check file type (MIME type + extension)
   - Validate file size limits
   - Sanitize file names

2. **Parsing Safety**
   - Use Web Workers for parsing
   - Set timeout for parsing operations
   - Handle parsing errors gracefully

3. **Memory Protection**
   - Limit file sizes
   - Monitor memory usage
   - Reject overly complex models

### Input Sanitization

1. **URL Handling**
   - Validate URL protocols (http/https)
   - Prevent JavaScript: URLs
   - Sanitize URL-encoded data

2. **User Data**
   - Sanitize user-provided strings
   - Escape HTML in UI
   - Validate numeric inputs

## Browser Compatibility

### Feature Detection

```typescript
function checkWebGL2(): boolean {
  return !!window.WebGL2RenderingContext;
}

function checkWebWorker(): boolean {
  return !!window.Worker;
}

function checkOffscreenCanvas(): boolean {
  return !!window.OffscreenCanvas;
}
```

### Fallback Strategies

1. **No WebGL 2**: Show error message, suggest browser upgrade
2. **No Web Workers**: Use main thread with async/await
3. **No OffscreenCanvas**: Use canvas in main thread
4. **Low Memory**: Reduce quality, disable features

## Testing Architecture

### Unit Tests

Test isolated functions and classes:
- Loader utilities
- Math helpers
- Data converters
- Format parsers

### Integration Tests

Test component interactions:
- Model loading flow
- Selection workflow
- Measurement tools
- Settings persistence

### Performance Tests

Test performance characteristics:
- Large model loading
- Rendering performance
- Memory usage
- Interaction responsiveness

## Monitoring and Analytics

### Metrics to Track

1. **Performance**
   - Frame rate (FPS)
   - Model load time
   - Memory usage
   - Draw calls

2. **Usage**
   - Features used
   - Models loaded
   - Session duration
   - Error occurrences

3. **Errors**
   - Error types
   - Error frequency
   - Error context

## Deployment Architecture

### Build Process

```
Source (TypeScript)
    ↓
TypeScript Compiler (tsc)
    ↓
Vite Bundler
    ↓
ES Module (dist/3dbrowser.es.js)
    ↓
UMD Bundle (dist/3dbrowser.umd.js)
    ↓
TypeScript Declarations (dist/index.d.ts)
```

### Distribution

- NPM package for easy installation
- CDN for quick prototyping
- Example applications for demos

## Documentation Architecture

### Documentation Types

1. **API Documentation**: Generated from TypeScript declarations
2. **User Guide**: README with examples and tutorials
3. **Architecture Docs**: This document and others
4. **Code Comments**: JSDoc for public APIs

### Documentation Workflow

1. Write code with JSDoc comments
2. Generate API docs from TypeScript
3. Update README for public changes
4. Add architecture docs for complex features
5. Keep examples synchronized with API

## Future Considerations

### Scalability

- Support for larger models
- Multi-view rendering
- Distributed rendering
- Cloud-based processing

### Extensibility

- Plugin system for tools
- Custom renderers
- Extension API
- Theme customization

### Accessibility

- Keyboard navigation
- Screen reader support
- High contrast mode
- Reduced motion mode
