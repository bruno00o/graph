import type { ExampleMeta } from '../types'

export default {
  title: 'Edge routing',
  description:
    'A layered graph whose edges run in horizontal and vertical segments around the nodes, with rounded corners, ends spread along the sides of each node and side by side routes kept apart. Where two edges cross, one hops over the other.',
  hint: 'Drag a node: its routes follow, then go around the nodes again once it stops.',
  category: 'edges',
  order: 40,
  tags: ['Vanilla'],
  api: ['routing', 'layouts'],
  guides: ['routing'],
} satisfies ExampleMeta
