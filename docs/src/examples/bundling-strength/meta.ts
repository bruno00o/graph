import type { ExampleMeta } from '../types'

export default {
  title: 'Bundling strength',
  description:
    'A slider sets how much of the bundled shape is drawn, from straight lines at 0 to full bundles at 1. A new strength alone eases the edges to it without bundling again: the count below stays at one.',
  hint: 'Drag the slider. Then drag a node: edges bundle again once it stops.',
  category: 'edges',
  order: 100,
  tags: ['Vanilla'],
  api: ['bundling'],
  guides: ['bundling'],
} satisfies ExampleMeta
