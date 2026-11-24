<h1 align="center">3dbrowser</h1>

<p align="center">A browser-based 3D and BIM model viewer and React component library engineered for large-scale models with six-figure component counts.</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-React%2019%20%2B%20Three.js-3776AB?style=flat-square" alt="TypeScript, React 19, and Three.js"> <img src="https://img.shields.io/badge/Platform-WebGL2%20Browser-4B5563?style=flat-square" alt="Platform: WebGL2 Browser"> <a href="https://zly258.github.io/3dbrowser/"><img src="https://img.shields.io/badge/Demo-GitHub%20Pages-0891B2?style=flat-square" alt="Live Demo on GitHub Pages"></a> <a href="https://github.com/zly258/3dbrowser/actions/workflows/deploy-pages.yml"><img src="https://img.shields.io/github/actions/workflow/status/zly258/3dbrowser/deploy-pages.yml?branch=main&label=CI&style=flat-square" alt="CI Status"></a> <a href="./LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-22C55E?style=flat-square" alt="License: GPL-3.0"></a> <a href="https://ifdian.net/order/create?user_id=3db8e630e6dc11f1b37452540025c377"><img src="https://img.shields.io/badge/Afdian-Sponsor-7C3AED?style=flat-square" alt="Sponsor on Afdian"></a>
</p>

`3dbrowser` is a React 19 and Three.js viewer designed for inspecting large BIM and CAD assemblies directly in a browser tab. Instead of treating BIM as an add-on to a generic mesh viewer, its memory model, octree chunk streaming, instance-level picking, box selection, and lazy property indexing are built around six-figure component counts.

It reads and exports a custom single-file container (**NBIM v11**, `.nbim`) that packs quantized geometry, an indexed property database, and the scene structure tree into one file, streaming chunks by priority so the first interactive frame appears before all chunks finish loading.

## Highlights

| Highlight | Why it matters |
| --- | --- |
| Octree chunk streaming with `BatchedMesh` | Groups 231,000+ components into a few hundred draw calls and opens a 2.9 GB NBIM v11 model in seconds while keeping the JS heap under ~3 GB. |
| Budget-aware memory residency | Computes `maxLoadedChunks`, `maxCachedChunks`, and `maxConcurrentChunkLoads` from heap limits and manifest memory stats, recycling distant chunks as the camera moves. |
| Multi-format BIM, CAD, and 3D support | Loads IFC (`web-ifc`), STEP/IGES (`occt-import-js`), GLB/GLTF, FBX, OBJ, STL, PLY, 3DS, DAE, and native NBIM v11, with CPU-only offline conversion into NBIM v11. |
| High-scale inspection and picking | Resolves exact instances on click via `batchId` maps, culls box selection by chunk bounds (~70 ms for 33,588 components), and loads properties lazily when counts exceed 20,000 documents. |
| Embeddable React component and MD3 UI | Exposes `<ThreeViewer />` and `SceneManager` with light/dark themes, runtime English/Chinese switching, measurement, sectioning, clash detection, explode view, viewpoints, and screenshots. |

## Architecture

The codebase separates React UI orchestration, Three.js scene/chunk streaming, and binary container/format decoding into three layers:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                   React UI & Viewer State (src/ThreeViewer.tsx)            │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  Components & Theme  │  │     Viewer Hooks     │  │  Selection &     │  │
│  │  Toolbar, ToolsDock, │  │  File loading, stats │  │  Lazy Property   │  │
│  │  SceneTree, Panels   │  │  viewpoints, search  │  │  Index (viewer/) │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ API calls / callbacks
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              Scene & Chunk Streaming Engine (src/utils/scene-manager/)     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  SceneManager Core   │  │  Chunk Scheduling &  │  │  Tools & Picking │  │
│  │  On-demand render,   │─▶│  BatchedMesh Pool    │  │  batchId pick,   │  │
│  │  camera, visibility  │  │  + chunkWorker.ts    │  │  boxSelect, clip │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────┘  │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │ NBIM v11 I/O                         │ Format loaders
                   ▼                                      ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│   NBIM v11 Core (scene-core/)       │  │   Format Loaders (src/loader/)    │
│   nbimIO.ts  · nbimChunk.ts         │  │   ifcLoader.ts   (web-ifc)        │
│   nbip.ts    · codec.ts             │  │   occtLoader.ts  (occt-import-js) │
│   [Header|Chunks|NBIP|Manifest]     │  │   Three loaders + public/libs/    │
└─────────────────────────────────────┘  └───────────────────────────────────┘
```

### NBIM v11 Single-File Container

An `.nbim` v11 file lays out a 1024-byte little-endian header, followed by quantized chunk payloads, an NBIP block-compressed property section, and a compressed manifest:

| Field | Value |
| --- | --- |
| Magic | `NBM1` (`0x314d424e`) |
| Version | `11` |
| Header size | `1024` bytes |
| Flags | bit 0: manifest gzip; bit 1: property block-gzip; bit 2: manifest brotli |

Geometry is quantized per chunk (int16 positions with per-chunk scale/offset, int8 normals restored on GPU, u16/u32 indices). Properties use a deduplicated string pool and columnar records split into independently compressed blocks so single-component lookups do not load the entire property section.

## Quick Install

Prerequisites: **Node.js >= 20** (CI runs Node.js 22) and a modern browser with **WebGL2**.

```bash
git clone https://github.com/zly258/3dbrowser.git
cd 3dbrowser
npm ci
```

If you embed `ThreeViewer` inside another host application, copy `public/libs` (WASM and worker decoders for `web-ifc`, `occt-import-js`, Draco, and Basis) into your host's static directory and configure `libPath` if it is not served at `./libs`.

## Quick Start

### Run the local viewer

Start the Vite development server:

```bash
npm run dev
```

Open `http://localhost:5173` in a WebGL2-capable browser, then drag and drop an `.nbim`, `.ifc`, `.glb`, `.step`, or other supported model into the viewport.

### Embed as a React component

```tsx
import { ThreeViewer } from './src';

export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ThreeViewer
        libPath="/libs"
        defaultTheme="dark"
        defaultLang="en"
        showStats
        initialFiles={['https://example.com/models/building.glb']}
        onSelect={(uuid, object) => console.log('Selected:', uuid, object)}
      />
    </div>
  );
}
```

## Commands

All scripts below are defined in `package.json`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port `5173`. |
| `npm run build` | Build the ES library bundle, generate library TypeScript declarations, and run `scripts/post-build.js`. |
| `npm run build:pages` | Build the standalone GitHub Pages demo into `dist-pages/`. |
| `npm run preview` | Preview the production build locally via Vite. |
| `npm run typecheck` | Run TypeScript type checking (`tsc -p tsconfig.json --noEmit`). |
| `npm run lint` | Run ESLint across `src` and `scripts`. |
| `npm run test:nbim` | Run the 28-check NBIM v11 / NBIP round-trip self-test (`scripts/run.mjs nbim11-selftest`). |
| `npm run stats:nbim -- <file.nbim>` | Print read-only container statistics for an `.nbim` file. |
| `npm run ui:audit:strict` | Audit design tokens, contrast, radius, z-index, and typography ladders in strict mode. |
| `npm run ui:coverage` | Verify that every `className` used in TSX has a corresponding CSS rule. |
| `npm run check` | Run `typecheck`, `lint`, `test:nbim`, `ui:audit:strict`, and `ui:coverage` together. |

## API Example

### `ThreeViewer` Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `libPath` | `string` | `'./libs'` | Path to the folder containing WASM/worker decoders (relative to `window.location`). |
| `allowDragOpen` | `boolean` | `true` | Allow opening models via drag and drop. |
| `hiddenMenus` | `string[]` | `[]` | Menu and tool IDs to hide (see list below). |
| `defaultTheme` | `'light' \| 'dark'` | `'light'` | Initial theme when no local preference is saved. |
| `defaultLang` | `'zh' \| 'en'` | `'en'` | Initial UI language when no local preference is saved. |
| `showStats` | `boolean` | `true` | Show the performance statistics panel. |
| `showOutline` | `boolean` | `true` | Show the scene structure tree panel. |
| `showProperties` | `boolean` | `true` | Show the object properties panel. |
| `initialSettings` | `Partial<SceneSettings>` | — | Initial scene settings (lighting, background, and display options). |
| `initialFiles` | `string \| File \| (string \| File)[]` | — | File(s) or URL(s) loaded on mount (individual files only, not folders). |
| `onSelect` | `(uuid: string, object: any) => void` | — | Callback invoked when an object or instance is selected. |
| `onLoad` | `(manager: SceneManager) => void` | — | Callback invoked once `SceneManager` is initialized. |
| `hideDeleteModel` | `boolean` | `false` | Hide the delete-model action. |
| `performancePreset` | `PerformancePreset` | `'quality'` | Rendering and memory preset. |
| `chunkOptions` | `SceneChunkOptions` | — | Overrides for chunk cache size, memory budget, concurrency, and LOD behavior. |

Valid `hiddenMenus` IDs: `file`, `open_file`, `open_url`, `export`, `batch_convert`, `clear`, `view`, `fit_view`, `views`, `interface`, `outline`, `props`, `pick`, `tool`, `measure`, `boxSelect`, `clip`, `viewpoint`, `screenshot`, `search`, `clash`, `explode`, `settings`, `about`, `stats`, `sun`.

### Programmatic Control via `SceneManager`

```ts
import type { SceneManager } from './src';

const handleLoad = (manager: SceneManager) => {
  manager.fitView(); // Frame visible geometry
  manager.setView('front'); // front | back | top | bottom | left | right | se | sw | ne | nw
  manager.loadNbim('path/to/model.nbim');
};
```

Additional `SceneManager` methods include `removeModel`, `clear`, `exportNbim`, `getCameraState`, `getMemoryReport`, `fitViewToObject`, `collectBoundsForUuids`, `applyVisibilityBatch`, `getNbimProperties`, and `getNbimIfcPropertyGroups`.

## Configuration and Integrations

### Supported Formats

| Category | Formats |
| --- | --- |
| BIM | IFC (via `web-ifc`) |
| Standard 3D | GLB / GLTF, FBX, OBJ, STL, PLY, 3DS, DAE |
| CAD | STEP / STP, IGES / IGS (via `occt-import-js`) |
| Native | NBIM v11 (`.nbim`) |

### Measured Scale and Known Limits

Measurements below were recorded on anonymized production models in **headless Chrome with software (SwiftShader) rendering** as a conservative baseline (GPU-accelerated browsers perform faster):

- **Reference model**: 140 source steel-structure files merged into one **2.9 GB** NBIM v11 file (231,353 component nodes, 52,506,466 unique triangles, 737,330 instances, 968,683 rendered instances, 186,284,229 rendered triangles).
- **Runtime**: First interactive frame in **3.0 – 4.5 s**; orbiting JS heap steady at **2.0 – 3.1 GB**; ~26 fps overview and ~54 fps close-up under SwiftShader; full-screen box selection of 33,588 components in **~70 ms**; adaptive device pixel ratio `0.8 -> 1.0` during/after dragging.
- **NBIM v11 compression**: Across a 305-file batch (15.28 GB), output shrank to **0.303 GB** (**50.5x** overall; individual models ranged from 49.4x to 78.3x).
- **Known limits**:
  - **NBIM v11 only**: Legacy NBIM v8/v9 files are rejected with an explicit format message.
  - **Streaming residency**: Oversized models (such as a 2.9 GB / 1,271-chunk file) keep ~400 chunks resident within a 4 GB JS heap; distant chunks render as ghost wireframes until they enter budget.
  - **Lazy property search**: Models with more than 20,000 property documents build the search index on first search.
  - **Edge depth cap**: Realistic CAD-style edges are applied to nearest chunks on very large models.

### UI Design System

Tokens live in `src/styles/variables.css` and are consumed by modular stylesheets imported via `src/styles/index.css`. The layout uses a 44px top bar, three-column shell (left outline, flex viewport, right properties), and 24px status bar, with Material Design 3 geometry (12px body, 26px controls, pill buttons) and `.theme-dark` token overrides. Run `npm run ui:audit:strict` and `npm run ui:coverage` after style edits.

## Community & Support

- **Live Demo**: [zly258.github.io/3dbrowser](https://zly258.github.io/3dbrowser/)
- **Bug Reports & Feature Requests**: [GitHub Issues](https://github.com/zly258/3dbrowser/issues)
- **Sponsor**: [Direct Sponsor on Afdian](https://ifdian.net/order/create?user_id=3db8e630e6dc11f1b37452540025c377) | [Creator Profile on Afdian](https://ifdian.net/a/zhangly1403)

## License

This project is licensed under the [GNU General Public License v3.0](./LICENSE) (GPL-3.0).
