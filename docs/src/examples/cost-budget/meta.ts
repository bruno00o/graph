import type { ExampleMeta } from '../types'

export default {
  title: 'Within a cost budget',
  description:
    'Each edge has a cost, drawn as its width. From the selected node, every node reachable within the budget takes a color from a sequential scale by its cost, and the rest fades.',
  hint: 'Click a node to start from it, then move the budget.',
  category: 'analysis',
  order: 50,
  tags: ['Vanilla'],
  api: ['paths', 'define-graph'],
  guides: ['paths#within-reach', 'scales#color'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
