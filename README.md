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
- Parallel edges, self loops, drag, pan and zoom out of the box
- Themed with CSS variables, light and dark
- A framework-agnostic core with a thin React adapter, plus TanStack DB and TanStack Query integrations

> Early development: the API may still change before 1.0.

## Install

```sh
pnpm add @bruno00o/graph
```

| Entry point                 | Contents                                                         | Peer dependency        |
| --------------------------- | ---------------------------------------------------------------- | ---------------------- |
| `@bruno00o/graph`           | `defineGraph`, `nodes`, `edges`, `mountGraph`                    |                        |
| `@bruno00o/graph/react`     | `<Graph>`, `useGraph`, `useGraphState`, `useGraphEvent`          | `react` 19             |
| `@bruno00o/graph/db`        | `persistPositions` for TanStack DB collections                   | `@tanstack/db`         |
| `@bruno00o/graph/query`     | `createExploration` for neighborhoods loaded with TanStack Query | `@tanstack/query-core` |
| `@bruno00o/graph/theme.css` | Default light and dark theme                                     |                        |

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

A TanStack DB collection is a live source: pass it to a mark and its changes arrive without a new definition.

```ts
nodes(itemsCollection, { color: 'group', label: 'label' })
```

## Examples

The [`examples`](./examples) folder holds runnable examples: vanilla and React graphs, parallel edges and loops, collaboration across tabs with TanStack DB, and neighborhood exploration with TanStack Query. Run them with `pnpm install && pnpm dev`.

## Get Involved

- Issues and pull requests are welcome.
- `pnpm verify` runs lint, types, tests, the build and package checks.

## License

[MIT](./LICENSE)
