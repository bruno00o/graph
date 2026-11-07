import type { ExampleMeta } from '../types'

export default {
  title: 'Size scale',
  description:
    'Node size read from a field through the size scale: a square root so that the area follows the value, a linear scale so that the diameter does, or an identity function.',
  hint: 'Switch the scale and compare the small values: the square root keeps them visible.',
  category: 'style',
  order: 50,
  tags: ['Vanilla'],
  api: ['define-graph', 'nodes'],
  guides: ['scales#size-and-width', 'scales#functions'],
} satisfies ExampleMeta
