import type { ExampleMeta } from '../types'

export default {
  title: 'Path through waypoints',
  description:
    'Select nodes in order: the route joins each stop to the next by the shortest path, weighted by edge length, and numbered markers follow the stops.',
  hint: 'Click a node, then Shift and click the next stops in order.',
  category: 'analysis',
  order: 80,
  tags: ['Vanilla'],
  api: ['paths', 'graph-instance'],
  guides: ['paths#weights-and-direction', 'drawing-layers#anchored-html'],
} satisfies ExampleMeta
