import type { ExampleMeta } from '../types'

export default {
  title: 'Bridges over crossings',
  description:
    'Straight edges jump over the edges they cross, without any routing: horizontal lines hop over vertical ones, as arcs or as gaps. The dashed edges set bridge to false and cross plainly.',
  hint: 'Drag a node: jumps follow the new crossings once it stops.',
  category: 'edges',
  order: 90,
  tags: ['Vanilla'],
  api: ['define-graph', 'edges'],
  guides: ['routing#bridges'],
} satisfies ExampleMeta
