<div align="center">
<a href="https://npmjs.com/package/@bruno00o/graph" target="_parent">
<img alt="npm version" src="https://img.shields.io/npm/v/@bruno00o/graph.svg" />
</a>
<a href="https://npmjs.com/package/@bruno00o/graph" target="_parent">
<img alt="npm downloads" src="https://img.shields.io/npm/dm/@bruno00o/graph.svg" />
</a>
<a href="https://bundlephobia.com/result?p=@bruno00o/graph" target="_parent">
<img alt="bundle size" src="https://badgen.net/bundlephobia/minzip/@bruno00o/graph" />
</a>
<a href="https://github.com/bruno00o/graph/actions/workflows/ci.yml" target="_parent">
<img alt="CI" src="https://github.com/bruno00o/graph/actions/workflows/ci.yml/badge.svg" />
</a>
<a href="./LICENSE" target="_parent">
<img alt="MIT license" src="https://img.shields.io/npm/l/@bruno00o/graph.svg" />
</a>
</div>

# @bruno00o/graph

Framework-agnostic, typed graph visualization rendered with WebGL2.

Documentation, examples and benchmark: <https://bruno00o.github.io/graph/>

- Smooth with 50,000 nodes and 100,000 edges, picking included
- Declarative marks: map your fields to color, size, labels, arrows and dashes through scales shared or kept to one mark, with types inferred from your data
- Typed events and state: click, hover, drag and focus targets carry your own item types, narrowed by mark name, with nothing to cast
- Live sources: pass a TanStack DB collection as is, or anything with `subscribeChanges`, and only what changed is redrawn
- Named states (selection, hover, focus and your own) resolved on the GPU
- Images and icons clipped to the node shape, corner badges, outlines, label backgrounds, parallel edges and self loops
- Edges with two ends styled on their own: color, width, dashes and a label for each side of a split that follows your data, and picking that tells which end was hit
- Nested groups drawn as containers, folded into a single node on double-click, with the edges that cross them merged and styled by their count
- Labels with their own size, color, weight, font, placement, line breaks and truncation, on nodes and on edges, where edge labels follow their edge and stay upright; labels are placed only where they fit without overlapping
- Drag, pan, zoom, pinch on touch screens, multiple selection and lasso out of the box, plus keyboard navigation announced to screen readers
- A wheel that zooms, pans or leaves the page scrolling, zoom limits and bounds the view cannot leave, and edge scrolling while dragging
- Force layout on the GPU in a Web Worker, with a CPU fallback: nodes settle in place while you keep panning, and dragging a node pins it
- A background grid that adapts to the zoom, hulls around groups, states or lists of nodes, and HTML pinned to nodes, edges or points without a render per frame
- Themed with CSS variables, light and dark
- Export to PNG, tiled past the GPU limits, or to a standalone SVG document
- Nodes placed by longitude and latitude, drawn inside a MapLibre map in its own WebGL context, with a PNG export of the map, the graph and the attribution
- A view your application can control, as the selection, without a frame of lag
- A framework-agnostic core with a thin React adapter, plus TanStack DB and TanStack Query integrations

> Early development: the API may still change before 1.0.

## Install

```sh
pnpm add @bruno00o/graph
```

| Entry point                      | Contents                                                            | Peer dependency                             |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `@bruno00o/graph`                | `defineGraph`, `nodes`, `edges`, `hull`, `mountGraph`               |                                             |
| `@bruno00o/graph/react`          | `<Graph>`, `<Anchor>`, `useGraph`, `useGraphState`, `useGraphEvent` | `react` 19, `react-dom` 19                  |
| `@bruno00o/graph/db`             | `persistPositions` and `subset` for TanStack DB collections         | `@tanstack/db`                              |
| `@bruno00o/graph/query`          | `createExploration` for neighborhoods loaded with TanStack Query    | `@tanstack/query-core`                      |
| `@bruno00o/graph/cypher`         | `cypherGraph`, nodes and edges from the result of a Cypher query    |                                             |
| `@bruno00o/graph/formats`        | Read and write GraphML, GEXF, JSON Graph Format and CSV             |                                             |
| `@bruno00o/graph/export`         | `exportPng` and `exportSvg`                                         |                                             |
| `@bruno00o/graph/map`            | `mountMapGraph` and `exportMapPng` for MapLibre maps                | `maplibre-gl` 6                             |
| `@bruno00o/graph/map/react`      | `<MapGraph>`, the React component for MapLibre maps                 | `maplibre-gl` 6, `react` 19, `react-dom` 19 |
| `@bruno00o/graph/layouts`        | `layers`, `grid`, `rings` and `radial` layouts                      |                                             |
| `@bruno00o/graph/layouts/force`  | `force` layout, computed on the GPU in a Web Worker                 |                                             |
| `@bruno00o/graph/devtools`       | Graph panel and render timings for TanStack Devtools                | `@tanstack/devtools`                        |
| `@bruno00o/graph/devtools/react` | `graphDevtoolsPlugin` and `<GraphDevtoolsPanel>` for React          | `@tanstack/devtools-utils`, `react` 19      |
| `@bruno00o/graph/theme.css`      | Default light and dark theme                                        |                                             |

## Quick start

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import '@bruno00o/graph/theme.css'

type Item = { id: string; label: string; group: string; weight: number }
type Link = { id: string; from: string; to: string }

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { muted: { opacity: 0.2, label: false } },
})

const graph = mountGraph(container, { definition, ariaLabel: 'Sample graph' })

graph.on('click', ({ target }) => {
  if (target?.kind === 'node') console.log(target.datum.label)
})
graph.states.set('muted', { nodes: ['n4', 'n7'] })
```

With React:

```tsx
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, useGraphState } from '@bruno00o/graph/react'
import { useMemo } from 'react'

function Hovered() {
  const hovered = useGraphState((state) => state.hovered)
  return <output>{hovered?.kind === 'node' ? String(hovered.key) : ''}</output>
}

export function SampleGraph({ items, links }: { items: Item[]; links: Link[] }) {
  const definition = useMemo(
    () =>
      defineGraph({
        marks: [
          edges(links, { source: 'from', target: 'to' }),
          nodes(items, { color: 'group', label: 'label' }),
        ],
      }),
    [items, links],
  )
  return (
    <Graph definition={definition} ariaLabel="Sample graph" style={{ height: 480 }}>
      <Hovered />
    </Graph>
  )
}
```

Nodes without `x` and `y` are placed by the layout of the definition. It runs on the first nodes, then places new nodes near their neighbors without moving the others.

```ts
import { force } from '@bruno00o/graph/layouts/force'

const definition = defineGraph({ marks, layout: force({ edgeLength: 60 }) })
const graph = mountGraph(container, { definition, ariaLabel: 'Sample graph' })

button.addEventListener('click', async () => {
  const completed = await graph.layout.run(undefined, { keys: graph.selection.get().nodes })
  if (completed) graph.view.fit({ ...graph.selection.get(), duration: 400 })
})
```

Large graphs run on the GPU (WebGL2 in the worker) and smaller ones on the CPU; `force({ engine: 'gpu' })` or `'cpu'` forces the choice. `graph.layout.run()` lays out every node, or only `keys`, and resolves to `false` when stopped. Progress lives in the store (`state.layout.running` and `state.layout.progress`), and `layoutstart` and `layoutend` mark each run.

`grid`, `rings` and `radial` compute their result at once. Nodes glide to it over `transitions.layout` (400 ms by default), and `fit` frames where they land.

```ts
import { grid, radial } from '@bruno00o/graph/layouts'

await graph.layout.run(grid<Item>({ order: (a, b) => a.group.localeCompare(b.group) }), {
  fit: true,
})
await graph.layout.run(radial({ root: 'hub' }), { duration: 600 })
```

A TanStack DB collection is a live source: pass it to a mark and its changes arrive without a new definition.

```ts
nodes(itemsCollection, { color: 'group', label: 'label' })
```

To filter a large collection, `subset` subscribes to it with a `where` expression: a new filter only moves the rows that enter or leave it, and an on-demand collection loads only what the graph asks for.

```ts
import { subset } from '@bruno00o/graph/db'
import { gte } from '@tanstack/db'

const heavy = subset(itemsCollection, (item) => gte(item.weight, 40))
nodes(heavy, { color: 'group' })
```

## Examples

The [`examples`](./examples) folder holds runnable examples: vanilla and React graphs, images, badges and outlines, parallel edges and loops, nested groups that fold and unfold, a background grid with hulls and anchored HTML, a force layout up to 500,000 nodes, layered, grid, rings and radial layouts, collaboration across tabs with TanStack DB, filtering 500,000 TanStack DB rows with edges loaded on demand, neighborhood exploration with TanStack Query, and places drawn on a MapLibre map. Run them with `pnpm install && pnpm dev`.

## Get Involved

- Issues and pull requests are welcome.
- `pnpm verify` runs lint, types, tests, the build and package checks.
- Add `?caps=low` to an example URL to run it as on the smallest WebGL2 device: minimum limits and no optional extension. `?caps=software` reports a software renderer, and `&texture=4096` lowers the largest texture size alone. In tests, `limitWebgl` from `src/testing/webgl-caps.ts` does the same and lists the textures the device would refuse.
- `pnpm test:browsers` builds the examples and the docs, then opens every example page in Chromium, Firefox and WebKit with Playwright. Each page must log no error, draw on its canvas, pick a node on hover, select it on click and zoom on wheel. It prints a table of pages by browser and saves a screenshot of each page in `browser-results`. Run `pnpm exec playwright install` once to download the browsers.
  - `--browser firefox` or `--browser chromium,webkit` runs some browsers only.
  - `--example nodes`, `--example 'docs/*'` or `--example examples/labels` runs some pages only. The `low/*` pages open five examples with `?caps=low`.
  - `--no-build` reuses the last builds, `--software` draws Chromium with its software renderer as on a machine without a GPU, `--headed` shows the windows.
  - On Linux, Firefox creates a WebGL context only with a display: run `xvfb-run pnpm test:browsers` on a machine without one, as the CI does.
  - Each example page exposes its graph as `window.graph`, which the checks read.

### Adding an example

The docs gallery reads every folder of `docs/src/examples`, so an example touches only its own folder:

```
docs/src/examples/<slug>/
  meta.ts               title, description, hint, category, order, tags, api, guides
  main.ts               exports mount(container), which returns the graph
  main.tsx              or exports a React Example that passes its ref to <Graph>
  messages.ts           every text the example shows
  notes.mdx             optional prose under the demo: how it works, what to try
  thumbnail.webp        generated, light theme
  thumbnail-dark.webp   generated, dark theme
```

- `pnpm docs:new-example <slug> <category>` creates the folder with a small graph to start from, `--react` for a React example. The folder name is the slug and the address, `/examples/<slug>`: never rename a published one.
- `meta.ts` exports an object that `satisfies ExampleMeta`, and imports types only:
  - `title`, `description` (one or two sentences, on the card and the page) and `hint` (what to try, above the demo);
  - `category`, one of the categories of `docs/src/examples/categories.ts`: `basics`, `style`, `layouts`, `structure`, `interaction`, `analysis`, `edges`, `time-and-maps`, `data`, `tools`;
  - `order` within the category, in steps of ten so that a new example fits between two others; equal orders sort by title;
  - `tags`: `Vanilla` or `React` after the entry file, plus `TanStack DB`, `TanStack Query` and `TanStack Devtools` when the example imports them;
  - `api`, the pages of `/docs/api` the example uses, such as `define-graph`, and `guides`, pages of `/docs` such as `states` or `view#view-limits`: the page links to both;
  - `harness: { select: false }` when a click on a node does not select it.
- The code viewer shows every file of the folder, then the shared files they import from `../shared`. The modules listed on the page come from the imports.
- `pnpm docs:thumbnails <slug>` builds the docs, opens the page in Chromium, waits for the first render and the end of layouts, and saves the stage as two 640 by 400 WebP images, light and dark, of about 25 KB each. Without a slug it captures every example; `--no-build` reuses the last build. Commit both images.
- `pnpm test` fails on malformed metadata, an unknown category, a duplicate slug, a link to a missing docs page, tags that do not match the imports, a missing thumbnail, an import outside the folder, `../shared` and the public entry points, or text left from the scaffold. Then `pnpm test:browsers --example 'docs/<slug>'` checks the page in the three browsers.
- `pnpm docs:dev` serves the docs on port 5192; `pnpm --dir docs exec vite dev --port <port>` picks another one.
- The site is published at `/graph/` on GitHub Pages, from the tag of each release. `DOCS_BASE=/graph/ pnpm docs:build` builds it under that base, and `pnpm docs:check-pages` then serves `docs/dist/client` as Pages does, opens every page, example and showcase app in Chromium, and fails on a missing file, a failed request, a console error or a broken local link. A link to a local file in docs code starts with `import.meta.env.BASE_URL`, never with `/`; links between pages go through the router's `Link` or Markdown links such as `[Labels](/docs/labels)`, which follow the base.

Conventions:

- One example, one idea, in about 50 to 150 lines.
- Neutral generated data with a fixed seed, so that every run and every thumbnail is the same: no business domain, and no real-world dataset that implies one. `../shared/data` holds seeded generators.
- Every text on screen comes from the example's `messages.ts`. An example pull request does not edit `../shared` or any file outside its folder.
- No cast of `datum`: typed marks infer it.
- Public entry points only: `@bruno00o/graph`, `@bruno00o/graph/react`, `@bruno00o/graph/layouts` and the other subpaths.

## License

[MIT](./LICENSE)
