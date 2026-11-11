import type { ExampleMeta } from '../types'

export default {
  title: 'Loading overlay',
  description:
    'A TanStack DB collection syncs its rows in three delayed batches. The graph tells when its data is loading, then lays out and frames the complete graph once.',
  hint: 'Load again, or load with an error: the overlay follows data.loading, and the status reads data.failed.',
  category: 'data',
  order: 150,
  tags: ['Vanilla', 'TanStack DB'],
  api: ['graph-instance', 'define-graph', 'events'],
  guides: ['data#loading', 'tanstack-db#know-when-it-is-loaded'],
} satisfies ExampleMeta
