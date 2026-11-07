import type { ExampleMeta } from '../types'

export default {
  title: 'Navigation',
  description:
    'A graph inside a page that scrolls: the wheel scrolls the page, Cmd or Ctrl and the wheel zooms, and the view cannot leave the nodes. Switch the wheel mode and the bounds.',
  hint: 'Scroll over the graph, then hold Cmd or Ctrl to zoom. Pinch to zoom. Drag a node to the edge.',
  category: 'basics',
  order: 20,
  tags: ['Vanilla'],
  api: ['define-graph', 'mount-graph', 'graph-instance'],
  guides: ['interaction#wheel-and-trackpad', 'view#view-limits'],
} satisfies ExampleMeta
