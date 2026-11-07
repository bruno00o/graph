import type { ExampleMeta } from '../types'

export default {
  title: 'Positions from data',
  description:
    'The x and y channels read where each node goes from its data. A new array with other coordinates moves the nodes there, animated, and a node only moves when its own coordinates change.',
  hint: 'Change the arrangement. Drag a node, then move group A: only group A moves.',
  category: 'data',
  order: 40,
  tags: ['Vanilla'],
  api: ['nodes', 'define-graph'],
  guides: ['positions', 'data#update-the-data'],
} satisfies ExampleMeta
