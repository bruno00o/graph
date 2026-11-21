import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { Graph } from '@bruno00o/graph/react'
import type { JSX } from 'react'
import { createCommunities, type Item, type Link } from '../examples/shared/data'
import { messages } from '../messages'

const sample = createCommunities(3_000, 5_000, 5)

const definition = defineGraph({
  marks: [
    edges<Link>(sample.links, { source: 'from', target: 'to', opacity: 0.4 }),
    nodes<Item>(sample.items, { color: 'group', size: 'weight' }),
  ],
  scales: { size: { range: [4, 18] } },
  layout: force(),
  interaction: { pan: false, zoom: false, select: false, drag: false, keyboard: false },
})

const fill = { position: 'absolute', inset: 0 } as const

export function LayoutGraph(): JSX.Element {
  return <Graph definition={definition} ariaLabel={messages.home.layoutLabel} style={fill} />
}
