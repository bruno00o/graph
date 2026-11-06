import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { persistPositions } from '@bruno00o/graph/db'
import { Graph, type GraphInstance, useGraph, useGraphState } from '@bruno00o/graph/react'
import { createCollection, localStorageCollectionOptions } from '@tanstack/db'
import { type Ref, useEffect } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const sample = createSample(240, 360, 6, 11)
const home = new Map(sample.items.map((item) => [item.id, item]))

const items = createCollection(
  localStorageCollectionOptions({
    id: 'collab-items',
    storageKey: 'graph-docs-collab',
    getKey: (item: Item) => item.id,
  }),
)

await items.preload()
if (items.size === 0) items.insert(sample.items)

const definition = defineGraph({
  marks: [
    edges<Link>(sample.links, { source: 'from', target: 'to' }),
    nodes(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

function resetPositions(): void {
  items.update([...home.keys()], (drafts) => {
    for (const draft of drafts) {
      const origin = home.get(draft.id)
      if (!origin) continue
      draft.x = origin.x
      draft.y = origin.y
    }
  })
}

function SharedPositions() {
  const graph = useGraph()
  useEffect(() => persistPositions(graph, { collection: items }), [graph])
  return null
}

function Hovered() {
  const hovered = useGraphState((state) => state.hovered)
  const label = hovered?.kind === 'node' ? (hovered.datum as Item).label : ''
  return (
    <output className="example-status" aria-live="polite">
      {label}
    </output>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(sample.items.length, sample.links.length)}
    >
      <SharedPositions />
      <Hovered />
      <div className="example-actions">
        <button className="example-button" type="button" onClick={resetPositions}>
          {messages.resetPositions}
        </button>
      </div>
    </Graph>
  )
}
