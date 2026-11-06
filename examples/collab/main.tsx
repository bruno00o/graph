import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { persistPositions } from '@bruno00o/graph/db'
import { Graph, type GraphInstance, useGraph, useGraphState } from '@bruno00o/graph/react'
import { createCollection, localStorageCollectionOptions } from '@tanstack/db'
import { StrictMode, useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'

const sample = createSample(240, 360, 6, 11)
const home = new Map(sample.items.map((item) => [item.id, item]))

const items = createCollection(
  localStorageCollectionOptions({
    id: 'collab-items',
    storageKey: 'graph-example-collab',
    getKey: (item: Item) => item.id,
  }),
)

await items.preload()
if (items.size === 0) items.insert(sample.items)

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
    <output className="hovered" aria-live="polite">
      {label}
    </output>
  )
}

function App() {
  const graph = useRef<GraphInstance | null>(null)
  const definition = useMemo(
    () =>
      defineGraph({
        marks: [
          edges<Link>(sample.links, { source: 'from', target: 'to' }),
          nodes(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
        ],
      }),
    [],
  )
  return (
    <>
      <header>
        <h1>{messages.collab}</h1>
        <span className="hint">{messages.collabHint}</span>
        <button type="button" onClick={resetPositions}>
          {messages.reset}
        </button>
        <button type="button" onClick={() => graph.current?.view.fit(undefined, { duration: 400 })}>
          {messages.fit}
        </button>
      </header>
      <main>
        <Graph
          ref={graph}
          className="graph"
          definition={definition}
          ariaLabel={messages.graphLabel(
            formatNumber(sample.items.length),
            formatNumber(sample.links.length),
          )}
        >
          <SharedPositions />
          <Hovered />
        </Graph>
      </main>
    </>
  )
}

document.title = messages.collab
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
