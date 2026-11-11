import type { ExampleMeta } from '../types'

export default {
  title: 'Linked views',
  description:
    'An overview and a detail of the same graph, built from one definition. The overview draws the area the detail shows, a frame you can drag. The selection is shared, and selecting in the overview frames the node in the detail.',
  hint: 'Drag the frame in the overview, or select a node in either graph.',
  category: 'interaction',
  order: 120,
  tags: ['React'],
  api: ['graph-component', 'hooks', 'anchor'],
  guides: ['view#fit', 'react#controlled-selection', 'drawing-layers#anchored-html'],
} satisfies ExampleMeta
