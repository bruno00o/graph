import type { ExampleMeta } from '../types'

export default {
  title: 'Fixed nodes among free ones',
  description:
    'Six anchors take their place from x and y in the data, and the force layout never moves them. The other nodes have no coordinates: they settle around the anchors they link to.',
  hint: 'Move the anchors, or drag one to a new place, then lay out again.',
  category: 'layouts',
  order: 80,
  tags: ['Vanilla'],
  api: ['nodes', 'force', 'graph-instance'],
  guides: ['layout#which-nodes-move', 'positions'],
} satisfies ExampleMeta
