import type { ExampleMeta } from '../types'

export default {
  title: 'Optimistic position writes',
  description:
    'persistPositions writes dragged positions to a TanStack DB collection at once, then saves them through a slow server. Its pendingState rings the nodes whose write is in flight, and a refused write moves the node back.',
  hint: 'Drag a node and watch its ring. Make the server refuse, then drag again.',
  category: 'data',
  order: 80,
  tags: ['Vanilla', 'TanStack DB'],
  api: ['persist-positions', 'nodes'],
  guides: ['tanstack-db#show-the-writes-in-flight', 'positions#listen-to-moves'],
} satisfies ExampleMeta
