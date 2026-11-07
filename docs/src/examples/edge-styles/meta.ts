import type { ExampleMeta } from '../types'

export default {
  title: 'Edge width, dashes and arrows',
  description:
    'Each edge reads its look from its data: the weight sets the width through the width scale, a field picks solid, dashed or dotted, and another the ends that carry an arrow head.',
  hint: 'Switch the width scale and watch the arrow heads: they grow with the line.',
  category: 'style',
  order: 80,
  tags: ['Vanilla'],
  api: ['edges', 'define-graph'],
  guides: ['marks#edge-options', 'scales#size-and-width'],
} satisfies ExampleMeta
