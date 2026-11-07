import type { ExampleMeta } from '../types'

export default {
  title: 'Collaboration across tabs',
  description:
    'Nodes read from a TanStack DB collection. Drag a node in one tab and watch it move in the other.',
  hint: 'Open this page in a second tab, then drag a node.',
  category: 'data',
  order: 20,
  tags: ['React', 'TanStack DB'],
  api: ['persist-positions', 'graph-component', 'hooks'],
  guides: ['tanstack-db'],
} satisfies ExampleMeta
