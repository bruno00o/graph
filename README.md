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

- Smooth with 50,000 nodes and 100,000 edges, picking included
- Declarative marks: map your fields to color, size, labels, arrows and dashes through shared scales, with types inferred from your data
- Live sources: pass a TanStack DB collection as is, or anything with `subscribeChanges`, and only what changed is redrawn
- Named states (selection, hover, focus and your own) resolved on the GPU
- Images and icons clipped to the node shape, corner badges, outlines, label backgrounds, parallel edges and self loops
- Labels with their own size, color, weight, font, placement, line breaks and truncation, on nodes and on edges, where edge labels follow their edge and stay upright; labels are placed only where they fit without overlapping
- Drag, pan, zoom, multiple selection and lasso out of the box, plus keyboard navigation announced to screen readers
- Force layout on the GPU in a Web Worker, with a CPU fallback: nodes settle in place while you keep panning, and dragging a node pins it
- Themed with CSS variables, light and dark
- A framework-agnostic core with a thin React adapter, plus TanStack DB and TanStack Query integrations

> Early development: the API may still change before 1.0.

## Install

```sh
pnpm add @bruno00o/graph
```

| Entry point                      | Contents                                                         | Peer dependency                        |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `@bruno00o/graph`                | `defineGraph`, `nodes`, `edges`, `mountGraph`                    |                                        |
| `@bruno00o/graph/react`          | `<Graph>`, `useGraph`, `useGraphState`, `useGraphEvent`          | `react` 19                             |
| `@bruno00o/graph/db`             | `persistPositions` and `subset` for TanStack DB collections      | `@tanstack/db`                         |
| `@bruno00o/graph/query`          | `createExploration` for neighborhoods loaded with TanStack Query | `@tanstack/query-core`                 |
| `@bruno00o/graph/layouts`        | `layers`, `grid`, `rings` and `radial` layouts                   |                                        |
| `@bruno00o/graph/layouts/force`  | `force` layout, computed on the GPU in a Web Worker              |                                        |
| `@bruno00o/graph/devtools`       | Graph panel and render timings for TanStack Devtools             | `@tanstack/devtools`                   |
| `@bruno00o/graph/devtools/react` | `graphDevtoolsPlugin` and `<GraphDevtoolsPanel>` for React       | `@tanstack/devtools-utils`, `react` 19 |
| `@bruno00o/graph/theme.css`      | Default light and dark theme                                     |                                        |

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
  if (target?.kind === 'node') graph.view.fit([target.key], { duration: 400 })
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
  if (completed) graph.view.fit(graph.selection.get().nodes, { duration: 400 })
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

The [`examples`](./examples) folder holds runnable examples: vanilla and React graphs, images, badges and outlines, parallel edges and loops, a force layout up to 500,000 nodes, layered, grid, rings and radial layouts, collaboration across tabs with TanStack DB, filtering 500,000 TanStack DB rows with edges loaded on demand, and neighborhood exploration with TanStack Query. Run them with `pnpm install && pnpm dev`.

## Get Involved

- Issues and pull requests are welcome.
- `pnpm verify` runs lint, types, tests, the build and package checks.

## License

[MIT](./LICENSE)
