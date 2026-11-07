export const describeVanilla = `import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import '@bruno00o/graph/theme.css'

type Item = { id: string; label: string; group: string; weight: number }
type Link = { id: string; from: string; to: string }

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { dimmed: { opacity: 0.2 } },
})

const graph = mountGraph(container, { definition, ariaLabel: 'Sample graph' })

graph.on('click', ({ target }) => {
  if (target?.kind !== 'node') return
  graph.view.fit({ nodes: [target.key, ...graph.neighbors(target.key)], duration: 400 })
})
`

export const describeReact = `import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, useGraph, useGraphEvent } from '@bruno00o/graph/react'
import '@bruno00o/graph/theme.css'

type Item = { id: string; label: string; group: string; weight: number }
type Link = { id: string; from: string; to: string }

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { dimmed: { opacity: 0.2 } },
})

function FitOnClick() {
  const graph = useGraph()
  useGraphEvent('click', ({ target }) => {
    if (target?.kind !== 'node') return
    graph.view.fit({ nodes: [target.key, ...graph.neighbors(target.key)], duration: 400 })
  })
  return null
}

export function App() {
  return (
    <Graph definition={definition} ariaLabel="Sample graph">
      <FitOnClick />
    </Graph>
  )
}
`

export const labelsSnippet = `nodes<Item>(items, {
  label: {
    text: 'label',
    secondary: 'group',
    size: 14,
    weight: 'bold',
    placement: 'right',
    maxWidth: 120,
  },
})`

export const reactSnippet = `function Selected() {
  const count = useGraphState((state) => state.selection.nodes.length)
  return <span>{count} selected</span>
}

<Graph definition={definition} ariaLabel="Sample graph">
  <Selected />
</Graph>`
