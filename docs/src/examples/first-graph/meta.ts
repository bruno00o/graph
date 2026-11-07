import type { ExampleMeta } from '../types'

export default {
  title: 'First graph',
  description:
    'Two small arrays, one of nodes and one of edges, become a graph: the group picks a color, the weight a size, and every edge points to its target.',
  hint: 'Hover a node, drag it, click it to select it, scroll to zoom.',
  category: 'basics',
  order: 0,
  tags: ['Vanilla'],
  api: ['define-graph', 'nodes', 'edges', 'mount-graph'],
  guides: ['quick-start', 'marks', 'data'],
} satisfies ExampleMeta
