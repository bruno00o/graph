import { defineGraph, edges, type GraphViewEvent, nodes, type View } from '@bruno00o/graph'
import { Graph, type GraphInstance, useGraph } from '@bruno00o/graph/react'
import { type Ref, useEffect, useState } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './controls.css'

const { items, links } = createSample(600, 1_000, 6, 3)
const minZoom = 0.1
const maxZoom = 8

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  view: { minZoom, maxZoom },
})

function FitOnMount() {
  const graph = useGraph()
  useEffect(() => graph.view.fit(), [graph])
  return null
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [level, setLevel] = useState<number | null>(null)

  const onViewChange = ({ view: wanted }: GraphViewEvent) =>
    setView(level === null ? wanted : { ...wanted, y: level })

  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(items.length, links.length)}
      view={view}
      onViewChange={onViewChange}
    >
      <FitOnMount />
      <div className="view-controls">
        <label>
          <span>{messages.zoom(view.zoom)}</span>
          <input
            type="range"
            min={Math.log2(minZoom)}
            max={Math.log2(maxZoom)}
            step={0.01}
            value={Math.log2(view.zoom)}
            onChange={(event) => setView({ ...view, zoom: 2 ** Number(event.target.value) })}
          />
        </label>
        <button
          type="button"
          className="example-button"
          aria-pressed={level !== null}
          onClick={() => setLevel(level === null ? view.y : null)}
        >
          {level === null ? messages.lock : messages.unlock}
        </button>
        <output>{messages.center(view.x, view.y)}</output>
      </div>
    </Graph>
  )
}
