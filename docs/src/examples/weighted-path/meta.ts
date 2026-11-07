import type { ExampleMeta } from '../types'

export default {
  title: 'Path costs',
  description:
    'Every edge shows its cost. Between two selected nodes, the cheapest path flows, and each node along it carries the cost paid to reach it, from the costs of the result.',
  hint: 'Click a node, then Shift and click another.',
  category: 'analysis',
  order: 60,
  tags: ['Vanilla'],
  api: ['paths', 'graph-instance'],
  guides: ['paths#weights-and-direction', 'drawing-layers#anchored-html'],
} satisfies ExampleMeta
