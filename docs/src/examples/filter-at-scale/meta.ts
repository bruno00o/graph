import type { ExampleMeta } from '../types'

export default {
  title: 'Filtering at scale',
  description:
    'Nodes come from a TanStack DB collection through a filtered subscription, so a new filter only moves the rows that enter or leave it. Edges load on demand from a simulated server, a few at a time.',
  hint: 'Change the filter and read the timings. Double-click a node to load its edges.',
  category: 'data',
  order: 10,
  tags: ['Vanilla', 'TanStack DB'],
  api: ['subset'],
  guides: ['tanstack-db'],
  harness: { select: false },
} satisfies ExampleMeta
