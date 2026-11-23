# 3dbrowser

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Afdian](https://img.shields.io/badge/Afdian-Sponsor-946CE6)](https://ifdian.net/order/create?user_id=3db8e630e6dc11f1b37452540025c377)

> **中文文档 → [README.zh-CN.md](README.zh-CN.md)**

A browser-based 3D/BIM model viewer built for models that are too large for ordinary web viewers. One 2.9 GB NBIM file — 231,353 components, 186 million rendered triangles — opens in seconds in a single tab and keeps the JS heap under ~3 GB.

React 19 · Three.js · TypeScript · NBIM v11

---

## What it is

`3dbrowser` is a React component library and application for inspecting large BIM/3D models in the browser. It reads a custom single-file container (**NBIM v11**) that packs geometry, properties and the structure tree into one file, and streams it in octree chunks so the first frame appears long before the last chunk has arrived.

It is not a general-purpose glTF viewer with BIM bolted on: the memory model, picking, box selection and property search are all designed around six-figure component counts.

---

## Features

**Formats**

| Category | Formats |
| --- | --- |
| BIM | IFC (via `web-ifc`) |
| Standard | GLB / GLTF, FBX, OBJ, STL, PLY, 3DS, DAE |
| CAD | STEP / STP, IGES / IGS (via `occt-import-js`) |
| Native | **NBIM v11** (`.nbim`) |

**Viewing and inspection**

- **Measurement** — distance, angle and point coordinates.
- **Sectioning** — real-time clipping planes, with the range recalculated from the current model.
- **Scene tree** — hierarchical structure with search, visibility toggles and locate-to-view.
- **Properties** — per-component metadata, resolved on demand.
- **Display styles** — *Shaded* (solid only) and *Realistic* (shaded + CAD-style edges: hard edges on beams, vertical seams and end rings on cylinders). The style is read from the locally remembered preference; there is no toolbar toggle.
- **Box selection** — full-screen marquee that stays responsive at six-figure component counts.
- **Instance-level picking** — one click resolves the exact instance under the cursor, highlights only that instance with a glow, and the highlight colour is configurable.
- **Clash detection, explode view, viewpoints, screenshots** — available from the tool menu.

**Interface**

- Material Design 3 language: 44px top bar, three-column shell, 24px status bar, pill buttons, frosted dropdowns.
- **Tools dock** — the tool strip can live in the top bar or as a bottom-centred capsule dock, rendered icon-only or icon-over-text.
- Light and dark themes driven by the same token set.
- Chinese and English, switchable at runtime.

**Offline conversion**

- Raw sources (IFC / GLB / FBX / OBJ / …) can be merged into a single NBIM v11 file on the CPU — no GPU, no VRAM required.

---

## Measured scale

Numbers below come from real production models. File names, paths, customer and project details have been removed; only aggregate geometry counts and timings are kept. All timings were measured in **headless Chrome with software (SwiftShader) rendering** — a deliberately pessimistic baseline. A real GPU is faster.

### Model scale

| Metric | Model A (multi-file steel structure) |
| --- | ---: |
| Source files | 140 |
| Component nodes | 231,353 |
| Unique triangles | 52,506,466 |
| Instances | 737,330 |
| Rendered instances | 968,683 |
| Rendered triangles | 186,284,229 |

Merged into one NBIM, Model A becomes a **2.9 GB** single file opened as one document.

### Runtime

| Metric | Result | Note |
| --- | --- | --- |
| First interactive frame (2.9 GB NBIM) | 3.0 – 4.5 s | progressive: usable before every chunk has landed |
| JS heap while orbiting the full model | 2.0 – 3.1 GB, stable | previously 3.5 → 7.5 GB, ending in OOM |
| Overview frame rate | ~26 fps | software rendering |
| Close-up frame rate | ~54 fps | software rendering |
| Full-screen box select, 33,588 components | ~70 ms | marquee covering the whole viewport |
| Device pixel ratio while dragging → after release | 0.8 → 1.0 | adaptive quality |

### Compression (NBIM v11)

| Model | Source | NBIM v11 | Ratio | Chunks | Components |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 1162 MB | **22.3 MB** | 49.6× | 464 | 146,407 |
| B | 912 MB | **17.6 MB** | 49.4× | 319 | 114,909 |
| C | 633 MB | **9.8 MB** | 61.4× | 108 | 78,822 |
| F | 34 MB | **0.43 MB** | 78.3× | 8 | 2,424 |

A batch of 305 files (15.28 GB) converted to **0.303 GB** — **50.5×** overall.

---

## Why it holds up

- **Chunked NBIM + `BatchedMesh`.** Geometry is split into octree chunks and drawn as one `BatchedMesh` per chunk, so 231k components cost a few hundred draw calls instead of 231k.
- **Budget-aware residency.** `maxLoadedChunks` / `maxCachedChunks` / `maxConcurrentChunkLoads` are derived from the JS heap limit, the *actual* decoded geometry from `manifest.stats.memory`, and a measured ~4× BatchedMesh footprint factor. When the whole model fits it loads completely; when it does not, chunks load by screen centrality/distance until the memory budget is reached, and far/stale chunks are recycled as the camera moves.
- **Quantised geometry.** Position int16 with per-chunk scale/offset, normals int8 (restored by GPU normalisation), indices u16/u32, and gzip/brotli-compressed chunk payloads.
- **On-demand rendering.** A frame is drawn only when something changed (camera, loading, selection), so an idle viewer costs almost nothing.
- **Priority-driven loading.** Oversized models load the most central/near chunks first; selection and picking work on every loaded chunk.
- **Instance-aware picking.** `batchId` → uuid/source maps resolve one specific instance per click, and box selection culls whole chunks by bounding box before touching individual instances.
- **Lazy property index.** Above 20,000 property documents the index stays out of memory and is resolved on selection; search builds it once, in a single pass.
- **Per-instance geometry views on demand.** Picking uses bounding boxes only; edges/collision/area build a zero-copy view and release it immediately.

---

## Known limits

- **NBIM is the fast path.** Source models should be exported as a single NBIM v11 file. Raw multi-file sources spend their load time in conversion rather than streaming.
- **v11 only.** Older NBIM files (v8/v9) are rejected with an explicit message: *"This is a legacy NBIM (v8/v9) file; the current version no longer supports the old format — use a v11 single file (.nbim)."*
- **Huge models are streamed, not all-resident.** A 2.9 GB / 1,271-chunk NBIM keeps roughly 400 chunks resident in a 4 GB JS heap (~1.9 GB decoded geometry, ~3.4–3.5 GB total heap). Loading all 1,271 at once would need ~9 GB and risks OOM. Distant/unvisited chunks stay as ghost wireframe until they enter the budget.
- **First property search may take a moment** on models carrying more than 20,000 property documents, because the index is built on first use.
- **Software-rendered FPS is a floor, not a target.** The numbers above were measured without a GPU; GPU-backed browsers are considerably faster.
- **Realistic edges are depth-capped.** On very large models only the nearest chunks get edges; distant edges are not visible at typical zoom levels anyway.

---

## Getting started

Requirements: **Node.js ≥ 20**, a modern browser with WebGL2.

```bash
git clone https://github.com/zly258/3dbrowser.git
cd 3dbrowser
# install dependencies with your package manager, following package-lock.json
node node_modules/vite/bin/vite.js      # dev server → http://localhost:5173
```

Production build:

```bash
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc -p tsconfig.lib.json --skipLibCheck
node scripts/post-build.js
```

### Assets

The WASM and worker decoders for IFC and OCC live in `public/libs` (web-ifc, occt-import-js, Draco, Basis). When embedding the viewer in another host page, copy `public/libs` into that host's static folder and pass `libPath` if it is not served at `./libs`.

### Using the component

```tsx
import { ThreeViewer } from './src';

function App() {
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

---

## API reference

### `ThreeViewer` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `libPath` | `string` | `'./libs'` | Path to the folder containing WASM/worker files (relative to `window.location`) |
| `allowDragOpen` | `boolean` | `true` | Allow opening files by drag and drop |
| `hiddenMenus` | `string[]` | `[]` | Menu/tool IDs to hide. See below |
| `defaultTheme` | `'light' \| 'dark'` | `'light'` | Default appearance when no local preference is saved (dark also sets the viewport colour) |
| `defaultLang` | `'zh' \| 'en'` | `'en'` | Default UI language |
| `showStats` | `boolean` | `true` | Show the performance statistics panel |
| `showOutline` | `boolean` | `true` | Show the scene structure panel |
| `showProperties` | `boolean` | `true` | Show the object properties panel |
| `initialSettings` | `Partial<SceneSettings>` | — | Initial scene settings (lighting, background, …) |
| `initialFiles` | `string \| File \| (string \| File)[]` | — | URLs or files loaded on mount (single file or list; no folder picker) |
| `onSelect` | `(uuid: string, object: any) => void` | — | Called when an object is selected |
| `onLoad` | `(manager: SceneManager) => void` | — | Called once the scene manager is ready |
| `hideDeleteModel` | `boolean` | `false` | Hide the delete-model button |
| `performancePreset` | `PerformancePreset` | `'quality'` | Rendering/memory preset |
| `chunkOptions` | `SceneChunkOptions` | — | Chunk cache size, memory cap, concurrency |

`hiddenMenus` accepts: `file`, `open_file`, `open_url`, `export`, `batch_convert`, `clear`, `view`, `fit_view`, `views`, `interface`, `outline`, `props`, `pick`, `tool`, `measure`, `boxSelect`, `clip`, `viewpoint`, `screenshot`, `search`, `clash`, `explode`, `settings`, `about`, `stats`, `sun`.

### `SceneManager`

For advanced scenarios, interact with the manager directly through `onLoad`:

```ts
import type { SceneManager } from './src';

const handleLoad = (manager: SceneManager) => {
  manager.fitView();                  // frame the visible content
  manager.setView('front');           // front / back / top / bottom / left / right / se / sw / ne / nw
  manager.loadNbim('path/to/model.nbim');
};
```

Other useful members: `removeModel`, `clear`, `exportNbim`, `getCameraState`, `getMemoryReport`, `fitViewToObject`, `collectBoundsForUuids`, `applyVisibilityBatch`, `getNbimProperties`, `getNbimIfcPropertyGroups`.

---

## NBIM v11 container

One file, 1024-byte header, then chunk payloads, then a property section, then the manifest.

| Field | Value |
| --- | --- |
| Magic | `NBM1` (`0x314d424e`) |
| Version | `11` |
| Header | 1024 bytes |
| Flags | bit 0 manifest gzip · bit 1 property block · bit 2 manifest brotli |

Geometry is quantised per chunk (position int16 with per-chunk scale/offset, normals int8, indices u16/u32). Properties are stored as a deduplicated string pool plus columnar records, split into 64 KB blocks, so a single component's properties can be read without loading the whole property section.

The full specification lives in `docs/nbim11-format.md`, and measured statistics in `docs/stats-nbim11.md`.

---

## Repository layout

```
src/
  components/     React UI (toolbar, panels, tree, properties, view cube, tools dock)
  hooks/          viewer state, file loading, selection, search, viewpoints
  loader/         IFC / OCC loaders and resource resolution
  utils/
    scene-core/   NBIM v11 read/write, NBIP property database, chunk codecs
    scene-manager/ scene, chunks, picking, box select, edges, clipping, measurement
  styles/         hand-written CSS modules driven by tokens in variables.css
  theme/          icon set, locale dictionaries, theme manager
scripts/          build helper, UI audit, coverage check, NBIM self-test & stats
docs/             format spec, statistics, regression checklist (local only)
public/libs/      WASM/worker decoders (web-ifc, occt-import-js, Draco, Basis)
```

### Scripts

```bash
node scripts/run.mjs nbim11-selftest      # NBIM v11 round-trip self-test (28 checks)
node scripts/nbim-stats.mjs <file.nbim>   # read-only container statistics
node scripts/ui-audit.mjs --strict        # design tokens, contrast, radius/z-index/font ladders
node scripts/class-coverage.cjs           # every className used in TSX has a style rule
```

---

## UI style system

One light Material Design 3 CAD-viewer language, font stack `Nunito` / `Noto Sans SC` plus system CJK fallbacks. All tokens live in `src/styles/variables.css`; component styles are hand-written modules imported by `src/styles/index.css`.

- **Density**: 12px body, 26px controls, 11px captions, 24px status bar.
- **Shell**: 44px top bar + three columns (left `clamp(200px,20vw,264px)`, viewport `flex:1; min-width:0`, right `clamp(240px,25vw,340px)`) + 24px status bar. The page never scrolls; only panel bodies do.
- **Colour**: `#F8FAFC` page over `#FFFFFF` surfaces, `#1E293B` primary / `#475569` secondary text, `#E2E8F0` / `#F1F5F9` borders, single accent `#2563EB` plus danger/success/warn semantics — all ≥ 4.5:1.
- **Shapes**: pill (999px) buttons, 6px inputs, 12px menus and floating panels, 16px modals and loading card, 6px translucent capsule scrollbars.
- **States**: any rule that changes `background` also declares `color`; disabled states use token colours (never `opacity`); white text only on accent/danger/tooltip dark backgrounds.
- **Dark theme**: only token values change (`.theme-dark`), never component structure.

Verify before delivering:

```bash
node scripts/ui-audit.mjs --strict
node scripts/class-coverage.cjs
```

---

## Testing

- **Self-test** — `node scripts/run.mjs nbim11-selftest` runs 28 checks covering NBIP round-trip, the single-file end-to-end path, 5,000-component scale, index delta encoding, and string-pool edge cases (multi-byte, empty, very long, prefix sharing).
- **Regression checklist** — manual pass over load / tree / select / highlight / box select / properties / browsing / delete / multi-model, in `docs/testing/regression-checklist.md`.

---

## Support & Sponsorship

If this project helps your daily work, 3D inspection, or lightweight BIM workflows, feel free to sponsor the author via Afdian to support continuous development and feature iterations:

* **Direct Sponsor**: [Sponsor on Afdian](https://ifdian.net/order/create?user_id=3db8e630e6dc11f1b37452540025c377)
* **Creator Profile**: [zhangly1403 on Afdian](https://ifdian.net/a/zhangly1403)

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0).

Chinese documentation: [README.zh-CN.md](README.zh-CN.md)
