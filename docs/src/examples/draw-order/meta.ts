import type { ExampleMeta } from '../types'

export default {
  title: 'Draw order',
  description:
    'Several nodes on the same place, such as stacks on a map: the order channel draws the big ones under the small ones, so every node of a stack shows, and a click picks the node drawn on top.',
  hint: 'Click a stack, then reverse the order and click it again.',
  category: 'style',
  order: 130,
  tags: ['Vanilla'],
  api: ['nodes'],
  guides: ['marks#drawing-order'],
} satisfies ExampleMeta
