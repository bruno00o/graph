---
name: headless
description: >
  Use when running a @bruno00o/graph graph without a browser, such as in Node,
  a worker or a script: laying a graph out and writing it as an SVG, PNG,
  draw.io or Visio file, many graphs in a row, reading positions, counts, paths
  or picks as numbers, tests of a definition, fitting label boxes to a font file
  with createGraph and readFont, waiting for a layout with settled, rasterizing
  the SVG with resvg, and finding why a headless graph has no text, no edges,
  a blocked thread or a PNG that throws.
metadata:
  purpose: >
    Graphs that need no page: createGraph from @bruno00o/graph/headless, what
    settled waits for, text widths and readFont, exportSvg, exportDrawio and
    exportVsdx on a graph without a page, a PNG through resvg with the same font
    file, many extracts on worker threads, what a graph without a page lacks,
    and the mistakes that leave labels missing or boxes too small.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/headless/index.ts
  - src/headless/read-font.ts
  - src/headless/colors.ts
  - src/headless/text-estimate.ts
  - src/headless/page.ts
  - src/host/graph-core.ts
  - src/host/graph-instance.ts
  - src/export/index.ts
  - docs/content/docs/(guide)/server-side-extracts.mdx
  - docs/content/docs/api/create-graph.mdx
  - docs/content/docs/api/read-font.mdx
  - docs/content/docs/api/graph-core.mdx
  - docs/content/docs/api/export.mdx
requires:
  - core
---

# Run a graph without a page

Load the core skill first (`intent load @bruno00o/graph#core`): the definition, marks, keys and the instance API are the same. `createGraph` from `@bruno00o/graph/headless` builds a graph from the same definition as `mountGraph`, with no DOM, no WebGL and no worker, so it runs in Node 24, other runtimes without a DOM, and web workers. Use it to lay graphs out and write them as files on a server, in a script or a job, many at a time; to read positions, counts, paths and picks as numbers; and to test a definition. A graph that people look at and touch is `mountGraph` (core skill).

It returns a `GraphCore`: the graph without its element. `mountGraph` returns a `GraphInstance`, which extends `GraphCore` with `element`, `focus`, `anchors`, `lens`, `drawn`, `suspend`, `resume` and `drawsOnMap`. Everything else works as on a mounted graph: data and live sources, layouts, bundling and routing, view, selection, states, time, history, paths, the store and the events.

## Setup

1. Install the package, and a rasterizer if you need PNG files. The library ships none; this skill uses `@resvg/resvg-js`.

   ```sh
   npm install @bruno00o/graph @resvg/resvg-js
   ```

2. Keep a font file next to the code (`.ttf`, `.otf` or `.ttc`; a server has no `system-ui` font, and resvg draws no text without one).
3. Read the font, create the graph with its family and its widths, wait for it, export, destroy.

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { exportSvg } from '@bruno00o/graph/export'
import { createGraph, readFont } from '@bruno00o/graph/headless'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; label: string; group: string }
type Link = { id: string; from: string; to: string }

declare const items: Item[]
declare const links: Link[]

const fontFile = 'fonts/DejaVuSans.ttf'
const font = readFont(await readFile(fontFile))

const graph = createGraph({
  definition: defineGraph({
    marks: [
      nodes(items, { label: 'label', color: 'group' }),
      edges(links, { source: 'from', target: 'to', arrow: 'target' }),
    ],
    layout: force(),
  }),
  theme: { font: font.family },
  measureText: font.width,
})
await graph.settled()
const svg = await exportSvg(graph, { region: 'graph', size: { width: 1600 } })
graph.destroy()

const png = new Resvg(svg, {
  font: { loadSystemFonts: false, fontFiles: [fontFile], defaultFontFamily: font.family },
})
  .render()
  .asPng()

await writeFile('graph.svg', svg)
await writeFile('graph.png', png)
```

Result: an SVG 1,600 pixels wide, framed on the whole graph, and the PNG resvg draws from it, with label boxes sized for the font that draws them. `await` at the top level needs an ES module.

## Core Patterns

### Options of `createGraph`

`createGraph` takes the options of `mountGraph` that do not need a page (`definition`, `selection`, `folded`, `view`, `time`, `hiddenLayers`, `initial*`, `signal`, the controlled callbacks), without `ariaLabel`, `surface`, `suspended` and `keepFrame`, and adds four. See the [createGraph page](https://bruno00o.github.io/graph/docs/api/create-graph) for the table.

| Option | Meaning | Default |
| --- | --- | --- |
| `size` | `{ width, height }` in CSS pixels: `pick`, `view.toScreen`, `view.fit` and the first fit work on it, and `update({ size })` changes it | 1,024 x 768 |
| `theme` | `'light'`, `'dark'`, or `{ base, colors, font }`: `colors` takes `GraphToken` names without `--graph-`, over a base | `'light'` |
| `measureText` | `(text, weight, font) => width in em`, for label boxes, the choice of labels and the room a layout leaves for labels | Arial advance widths |
| `title` | Title written into exports | none |

A `size` that is not finite and above 0 throws a `RangeError`, at creation and in `update`. `theme` resolves `var(--graph-cat-3)`, `color-mix(in srgb, …)`, hex, names, `rgb()` and `hsl()` in your marks as a browser would, against the tokens of the theme; a token you leave out comes from the base. A color name that is not a `GraphToken` does not compile, and in development a name that is not a token and a color that cannot be read (drawn black) each warn.

### Wait with `settled()`

A graph without a page keeps no frame loop. It does its work on the calling thread, in slices of 50 ms, never in a Web Worker, and gives the event loop back between slices. Animations end at once: a `view.set` or `view.fit` with a `duration`, the glide of a layout result and a position that moves in the data all jump to their end, and edge bundling, routing and bridges start as soon as nothing moves.

`await graph.settled()` resolves when data changes are applied, live sources have loaded or the `waitForData` deadline is past, no layout runs, no view or position animation runs, and bundling, routing, bridges, the fills of large shapes and the hulls are computed. It checks again after each step, so a layout that a live source restarts keeps it waiting. Frames and images do not count: there are none. Once the graph is destroyed it rejects with the reason of `signal`, also while it waits.

Call it before every export or read of positions. A graph that is exported right after `createGraph` is a picture of a layout in progress. `await graph.loaded()` waits for live data only (core skill).

```ts
import { defineGraph, nodes } from '@bruno00o/graph'
import { createGraph } from '@bruno00o/graph/headless'
import { grid } from '@bruno00o/graph/layouts'

type Item = { id: string }
declare const items: Item[]

const graph = createGraph({
  definition: defineGraph({ marks: [nodes(items)], layout: grid() }),
  size: { width: 800, height: 600 },
})
await graph.settled()

const placed = graph.positions.snapshot()
const at = placed.get('n1')
const hit = at ? graph.pick(graph.view.toScreen(at)) : null
console.log(graph.count().nodes, placed.size, hit?.kind)
graph.destroy()
```

`positions.snapshot()` passes as is to `initialPositions` of a graph mounted later in a page, which then shows the same layout without running it. The CPU force layout is deterministic: the same definition gives the same positions on every run.

### Fit the labels to a font

Label boxes, plates, cut labels, the choice of labels shown, the room `layers` keeps on the left and right of group containers and the bounds of the diagram exports all depend on the width of the text, which nothing measures without a page. By default the graph uses the advance widths of Arial (Liberation Sans and Helvetica share them) for Latin letters, digits and signs, 1 em for wide CJK characters, 0.5 em for the rest, and counts bold 6 % wider. The default font family is `Arial, "Liberation Sans", Helvetica, sans-serif`.

For text drawn in another font, `readFont(bytes, { face })` reads a TrueType or OpenType file (a `.ttc` takes the index `face`, 0 by default) and returns `{ family, width }`. Pass the family to `theme.font` and the width to `measureText`, and give the same file to the rasterizer: the text it draws then has the width the graph made room for. Measured with DejaVu Sans drawn by resvg, the default widths fall short of the drawn text by 11 % on the median (up to 20 %); the widths of the file are within 1 % for nine labels in ten and 5 % at most, mostly kerning, which `readFont` leaves out.

- One file is one face. Labels are weight 500 by default, which resvg takes from the regular face when no medium one is loaded. For bold labels, load the bold file in resvg too, and write a `measureText` of your own that picks the widths of each file by its `weight` argument.
- WOFF and WOFF2 are not read: use the TrueType file they come from. A file that is not a font, a truncated one, or one with no horizontal metrics throws a `TypeError` whose message starts with `readFont:`; a `face` the collection lacks throws a `RangeError`. A font that `readFont` returns never throws while it measures.

### Write files

`@bruno00o/graph/export` takes a `GraphCore` for `exportSvg`, `exportDrawio` and `exportVsdx`. Options, regions, `size` and `zoom` are those of the export skill; read it for them.

- `exportSvg(graph, options)`: a document written from the scene. `region: 'graph'` frames every node with its labels, and `size: { width }` sets the pixel width while the height follows the graph. Labels follow the rules of the screen: a label under 8 pixels in the image is left out, so a large graph fitted into a small image may show none; `labels: 'all'` draws them all. Fonts are not embedded, great-circle arcs are straight, and no map is drawn under nodes placed by `longitude` and `latitude`.
- `exportDrawio` (text) and `exportVsdx` (a `Blob`): editable diagrams, with the labels bounded by the text measure of the graph.
- `exportPng` needs WebGL and rejects a graph from `createGraph` with a `TypeError`; its parameter is typed `GraphInstance`, so the call does not compile either. Rasterize the SVG instead.

Pictures are not loaded without a page: `exportSvg` writes each image URL as it is and draws the picture square, and resvg loads only data URLs and local files. The `images` option reads them yourself, once per URL: return the URL to write and the size of the image, or `null` to leave it out.

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exportSvg } from '@bruno00o/graph/export'
import type { GraphCore } from '@bruno00o/graph'

declare const graph: GraphCore

const svg = await exportSvg(graph, {
  images: async (src) => {
    const bytes = await readFile(join('public', src))
    return {
      href: `data:image/png;base64,${bytes.toString('base64')}`,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    }
  },
})
```

The width and height of a PNG are the 32-bit numbers at bytes 16 and 20. An `images` function that throws or rejects makes `exportSvg` reject with its error. `createLegend` and `createTimeline` also take a `GraphCore`.

### Many extracts

Create one graph per extract and destroy it once exported. Each graph works on one thread, so spread the extracts over `worker_threads`, one graph at a time per thread, each thread reading the font once. The script, the numbers and the macOS caveat are in [references/extracts-at-scale.md](references/extracts-at-scale.md); the repository runs the same script on every change (`pnpm docs:extracts`).

### What a graph without a page lacks

Not available, and the types say so: `element`, `focus`, `anchors`, `lens`, `drawn`, `suspend`, `resume`, `drawsOnMap`, `exportPng`, the minimap, the devtools panel, the shape editor, `showPresence`, the React components and map surfaces. `store.state.focused`, `hovered` and `lens` stay `null`, and `surface` is `'none'`. A function that takes a `GraphCore` takes a mounted graph as well, so write helpers against `GraphCore` and run them in both places.

## Common Mistakes

### HIGH Rasterizing the SVG without the font file

resvg draws a label only with a font it has. With `loadSystemFonts: false` and no `fontFiles` it draws no text at all: nodes and edges appear, labels do not, and nothing warns. With its default, it reads the fonts of the machine: a slim container has none, and a laptop draws another font than the one the graph measured. Give it the font file and turn the system fonts off.

```ts
import { Resvg } from '@resvg/resvg-js'

declare const svg: string
declare const family: string

const blank = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng()
const drawn = new Resvg(svg, {
  font: { loadSystemFonts: false, fontFiles: ['fonts/DejaVuSans.ttf'], defaultFontFamily: family },
})
  .render()
  .asPng()
console.log(blank.length, drawn.length)
```

`loadSystemFonts: true` reads every font of the system at each `new Resvg`: about 60 ms per image on macOS, and about a second for the first one. `defaultFontFamily` draws a label whose `font` names a family that is not loaded. Read `image.pixels` once into a variable if you test the image: each access of the getter copies the whole buffer.

### HIGH Exporting before the graph has settled

The layout runs in slices after `createGraph` returns. An export or a read of positions made straight away sees the nodes where the first slices left them. Await `graph.settled()` first, and read the result in the same tick.

### HIGH Edges that never appear

`edges()` needs `source` and `target` even in a script, even when the fields have those names. Without them the edges wait for ends that no one names: `count().edges` is 0, `count().pending` holds them all, and `issues()` is empty. The types refuse the call; plain JavaScript does not.

```ts expect-error=TS2769
import { edges } from '@bruno00o/graph'

type Link = { id: string; source: string; target: string }
declare const links: Link[]

edges(links, { arrow: 'target' })
```

### HIGH Calling `exportPng` on a graph without a page

The PNG export draws in WebGL, so it does not compile for a `GraphCore` and rejects with a `TypeError` for one made by `createGraph`. Export the SVG and rasterize it.

```ts expect-error=TS2740
import { exportPng } from '@bruno00o/graph/export'
import type { GraphCore } from '@bruno00o/graph'

declare const graph: GraphCore

await exportPng(graph)
```

### MEDIUM Boxes that do not fit the drawn text

Without `measureText`, the graph measures with Arial. Labels drawn in another font overflow their plates and are cut where the graph expected room: 11 % short on the median in DejaVu Sans. Read the font file, pass its family to `theme.font` and its widths to `measureText`, and give the same file to the rasterizer.

### MEDIUM Labels missing from a small image

`labels: 'visible'` applies the screen rules, so in a small image of a large graph every label is under 8 pixels and none is written. Use `labels: 'all'`, a wider `size`, or a smaller `region`.

### MEDIUM Pictures that are square or missing

Nodes with an `image` keep their URL and are drawn square, and resvg cannot fetch a web address. Read the files with the `images` option and give back a data URL and the size.

### MEDIUM Treating a big graph like a page

Layouts, bundling and routing run on the calling thread: a graph of 20,000 nodes keeps the thread about 1.4 s, with the event loop served between slices of 50 ms. For many graphs, use one worker thread per core and one graph at a time in each, instead of `Promise.all` over graphs on one thread. The GPU engine of the force layout never runs: the CPU force layout does the work.

### MEDIUM Waiting for an animation or a frame

There is no frame loop and no `drawn()`. A `duration` on `view.set`, `view.fit`, `layout.run` or `positions.set` ends at once; read the result right after `settled()`.

### MEDIUM Keeping a graph after its export

Destroy each graph once exported, and do not read it afterwards: reads return the last state, actions do nothing, and `settled()` rejects with the reason of `signal`. A graph that is never destroyed keeps its data, its scene and its layout state in memory, so a job that makes one graph per extract grows with every file.

### MEDIUM A size that is not above 0

`size` takes a finite width and height above 0. A size computed from data that came out 0, `NaN` or `Infinity` throws a `RangeError` at creation, and `update({ size })` throws the same and changes nothing. Check the numbers before they reach `createGraph`.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'
import { createGraph } from '@bruno00o/graph/headless'

type Item = { id: string }
declare const items: Item[]
declare const columns: number

const definition = defineGraph({ marks: [nodes(items)] })
const width = Math.max(1, columns * 120)
const graph = createGraph({ definition, size: { width, height: 600 } })
graph.update({ size: { width: width * 2, height: 600 } })
graph.destroy()
```

### MEDIUM Measuring bold labels with the regular face

`readFont` reads one face, so every weight gets the widths of that file: bold labels drawn from the bold file are wider than their boxes. Read the bold file too, load it in resvg, and pass a `measureText` that picks by `weight` ([references/extracts-at-scale.md](references/extracts-at-scale.md)).

## Completion

The task is done when:

- the graph is made by `createGraph`, has `edges()` with `source` and `target`, and is awaited with `settled()` before any export or read;
- the font file is read once per thread, its family is in `theme.font`, its widths are in `measureText`, and the rasterizer loads the same file with `loadSystemFonts: false`;
- images, if any, go through `images`;
- no code calls `exportPng`, `element`, `drawn` or another page member on the graph;
- each graph is destroyed after its export, and many graphs run on `worker_threads`;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Server-side extracts](https://bruno00o.github.io/graph/docs/server-side-extracts), [createGraph](https://bruno00o.github.io/graph/docs/api/create-graph), [readFont](https://bruno00o.github.io/graph/docs/api/read-font), [GraphCore](https://bruno00o.github.io/graph/docs/api/graph-core), [exportSvg, exportDrawio and exportVsdx](https://bruno00o.github.io/graph/docs/api/export)
- [Browser support: without a browser](https://bruno00o.github.io/graph/docs/browser-support#without-a-browser)
- Many extracts, measurements and the font on macOS: [references/extracts-at-scale.md](references/extracts-at-scale.md)
