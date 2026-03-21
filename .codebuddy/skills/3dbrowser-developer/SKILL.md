---
name: 3dbrowser-developer
description: This skill should be used when working with the @zhangly1403/3dbrowser project - a high-performance 3D model viewer library based on Three.js, React, and TypeScript. It provides specialized knowledge about the project's architecture, coding standards, component patterns, Three.js integration, BIM/IFC handling, and development workflows.
---

# 3DBrowser Developer Skill

This skill provides comprehensive guidance for developing, extending, and maintaining the @zhangly1403/3dbrowser library - a professional 3D model viewer supporting IFC, GLB, 3D Tiles, and other formats.

## When to Use This Skill

Use this skill when:
- Developing new features for the 3DBrowser library
- Modifying existing 3D viewer components
- Working with Three.js rendering and scene management
- Implementing BIM/IFC model loading and processing
- Adding or modifying UI components and tools
- Debugging performance issues in 3D rendering
- Writing tests for 3D functionality
- Creating documentation or examples

## Project Architecture Overview

The project follows a modular architecture with clear separation of concerns:

```
src/
├── components/       # React UI components
├── loader/          # Model format loaders (IFC, GLB, etc.)
├── styles/          # Global CSS styles
├── theme/           # Theming and localization
└── utils/           # Core utilities (SceneManager, etc.)
```

### Key Architectural Patterns

**SceneManager Pattern**: Centralized 3D scene management
- Singleton pattern for scene state
- Encapsulates Three.js initialization, rendering loop, and resource management
- Provides API for model loading, selection, measurement, and clipping

**Component Pattern**: React components with Three.js integration
- Use `useEffect` for Three.js initialization
- Use `useRef` to store Three.js objects
- Clean up resources in effect cleanup functions

**Loader Pattern**: Async model loading with progress callbacks
- All loaders implement progress reporting
- Return model UUID for reference
- Handle errors gracefully

## Development Standards

### TypeScript Guidelines

**Strict Type Checking**: All code must use TypeScript with strict mode enabled. Avoid `any` types; use `unknown` or specific interfaces instead.

```typescript
// Good
export interface SceneSettings {
  ambientInt: number;
  dirInt: number;
  bgColor: string;
}

// Bad
function processData(data: any) { ... }
```

**Exported Types**: All public APIs must export TypeScript interfaces and types for external consumers.

### React Best Practices

**Functional Components**: Use functional components with hooks exclusively. No class components.

**Hooks Optimization**: Always use `useMemo` and `useCallback` for expensive computations and stable function references.

```typescript
const memoizedData = useMemo(() => computeExpensiveValue(a, b), [a, b]);
const handleClick = useCallback(() => { /* ... */ }, [deps]);
```

**Effect Cleanup**: Always clean up Three.js resources in effect cleanup functions.

```typescript
useEffect(() => {
  const geometry = new THREE.BoxGeometry();
  return () => {
    geometry.dispose();
  };
}, []);
```

### Three.js Standards

**Resource Management**: Always dispose of Three.js objects (geometries, materials, textures) when no longer needed.

**Coordinate System**: Use world coordinates consistently. Handle large coordinate offsets via `globalOffset` in SceneManager.

**Performance Optimization**:
- Use instanced rendering for repeated geometry
- Implement frustum culling
- Use BatchedMesh for large models
- Minimize draw calls

**Units**: Use meters for all distance measurements.

### Component Development

**File Naming**: Use PascalCase for components (e.g., `ThreeViewer.tsx`, `PropertiesPanel.tsx`).

**Props Interface**: Export props interfaces separately.

```typescript
export interface MyComponentProps {
  prop1: string;
  prop2?: number;
  onEvent?: (data: any) => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ prop1, prop2, onEvent }) => {
  // Implementation
};
```

**Component Structure**: Follow this order within components:
1. Type definitions and interfaces
2. Hooks (useState, useEffect, useMemo, useCallback, useRef)
3. Derived state and computations
4. Event handlers
5. Effect hooks
6. Render helpers
7. JSX return

## Three.js Integration Guidelines

### Scene Initialization

Use the `SceneManager` class for all 3D scene operations. The SceneManager handles:
- WebGL renderer setup
- Camera and controls
- Lighting setup
- Scene hierarchy management
- Rendering loop

### Model Loading

Load models through SceneManager APIs:
- `loadFile(file: File | string): Promise<string>`
- `loadNbim(url: string): Promise<string>`
- `loadIFC(file: File): Promise<string>`
- `loadGlTF(url: string): Promise<string>`

All loaders return a UUID that identifies the loaded model.

### Selection and Highlighting

Implement selection through SceneManager:
- `selectObject(uuid: string): void`
- `clearSelection(): void`
- `setHighlighted(uuids: string[]): void`

Selection state must be reflected in UI components (scene tree, properties panel).

### Measurement Tools

The measurement system supports three types:
- Distance (dist): Two points
- Angle: Three points (start-vertex-end)
- Coordinate: Single point

Measurements are persisted as `MeasurementRecord` objects.

### Clipping/Sectioning

Clipping is implemented via Three.js clipping planes:
- Enable via `enableClipping(enable: boolean)`
- Set planes via `setClipPlane(axis: 'x' | 'y' | 'z', constant: number)`
- Visualize clipping planes with helpers

## BIM/IFC Handling

### IFC Loading

IFC files are loaded using web-ifc library. Key considerations:
- IFC files require WASM workers
- Parse in web workers to avoid blocking UI
- Extract BIM metadata for properties panel
- Map IFC entity IDs to Three.js objects

### NBIM Format

NBIM is a custom high-performance format:
- Chunked loading for large models
- Instanced rendering for repeated elements
- Optimized for web delivery
- Uses octree for spatial queries

## UI/UX Guidelines

### Design System

The project uses a CAD-style design system with:
- Dark mode (default) and light mode
- CSS variables for theming
- Consistent spacing and sizing
- Three font size levels: compact (11px), medium (12px), loose (14px)

### Component Styling

Use the CSS classes defined in `src/styles/index.css`:
- `.ui-panel`: Floating panels with header and content
- `.ui-btn`: Button variants (default, primary, ghost)
- `.ui-input`: Form inputs with focus states
- `.ui-toolbar`: Toolbar layout
- `.ui-statusbar`: Status bar layout

### Localization

All user-facing text must be internationalized:
- Add translations to `src/theme/Locales.ts`
- Use `getTranslation(lang, key)` for translations
- Support both Chinese (zh) and English (en)

## Testing Guidelines

### Unit Tests

Write unit tests for:
- Utility functions (math, conversion, etc.)
- Loader logic (where feasible)
- Helper functions

Use Jest with React Testing Library.

### Integration Tests

Test:
- Model loading workflow
- Selection flow
- Measurement tool interactions
- Settings persistence

### Performance Testing

Ensure:
- 60 FPS target for typical scenes
- Memory usage under limits
- Fast model loading (<3s for initial load)

## Error Handling

### Loading Errors

Provide clear error messages for:
- Unsupported file formats
- Corrupted model files
- WebGL not supported
- Insufficient memory

### Runtime Errors

Wrap Three.js operations in try-catch blocks. Provide user-friendly error messages and recovery options.

### Error Logging

Log errors to console with sufficient context. Consider integrating error tracking in production.

## Build and Release

### Build Process

The build process:
1. `vite build`: Builds the library
2. `tsc -p tsconfig.lib.json`: Generates TypeScript declarations
3. Copy dist to example directory

### Version Management

Follow semantic versioning (MAJOR.MINOR.PATCH):
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

### Package Contents

The npm package includes:
- dist/3dbrowser.es.js (ES module)
- dist/3dbrowser.umd.js (UMD bundle)
- dist/index.d.ts (TypeScript declarations)
- README.md
- LICENSE

## Code Quality

### Linting

Use ESLint for code quality. Run linting before commits:
```bash
npm run lint
```

### Formatting

Use Prettier for consistent code formatting.

### Code Review

All changes should undergo code review focusing on:
- TypeScript correctness
- Three.js best practices
- Performance implications
- Documentation completeness

## Documentation

### Code Comments

Add JSDoc comments for all exported functions and interfaces:
```typescript
/**
 * Loads a 3D model from the given file or URL
 * @param source - File object or URL string
 * @param progress - Progress callback (0-100)
 * @returns Promise resolving to model UUID
 */
export async function loadModel(
  source: File | string,
  progress?: (percent: number) => void
): Promise<string> {
  // Implementation
}
```

### README Updates

Update README.md when:
- Adding new features
- Changing public APIs
- Adding supported formats
- Updating dependencies

## Common Patterns

### Custom Hooks

Create reusable hooks for common Three.js patterns:
```typescript
function useSceneManager() {
  const [manager, setManager] = useState<SceneManager | null>(null);
  // Implementation
  return manager;
}
```

### Event Handlers

Use useCallback for event handlers to prevent unnecessary re-renders:
```typescript
const handleSelect = useCallback((uuid: string) => {
  manager?.selectObject(uuid);
}, [manager]);
```

### Async Operations

Handle async operations with proper error handling:
```typescript
useEffect(() => {
  let cancelled = false;
  
  async function load() {
    try {
      const uuid = await manager.loadFile(file);
      if (!cancelled) {
        onLoaded?.(uuid);
      }
    } catch (error) {
      if (!cancelled) {
        console.error('Load failed:', error);
      }
    }
  }
  
  load();
  return () => { cancelled = true; };
}, [file, manager, onLoaded]);
```

## Performance Optimization Strategies

### Rendering Optimization

- Use `requestAnimationFrame` for animations
- Minimize state updates during render loop
- Batch geometry updates
- Use instanced rendering for repeated objects

### Memory Optimization

- Dispose unused Three.js objects
- Use object pooling for temporary objects
- Limit scene complexity
- Implement level-of-detail (LOD) for large scenes

### Loading Optimization

- Use Web Workers for parsing
- Implement progressive loading
- Cache loaded models
- Lazy-load resources

## Security Considerations

### File Uploads

- Validate file types and sizes
- Sanitize file names
- Use FileReader with error handling

### User Input

- Validate all user inputs
- Sanitize user-provided URLs
- Prevent XSS in UI rendering

## Browser Compatibility

### Supported Browsers

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Feature Detection

Check for WebGL 2.0 support:
```typescript
if (!window.WebGL2RenderingContext) {
  showError('WebGL 2.0 is required but not supported');
}
```

## Debugging Tips

### Three.js Debugging

- Use `THREE.Object3D.userData` to attach debug info
- Enable WebGL debugging flags in development
- Use browser devtools for performance profiling

### Common Issues

**Black screen**: Check WebGL context, camera position, scene contents.

**Performance issues**: Profile with browser devtools, check for excessive draw calls, verify resource disposal.

**Selection not working**: Check raycaster setup, verify object visibility, ensure proper bounding boxes.

## Referenced Resources

This skill references the following resources located in the references/ directory:
- `architecture.md`: Detailed architecture documentation
- `threejs-best-practices.md`: Three.js specific best practices
- `bim-ifc-guide.md`: BIM/IFC handling guide
- `component-patterns.md`: React component patterns

When complex details are needed, consult these reference files for comprehensive information.

## Tool Integration

This project includes scripts for common development tasks:
- `scripts/build.sh`: Build the library
- `scripts/test.sh`: Run test suite
- `scripts/format.sh`: Format code with Prettier

Execute these scripts when performing the corresponding development tasks.
