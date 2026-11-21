import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'
import type { JSX } from 'react'
import { createSample, type Item, type Link } from '../examples/shared/data'
import { messages } from '../messages'

const sample = createSample(5_000, 6_000, 8, 21)

const definition = defineGraph({
  marks: [
    edges<Link>(sample.links, { source: 'from', target: 'to', opacity: 0.35 }),
    nodes<Item>(sample.items, { x: (item) => item.x * 2.6, y: 'y', color: 'group', size: 4 }),
  ],
  interaction: { pan: false, zoom: false, select: false, drag: false, keyboard: false },
})

const fill = { position: 'absolute', inset: 0 } as const

export function DenseGraph(): JSX.Element {
  return <Graph definition={definition} ariaLabel={messages.home.denseLabel} style={fill} />
}
