import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, useGraph, useGraphState } from '@bruno00o/graph/react'
import type { JSX } from 'react'
import { Icon } from '../components/icon'
import { messages } from '../messages'
import { createHeroGraph, type HeroLink, type HeroNode, heroGroups } from './hero-data'

const data = createHeroGraph()

const definition = defineGraph({
  marks: [
    edges<HeroLink>(data.links, { source: 'from', target: 'to', width: 'weight', arrow: 'target' }),
    nodes<HeroNode>(data.nodes, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: {
    color: { domain: heroGroups },
    size: { range: [8, 30] },
    width: { range: [1, 3] },
  },
})

const zoomStep = 1.5

const fill = { position: 'absolute', inset: 0 } as const

function Tools(): JSX.Element {
  const graph = useGraph()
  return (
    <div className="overlay overlay-tools">
      <button
        className="tool tool-sq"
        type="button"
        aria-label={messages.examples.zoomIn}
        onClick={() => graph.view.zoomBy(zoomStep, { duration: 200 })}
      >
        <Icon name="plus" />
      </button>
      <button
        className="tool tool-sq"
        type="button"
        aria-label={messages.examples.zoomOut}
        onClick={() => graph.view.zoomBy(1 / zoomStep, { duration: 200 })}
      >
        <Icon name="minus" />
      </button>
      <button
        className="tool tool-sq"
        type="button"
        aria-label={messages.examples.fit}
        onClick={() => graph.view.fit(undefined, { duration: 400 })}
      >
        <Icon name="fit" />
      </button>
    </div>
  )
}

function Tooltip(): JSX.Element | null {
  const graph = useGraph()
  const hovered = useGraphState((state) => state.hovered)
  useGraphState((state) => state.view)
  useGraphState((state) => state.positionsVersion)
  if (hovered?.kind !== 'node') return null
  const node = hovered.datum as HeroNode
  const position = graph.positions.get(hovered.key)
  if (!position) return null
  const point = graph.view.toScreen(position)
  return (
    <div
      className="tooltip"
      style={{ transform: `translate(${point.x + 14}px, ${point.y - 44}px)` }}
    >
      <strong>{node.label}</strong>
      <span>{messages.home.groupTooltip(node.group, node.weight)}</span>
    </div>
  )
}

function Legend(): JSX.Element {
  return (
    <div className="overlay legend">
      <strong>{messages.home.group}</strong>
      <ul>
        {heroGroups.map((group, index) => (
          <li key={group}>
            <span className="dot" style={{ background: `var(--graph-cat-${index + 1})` }} />
            {group}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HeroGraph(): JSX.Element {
  return (
    <Graph definition={definition} ariaLabel={messages.home.heroLabel} style={fill}>
      <Tools />
      <Tooltip />
      <div className="overlay overlay-count">
        <span>{messages.home.heroCount(data.nodes.length, data.links.length)}</span>
        <span className="small muted">{messages.home.heroHint}</span>
      </div>
      <Legend />
    </Graph>
  )
}
