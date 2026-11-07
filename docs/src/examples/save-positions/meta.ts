import type { ExampleMeta } from '../types'

export default {
  title: 'Save and restore positions',
  description:
    'Positions are saved once the layout ends, in one snapshot of every node, shown as plain JSON. Drag or scatter the nodes, then give the snapshot back to restore them with an animation, or download the JSON.',
  hint: 'Drag a few nodes or scatter them all, then restore.',
  category: 'tools',
  order: 50,
  tags: ['Vanilla'],
  api: ['graph-instance', 'force'],
  guides: ['positions#save-and-restore', 'layout#save-the-result'],
} satisfies ExampleMeta
