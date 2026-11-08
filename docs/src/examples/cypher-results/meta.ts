import type { ExampleMeta } from '../types'

export default {
  title: 'Cypher results',
  description:
    'Explore a graph database one neighborhood at a time. A small in-memory database answers a Cypher query with rows shaped like the official driver, cypherGraph turns each result into nodes and edges, and an exploration adds them on a double-click.',
  hint: 'Double-click a node to load its neighbors, double-click it again to fold them.',
  category: 'data',
  order: 120,
  tags: ['Vanilla', 'TanStack Query'],
  api: ['cypher-graph', 'create-exploration'],
  guides: ['cypher', 'tanstack-query'],
  harness: { select: false },
} satisfies ExampleMeta
