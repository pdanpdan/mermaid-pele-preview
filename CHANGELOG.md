# Changelog

All notable changes to this extension are documented here.

## [0.4.0] - 2026-10-24

### Changed

- Updated Pele to 1.9.0. Diagram labels now support `<sub>`, `<sup>`,
  `<code>`, `<kbd>`, `<samp>`, `<tt>`, `<u>`, `<ins>`, `<var>`, `<cite>`, and
  `<dfn>`.

## [0.3.1] - 2026-10-21

### Fixed

- Icons inside nodes with an explicit label color now use that color in light
  mode instead of inheriting the diagram foreground.

## [0.3.0] - 2026-10-20

### Added

- Math labels in Pele diagrams. `$$...$$` expressions are typeset locally with
  Temml and work in flowcharts, sequence diagrams, state diagrams, class
  diagrams, ER diagrams, mindmaps, kanban boards, block diagrams, requirement
  diagrams, and use case diagrams.
- External icon packs configured with `mermaidView.iconPack`. The repository
  ships a generated, gzipped Font Awesome Free pack in
  `icons/font-awesome.json.gz`; icon
  artwork is no longer bundled in the extension.
- Icon packs support path-based icons and sanitized SVG bodies, plus aliases
  for mapping other icon sets onto names Pele passes.
- The **Mermaid: Download Font Awesome Icon Pack** command downloads the pack
  from GitHub and configures `mermaidView.iconPack`.
- `mermaidView.themeFile` loads Pele CSS variables from a JSON file with
  `light`, `dark`, or both palettes.
- Complete light/dark example themes for Solarized, Monokai, Neutral,
  Material, Paper, and Gruvbox in `examples/themes/`.

### Changed

- The toolbar and its buttons now follow the diagram's forced light or dark theme.
- Removed the rounded container behind the diagram toolbar.
- Updated Pele to 1.8.0.
- Updated TypeScript, markdown-it, esbuild, oxlint, vsce, and pnpm.

### Fixed

- Custom theme files now fall back to the matching built-in light/dark palette
  for omitted variables in `auto` mode, instead of producing a hybrid palette.
- Exported SVGs now embed literal resolved colors instead of CSS variables, so
  standalone viewers render the intended foreground and icons on the exported
  background.
- Type imports after the markdown-it 15 update.
- Node type resolution after the `@types/node` update.

## [0.2.0] - 2026-10-19

### Added

- Per-diagram light and dark theme buttons.
- Save SVG action for custom editors and Markdown previews.
- Zoom percentage, zoom in/out, and Fit controls.
- `mermaidView.theme` and `mermaidView.fontFamily` settings.

### Changed

- Zoom steps snap to whole 100% levels.
- Wide diagrams are fitted to the available width and refit when resized.

## [0.1.0] - 2026-10-19

### Added

- Initial release.
- `.mmd` and `.mermaid` custom preview editors.
- Mermaid fenced code block rendering in Markdown previews.
- Pele rendering with no Mermaid.js runtime.
