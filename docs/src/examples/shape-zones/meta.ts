import type { ExampleMeta } from '../types'

export default {
  title: 'Shapes under the graph',
  description:
    'Free shapes drawn under the nodes and edges: an area with a hole, a ring, a rounded rectangle and a dashed line, with nodes placed over them by their coordinates. Shapes are selected like nodes, and a selected zone fades the rest of the graph.',
  hint: 'Click a shape to select it and fade the rest, Shift and drag to lasso, and zoom into the rectangle to see its plots. Press Frame to fit each shape in turn.',
  category: 'structure',
  order: 100,
  tags: ['Vanilla'],
  api: ['shapes', 'graph-instance', 'events'],
  guides: ['shapes#selecting-and-hovering', 'shapes#states', 'shapes#zoom-time-and-layers'],
} satisfies ExampleMeta
