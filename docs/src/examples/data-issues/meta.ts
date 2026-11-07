import type { ExampleMeta } from '../types'

export default {
  title: 'Problems in the data',
  description:
    'Duplicate keys, an edge whose end is missing and a parent that names no node do not break the graph: it keeps the first row, lets the edge wait and leaves the node at the top level. The devtools panel lists each problem.',
  hint: 'Read the issues in the panel, then add the missing nodes.',
  category: 'data',
  order: 100,
  tags: ['Vanilla', 'TanStack Devtools'],
  api: ['devtools', 'nodes'],
  guides: ['data#keys', 'data#edges-that-arrive-first', 'groups', 'devtools'],
} satisfies ExampleMeta
