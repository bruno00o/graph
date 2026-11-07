import type { ExampleMeta } from '../types'

export default {
  title: 'Grid, hulls and anchors',
  description:
    'A background grid that adapts to the zoom, hulls around each group or around the selection, and HTML pinned to nodes and edges: a toolbar over the selection, a tooltip, group names.',
  hint: 'Click a node for its toolbar, Shift to add more. Drag a node: its hull follows.',
  category: 'style',
  order: 30,
  tags: ['Vanilla'],
  api: ['define-graph', 'hull', 'graph-instance'],
  guides: ['drawing-layers'],
} satisfies ExampleMeta
