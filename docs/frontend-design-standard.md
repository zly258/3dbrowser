# 3DBrowser Frontend Design Standard

## Goal
Keep the UI in a professional tool style: compact, clear, low-noise, and optimized for long viewing sessions.

## Tokens
- Use CSS variables from [`src/styles/index.css`](D:\workspace\nodejs\3dbrowser\src\styles\index.css) for colors, borders, radius, spacing, shadows, and font sizing.
- New controls should prefer `var(--bg-primary)`, `var(--bg-panel)`, `var(--border-color)`, `var(--text-primary)`, `var(--text-secondary)`, and `var(--accent)`.
- Numeric readouts must use `font-variant-numeric: tabular-nums`.

## Interaction Patterns
- Use floating panels for multi-step tool workflows such as measure, clip, viewpoint, export, and settings.
- Use dropdowns for short one-shot actions with fewer than 6 options.
- Use right-click menus for object-scoped actions like focus, hide, isolate, and delete.
- Use the status bar for lightweight state feedback such as hidden-count, loading progress, and cursor coordinates.

## Layout Rules
- Panel content should be composed from `ui-panel-stack`, `ui-panel-section`, and `ui-form-row`.
- Labels stay left-aligned and fixed-width; controls stay right-aligned and stretch only when needed.
- Sidebars use `ui-sidebar`, `ui-sidebar-header`, and `ui-sidebar-resize`.
- High-frequency actions should stay within one click from toolbar, tree context menu, or status bar.

## Visual Rules
- Keep panel and sidebar borders visible to preserve spatial grouping.
- Avoid bright text colors for labels; accent color is for active state, selection, and slider progress only.
- Prefer shared utility classes over new inline hover logic.
- Empty states should be brief, centered, and muted.
