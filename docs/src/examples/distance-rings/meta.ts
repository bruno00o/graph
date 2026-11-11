import type { ExampleMeta } from '../types'

export default {
  title: 'Distance rings',
  description:
    'A radial layout puts each node on the ring of its distance from the root. A dashed ring and a label for each distance, drawn from the final positions in an element that follows the root and the zoom.',
  hint: 'Click a node to make it the root: the layout runs again and the rings follow.',
  category: 'layouts',
  order: 60,
  tags: ['Vanilla'],
  api: ['layouts', 'graph-instance', 'anchor'],
  guides: [
    'layout#grid-rings-and-radial',
    'layout#run-it-from-code',
    'drawing-layers#anchored-html',
  ],
} satisfies ExampleMeta
