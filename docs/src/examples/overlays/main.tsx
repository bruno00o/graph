import { defineGraph, type ElementKeys, edges, type Key, nodes } from '@bruno00o/graph'
import { Graph, type GraphInstance, useGraph, useGraphState } from '@bruno00o/graph/react'
import { type Ref, useState } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const sample = createSample(2_000, 4_000)
const byId = new Map(sample.items.map((item) => [item.id, item]))

const definition = defineGraph({
  marks: [
    edges<Link>(sample.links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(sample.items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

function Tooltip() {
  const graph = useGraph()
  const hovered = useGraphState((state) => state.hovered)
  useGraphState((state) => state.view)
  useGraphState((state) => state.positionsVersion)
  if (hovered?.kind !== 'node') return null
  const item = hovered.datum as Item
  const position = graph.positions.get(hovered.key)
  if (!position) return null
  const point = graph.view.toScreen(position)
  return (
    <div
      className="example-tooltip"
      style={{ transform: `translate(${point.x + 12}px, ${point.y + 12}px)` }}
    >
      <strong>{item.label}</strong>
      <span>{messages.weight(item.group, item.weight)}</span>
    </div>
  )
}

function SelectionPanel({ selected }: { readonly selected: readonly Key[] }) {
  return (
    <aside className="example-panel">
      <h2>{messages.selected}</h2>
      {selected.length === 0 ? (
        <p>{messages.emptySelection}</p>
      ) : (
        <ul>
          {selected.map((key) => (
            <li key={key}>{byId.get(String(key))?.label}</li>
          ))}
        </ul>
      )}
    </aside>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [selection, setSelection] = useState<ElementKeys>({ nodes: [], edges: [] })
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(sample.items.length, sample.links.length)}
      onSelectionChange={setSelection}
    >
      <Tooltip />
      <SelectionPanel selected={selection.nodes} />
    </Graph>
  )
}
