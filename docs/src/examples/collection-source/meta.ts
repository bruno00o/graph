import type { ExampleMeta } from '../types'

export default {
  title: 'A collection as the source',
  description:
    'Nodes and edges read from two TanStack DB collections. Inserts, updates and deletes reach the graph through the subscription: the definition never changes.',
  hint: 'Insert, update or delete a row: the node that changed gets a ring.',
  category: 'data',
  order: 50,
  tags: ['Vanilla', 'TanStack DB'],
  api: ['nodes', 'edges', 'force'],
  guides: ['tanstack-db', 'data'],
} satisfies ExampleMeta
