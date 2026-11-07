import type { ExampleMeta } from '../types'

export default {
  title: 'Save and restore positions',
  description:
    'Positions are saved once the layout ends, read node by node into plain JSON. Drag or scatter the nodes, then restore them with an animation, or download the JSON.',
  hint: 'Drag a few nodes or scatter them all, then restore.',
  category: 'tools',
  order: 50,
  tags: ['Vanilla'],
  api: ['graph-instance', 'force'],
  guides: ['positions#move-nodes-from-code', 'layout'],
} satisfies ExampleMeta
