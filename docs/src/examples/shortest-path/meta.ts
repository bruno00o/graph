import type { ExampleMeta } from '../types'

export default {
  title: 'Shortest path',
  description:
    'Select two nodes: the shortest path between them flows from one to the other, and the rest fades. Count the edges, or weigh each one by its drawn length.',
  hint: 'Click a node, then Shift and click another. Switch the weight to compare.',
  category: 'analysis',
  order: 10,
  tags: ['Vanilla'],
  api: ['paths', 'graph-instance'],
  guides: ['paths', 'marks#flows'],
} satisfies ExampleMeta
