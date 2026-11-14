---
name: export
description: >
  Use when saving a @bruno00o/graph graph as a PNG image or an SVG document,
  choosing its region, scale, pixel ratio, labels and background, or exporting
  large graphs.
metadata:
  purpose: >
    Saving a mounted @bruno00o/graph graph as a PNG Blob or an SVG string with
    exportPng and exportSvg: what each one draws, region, scale and pixel ratio,
    labels, background, time window and flows, downloading the result, and the
    errors and limits.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/export/index.ts
  - docs/content/docs/(guide)/export.mdx
  - docs/content/docs/api/export.mdx
requires:
  - core
---

# Export a graph as PNG or SVG

Load the core skill first (`intent load @bruno00o/graph#core`). `@bruno00o/graph/export` turns a mounted graph into a file. Both functions are asynchronous, read the graph as it is when called (pending data is flushed first) and leave the graph on screen untouched.

| Function | Resolves to | How it draws |
| --- | --- | --- |
| `exportPng(graph, options?)` | A `Blob` of type `image/png` | Offscreen, in a WebGL2 context of its own freed at the end |
| `exportSvg(graph, options?)` | The text of an SVG document | Written from the scene, without reading pixels back: sharp at any size, selectable text |

For a graph on a map that must include the map tiles, `exportMapPng` from `@bruno00o/graph/map` does it (map skill); `exportPng` and `exportSvg` draw the graph alone.

## Setup

1. Mount the graph first (`mountGraph`, `<Graph>` or the map equivalents). A graph not made by one of them throws.
2. Import the functions and wrap the result in a download. A PNG is already a `Blob`; an SVG is a string, so wrap it in a `Blob` of type `image/svg+xml`.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { exportPng, exportSvg } from '@bruno00o/graph/export'

type Item = { id: string; name: string }
const items: Item[] = []

const definition = defineGraph({ marks: [nodes(items, { label: 'name' })] })
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

download(await exportPng(graph), 'graph.png')
download(new Blob([await exportSvg(graph)], { type: 'image/svg+xml' }), 'graph.svg')
```

The functions take a `GraphInstance`: a typed instance from `mountGraph` is accepted as is, so a helper can declare its parameter `GraphInstance` (`import type { GraphInstance } from '@bruno00o/graph'`) or a generic `GraphInstance<S>`. There is no flag to ask whether a graph is destroyed: await the export inside `try` and treat any rejection as a failure.

In React, read the graph with `useGraph()` inside `<Graph>`, or keep the instance from the `ref` (react skill), and call the same functions from an event handler.

## Core Patterns

### Options

Both functions take the same options, plus `pixelRatio` for the PNG and `embedImages` for the SVG. Every one is optional.

| Option | Values | Default |
| --- | --- | --- |
| `region` | `'view'`: what the graph shows now. `'graph'`: frames every node and every shape (a pinned one where it is drawn), plus the labels, loops and hulls that reach past them | `'view'` |
| `zoom` | Scale of the file, in CSS pixels per world unit | Current zoom of the view |
| `padding` | Margin around the content in CSS pixels. Used by `region: 'graph'` only. Finite, 0 or more | 32 |
| `labels` | `'visible'`: the screen rules (small labels hidden, no overlap). `'all'`: every label whatever its size or overlaps. `'none'` | `'visible'` |
| `background` | Any CSS color resolved with the current theme, a `--graph-*` token, or `'transparent'` | `'var(--graph-paper)'` |
| `time` | Moment, in milliseconds after they start, of the dashes of `flow` edges. The image is still | `0` |
| `window` | Time window of the export (`{ start, end }`), or `null` for every element whatever its time | The window of the graph |
| `pixelRatio` (PNG) | Image pixels per CSS pixel. Positive | Device pixel ratio of the graph |
| `embedImages` (SVG) | Copy every node image into the document as a data URL | `true` |

```ts
import { exportPng, exportSvg } from '@bruno00o/graph/export'
import type { GraphInstance } from '@bruno00o/graph'

declare const graph: GraphInstance

const framed = await exportPng(graph, { region: 'graph', padding: 48, pixelRatio: 2 })
const poster = await exportPng(graph, { region: 'graph', pixelRatio: 4, background: 'transparent' })
const readable = await exportSvg(graph, { region: 'graph', zoom: 2, labels: 'all', window: null })
const doubled = await exportSvg(graph, { zoom: graph.store.get().view.zoom * 2 })
const linked = await exportSvg(graph, { embedImages: false, background: '#ffffff' })
```

### Choose region, zoom and pixel ratio

- By default the file shows what the graph shows: same area, same zoom, same labels, grid, shapes and hulls. `region: 'graph'` frames every node and shape instead, which is the usual choice for a file meant to be read without the screen.
- `zoom` changes the scale of the content, with either region: it is the scale of the file in CSS pixels per world unit, so `zoom` alone sets the size of a `region: 'graph'` file. The current zoom of the view is `graph.store.get().view.zoom`: pass twice that value for twice the screen scale. Nodes sized in world units grow with it, while edge widths, labels and nodes with `units: 'screen'` keep their size in pixels, as when you zoom on screen. A larger `zoom` gives a larger file of the same region, never a crop.
- `pixelRatio` changes sharpness only: the number of image pixels per CSS pixel. The file is `CSS size x pixelRatio` pixels. Raise it for print.
- Past 4,096 pixels on a side the PNG is drawn in tiles, so its size is bounded by memory, not by the GPU. Labels are chosen once for the whole image, so none is cut or doubled at a tile edge. The PNG records its pixel density.
- Children of an unfolded group that are spread apart are drawn where the screen shows them; at another `zoom` their pixel gaps scale with it.

### What is in the file

- Drawn: node shapes, fills, strokes, outlines, halos and opacity; images cut to the node shape and icons tinted with their `color`; badges; unfolded groups as containers behind their children, folded groups as nodes; straight and curved edges, loops, dashes, dots, arrows, edge ends, bundled and routed paths; labels with their placement, color, weight, second line and background; the background grid; shapes from `shapes()` (just after the grid, under the containers); hulls (over the containers, under the edges); the state styles in force, such as selection and hover; the theme colors of the moment.
- Left out: HTML anchored with `graph.anchors` or `<Anchor>`, the minimap and the lens (they are not part of the scene), and elements outside the time window of the graph unless `window` says otherwise. Shapes follow the same rules as nodes: their states, raised ones, hidden ones, zoom range, time window and layers, and their labels are written too. On a graph on a map, the SVG draws the shapes on the flat map and `exportMapPng` draws them over the basemap.
- The background is `--graph-paper`, filled by the export. On screen the canvas is transparent and the page paints what lies under the graph, which an export cannot read: a CSS pattern on the container is not in the file. Draw it with the `background` grid of the definition, or export with `'transparent'` and lay the image over the same background.
- Edges with a `flow` are drawn as still dashes at `time`. At `0`, every pattern starts at the source of its edge, so two exports of the same graph match. The SVG holds no animation.
- SVG text uses the font of the theme and is not embedded: a viewer without that font falls back to another one, so labels may be a little wider or narrower. An image the browser cannot load, for lack of CORS headers for instance, is left out of the file as it is on screen. Great-circle edges (`geodesic`) are not drawn as arcs in an SVG, and the SVG of a graph on a map always draws the flat map.

### Large graphs

Both functions read the scene in one pass and build the output in memory. With 50,000 nodes and 100,000 edges, an SVG of the view takes about half a second and weighs about 25 MB, and a PNG of the view takes about the same time. Very large PNGs are encoded strip by strip (287 megapixels: about 11 seconds). For an SVG that heavy, prefer the PNG, or `labels: 'none'`, or a smaller region.

## Common Mistakes

### HIGH Exporting a destroyed graph

An export of a graph that was destroyed rejects with `graph: cannot export a destroyed graph`, like a graph not made by `mountGraph`. Export before `destroy()`, and catch the rejection when the graph can go away during the call (a route change, an unmount). In React, call the export from a handler while `<Graph>` is mounted.

### HIGH Not awaiting the export

Both functions return a promise. Passing it unawaited to a download helper, or calling `blob.size` on it, works on a promise, not on a file. Await it, and for the SVG wrap the string: `new Blob([svg], { type: 'image/svg+xml' })`.

### MEDIUM Expecting a transparent PNG by default

The default background is `--graph-paper` in the current theme, so a PNG from a dark page has the dark paper behind it. Pass `background: 'transparent'` for an empty background, or any CSS color.

### MEDIUM Expecting the page around the graph

An export draws the scene only: no CSS background on the container, no HTML overlays, no minimap, no lens, no map tiles. Anchored HTML cannot be exported.

### MEDIUM Mixing up zoom and pixel ratio

`zoom` rescales the content (world-sized nodes grow, edge widths and labels keep their pixel size), `pixelRatio` only adds pixels. A sharper print needs `pixelRatio`; a bigger area of detail needs `zoom`. Neither accepts zero, a negative number or `Infinity`: they throw a `RangeError`, as do a `padding` that is negative or not finite and a `time` that is not finite.

### MEDIUM Exporting a graph with no size

A graph whose element is hidden, or measures less than one pixel (`display: none`, a container with no height), has nothing to draw: the export rejects with a `RangeError` (`nothing to export`). Export a graph that is visible, or with `region: 'graph'` after its first layout.

### MEDIUM Labels missing in a zoomed-out file

`labels: 'visible'` applies the screen rules, so at a small `zoom` the small labels of a large graph are hidden and overlapping ones give way. Use `labels: 'all'` to draw every label, or a larger `zoom`.

### MEDIUM Unknown option values

`region` is `'view'` or `'graph'`, `labels` is `'visible'`, `'all'` or `'none'`. Other strings do not compile.

```ts expect-error=TS2322
import type { GraphInstance } from '@bruno00o/graph'
import { exportPng } from '@bruno00o/graph/export'

declare const graph: GraphInstance

await exportPng(graph, { labels: 'visible-only' })
```

## Completion

The task is done when:

- the export is awaited, from a visible, mounted and not destroyed graph;
- the file has the region, scale and pixel size asked for, checked by opening it;
- the background is what the file needs: the paper color, a chosen color or `'transparent'`;
- a PNG is saved as a `Blob`, an SVG as a `Blob` of type `image/svg+xml`, and the object URL is revoked after the download;
- every rejection (destroyed graph, no WebGL2, a drawing buffer refused, an empty area) is handled, with a message for the user;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Export](https://bruno00o.github.io/graph/docs/export), [exportPng and exportSvg](https://bruno00o.github.io/graph/docs/api/export)
- Examples: [export](https://bruno00o.github.io/graph/examples/export), [PNG export options](https://bruno00o.github.io/graph/examples/png-export-options)
- A graph on a map with its tiles: [Map](https://bruno00o.github.io/graph/docs/map#export)
