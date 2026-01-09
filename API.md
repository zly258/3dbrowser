# 3D Browser API Documentation

A high-performance 3D model browser based on Three.js, designed for BIM, architectural, and large-scale model visualization.

## Installation

```bash
npm install 3dbrowser
```

## Basic Usage

### SceneManager

The `SceneManager` is the core class for managing the 3D scene, cameras, and loaders.

```typescript
import { SceneManager } from '3dbrowser';

// Initialize
const container = document.getElementById('canvas-container');
const canvas = document.createElement('canvas');
container.appendChild(canvas);

const sceneMgr = new SceneManager(canvas);

// Load a model
sceneMgr.loadModelFiles([file1, file2], (progress, message) => {
  console.log(`Loading: ${progress}% - ${message}`);
});

// Fit view
sceneMgr.fitView();
```

### Main API Methods

#### `SceneManager`

- `loadModelFiles(files: File[], onProgress?: ProgressCallback): Promise<void>`
  Loads various 3D formats (.ifc, .glb, .gltf, .fbx, .obj, .stl, etc.).
- `addTileset(url: string, onProgress?: ProgressCallback): void`
  Loads a 3D Tileset from a URL.
- `clear(): Promise<void>`
  Clears the current scene.
- `setView(view: ViewName): void`
  Changes the camera view (e.g., 'top', 'bottom', 'front', 'back', 'left', 'right', 'se', 'sw', 'ne', 'nw').
- `fitView(): void`
  Zooms the camera to fit all objects in the scene.
- `setObjectVisibility(uuid: string, visible: boolean): void`
  Toggles visibility of a specific object or group.
- `removeModel(uuid: string): Promise<void>`
  Removes a model from the scene.
- `highlightObject(uuid: string | null): void`
  Highlights an object by its UUID.

#### `LoaderUtils`

- `processFiles(files: File[], onProgress?: ProgressCallback): Promise<void>`
  High-level helper to process multiple files and handle format detection.

## Supported Formats

- **BIM**: IFC (.ifc)
- **Standard**: GLB, GLTF, FBX, OBJ, STL, PLY, 3MF
- **Large Scale**: 3D Tiles (via tileset.json)
- **Custom**: LMB, LMBZ (Optimized compressed format)
- **High Performance**: NBIM (Binary chunks)

## Customization

### SceneSettings

You can customize the scene behavior through the settings object:

```typescript
sceneMgr.updateSettings({
  viewCubeSize: 120,
  ambientInt: 1.0,
  dirInt: 1.5,
  bgColor: '#f0f0f0',
  enableInstancing: true
});
```

## Localization

The library supports multiple languages (default: Chinese and English).

```typescript
import { getTranslation } from '3dbrowser';

const label = getTranslation('en', 'menu_open_file'); // "Open File"
```
