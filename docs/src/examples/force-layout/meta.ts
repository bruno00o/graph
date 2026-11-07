import type { ExampleMeta } from '../types'

export default {
  title: 'Force layout',
  description:
    'Nodes without coordinates settle into communities with a force simulation, on the GPU from 2,000 nodes and on the CPU below, in a Web Worker.',
  hint: 'Drag a node while it runs to pin it. Add nodes: only the new ones move.',
  category: 'layouts',
  order: 10,
  tags: ['Vanilla'],
  api: ['force', 'graph-instance'],
  guides: ['layout'],
} satisfies ExampleMeta
