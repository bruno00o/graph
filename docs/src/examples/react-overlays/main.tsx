import { defineGraph, type ElementKeys, edges, type Key, nodes } from '@bruno00o/graph'
import {
  Anchor,
  Graph,
  type GraphInstance,
  type GraphState,
  useGraph,
  useGraphState,
} from '@bruno00o/graph/react'
import { type Ref, useState } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const sample = createSample(2_000, 4_000)

const definition = defineGraph({
  marks: [
    edges<Link>(sample.links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(sample.items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

type Marks = (typeof definition.marks)[number]

function Tooltip() {
  const hovered = useGraphState((state: GraphState<string, Marks>) => state.hovered)
  if (hovered?.kind !== 'node') return null
  const item = hovered.datum
  return (
    <Anchor node={hovered.key} side="right" align="start">
      <div className="example-tooltip">
        <strong>{item.label}</strong>
        <span>{messages.weight(item.group, item.weight)}</span>
      </div>
    </Anchor>
  )
}

function SelectionPanel({ selected }: { readonly selected: readonly Key[] }) {
  const graph = useGraph<string, Marks>()
  return (
    <aside className="example-panel">
      <h2>{messages.selected}</h2>
      {selected.length === 0 ? (
        <p>{messages.emptySelection}</p>
      ) : (
        <ul>
          {selected.map((key) => (
            <li key={key}>{graph.datumOf({ kind: 'node', key })?.label}</li>
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
      onSelectionChange={(event) => setSelection(event.selection)}
    >
      <Tooltip />
      <SelectionPanel selected={selection.nodes} />
    </Graph>
  )
}
