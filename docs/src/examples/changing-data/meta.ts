import type { ExampleMeta } from '../types'

export default {
  title: 'Changing data',
  description:
    'A new array of nodes every second and a half: some nodes join, some leave, others change weight, and their size and color follow. Edges wait for their two ends.',
  hint: 'Drag a node: the next updates leave it where you put it, while its size and color keep changing.',
  category: 'basics',
  order: 70,
  tags: ['Vanilla'],
  api: ['graph-instance', 'define-graph', 'nodes'],
  guides: ['data#update-the-data', 'data#edges-that-arrive-first', 'vanilla#update'],
} satisfies ExampleMeta
