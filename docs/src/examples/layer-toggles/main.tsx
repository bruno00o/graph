import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import { type Ref, useState } from 'react'
import { messages } from './messages'
import '../shared/overlays.css'
import './controls.css'

interface Spot {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Layer = keyof typeof messages.layers

const layers = Object.keys(messages.layers) as Layer[]
const count = 12
const around = (index: number, radius: number) => {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}
const link = (from: string, to: string): Link => ({ id: `${from}>${to}`, from, to })

const center: Spot = { id: 'c', label: messages.center, x: 0, y: 0 }
const core: Spot[] = Array.from({ length: count }, (_, at) => ({
  id: `n${at}`,
  label: messages.node(at + 1),
  ...around(at, 200),
}))
const satellites: Spot[] = core.flatMap((_, at) =>
  [-0.22, 0.22].map((shift, side) => ({
    id: `s${at}-${side}`,
    label: messages.satellite(at * 2 + side + 1),
    ...around(at + shift, 300),
  })),
)

const definition = defineGraph({
  marks: [
    edges(
      core.map((spot, at) => link(spot.id, `n${(at + 1) % count}`)),
      { source: 'from', target: 'to', layer: 'rim', width: () => 3 },
    ),
    edges(
      core.map((spot) => link('c', spot.id)),
      { source: 'from', target: 'to', layer: 'spokes', stroke: 'var(--graph-cat-1)' },
    ),
    edges(
      core.map((spot, at) => link(spot.id, `n${(at + 5) % count}`)),
      {
        source: 'from',
        target: 'to',
        layer: 'chords',
        stroke: 'var(--graph-cat-2)',
        dash: 'dashed',
      },
    ),
    edges(
      satellites.map((spot) => link(`n${spot.id.slice(1).split('-')[0]}`, spot.id)),
      { source: 'from', target: 'to', layer: 'satellites', stroke: 'var(--graph-cat-4)' },
    ),
    nodes([center, ...core], { x: 'x', y: 'y', size: () => 22, label: 'label' }),
    nodes(satellites, {
      x: 'x',
      y: 'y',
      layer: 'satellites',
      size: () => 12,
      fill: 'var(--graph-cat-4)',
    }),
  ],
  scales: { size: (value) => value, width: (value) => value },
})

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [hidden, setHidden] = useState<readonly Layer[]>(['chords'])
  const toggle = (layer: Layer) =>
    setHidden((current) =>
      current.includes(layer) ? current.filter((name) => name !== layer) : [...current, layer],
    )
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(core.length + 1, satellites.length)}
      hiddenLayers={hidden}
      onLayerChange={(event) => setHidden(event.hidden)}
    >
      <div className="example-actions">
        {layers.map((layer) => (
          <button
            key={layer}
            type="button"
            className="example-button layer-button"
            aria-pressed={!hidden.includes(layer)}
            onClick={() => toggle(layer)}
          >
            {messages.layers[layer]}
          </button>
        ))}
      </div>
    </Graph>
  )
}
