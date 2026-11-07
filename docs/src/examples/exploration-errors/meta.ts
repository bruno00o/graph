import type { ExampleMeta } from '../types'

export default {
  title: 'Loading and errors while exploring',
  description:
    'Neighborhoods load on demand with TanStack Query from a server that fails a third of the first requests. The exploration store tells which nodes are loading and which failed, mirrored into graph states, and exploration.retry fetches a failed one again.',
  hint: 'Double-click a node to unfold it, double-click a node with a red ring to retry it.',
  category: 'data',
  order: 90,
  tags: ['React', 'TanStack Query'],
  api: ['create-exploration', 'graph-component', 'hooks'],
  guides: ['tanstack-query#read-the-exploration-state', 'states'],
  harness: { select: false },
} satisfies ExampleMeta
