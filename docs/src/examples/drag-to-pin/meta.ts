import type { ExampleMeta } from '../types'

export default {
  title: 'Drag to pin',
  description:
    'A dragged node stays where you drop it, and the force layout arranges the other nodes around the pinned ones. Double-click a pinned node to release it.',
  hint: 'Drag a node somewhere else. Double-click a ringed node to release it.',
  category: 'interaction',
  order: 80,
  tags: ['Vanilla'],
  api: ['graph-instance', 'events', 'force'],
  guides: ['layout#run-it-from-code', 'positions#move-nodes-from-code'],
} satisfies ExampleMeta
