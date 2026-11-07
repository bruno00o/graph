import type { ExampleMeta } from '../types'

export default {
  title: 'Snap to a grid',
  description:
    'A grid that grows with the zoom, and nodes that land on its nearest free crossing when a drag ends. While dragging, an element pinned to the target crossing shows where the node will go.',
  hint: 'Drag a node and let go between two crossings. Change the grid: every node moves to the new one.',
  category: 'tools',
  order: 70,
  tags: ['Vanilla'],
  api: ['events', 'graph-instance', 'define-graph'],
  guides: [
    'positions#move-nodes-from-code',
    'drawing-layers#background-grid',
    'drawing-layers#anchored-html',
  ],
} satisfies ExampleMeta
