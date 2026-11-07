import type { ExampleMeta } from '../types'

export default {
  title: 'Edge ends',
  description:
    'Exchanges in both directions on one edge: each half takes the color and width of its own value, splits halfway or by volume, and carries a label near its node.',
  hint: 'Hover each half of an edge to read the value its node sends.',
  category: 'edges',
  order: 20,
  tags: ['Vanilla'],
  api: ['edges'],
  guides: ['marks#edge-ends'],
} satisfies ExampleMeta
