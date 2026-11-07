import type { ExampleMeta } from '../types'

export default {
  title: 'Live query with a join',
  description:
    'Nodes come from a TanStack DB live query that joins two collections and keeps the rows above a minimum score. When scores change, nodes enter, leave and resize, with the same definition.',
  hint: 'Score some nodes again, then change the minimum.',
  category: 'data',
  order: 70,
  tags: ['Vanilla', 'TanStack DB'],
  api: ['nodes', 'define-graph'],
  guides: ['tanstack-db#filter-a-large-collection', 'data#edges-that-arrive-first'],
} satisfies ExampleMeta
