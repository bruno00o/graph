import type { ExampleMeta } from '../types'

export default {
  title: 'Problems in the data',
  description:
    'Duplicate keys, an edge whose end is missing and a parent that names no node do not break the graph: it keeps the first row, lets the edge wait and leaves the node at the top level. graph.issues() lists the problems present, and issueschange tells when they change.',
  hint: 'Read the problems below the graph, then add the missing nodes.',
  category: 'data',
  order: 100,
  tags: ['Vanilla'],
  api: ['graph-instance', 'events', 'nodes'],
  guides: ['data#problems-in-the-data', 'data#edges-that-arrive-first', 'groups'],
} satisfies ExampleMeta
