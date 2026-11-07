import type { ExampleMeta } from '../types'

export default {
  title: 'Named states',
  description:
    'Two states of your own, declared with their style: the neighbors of the selection take an accent contour and their labels, the rest of the graph fades, and raise draws the neighbors above it.',
  hint: 'Click a node, then switch the neighbors to drawn in place and look at their edges.',
  category: 'style',
  order: 110,
  tags: ['Vanilla'],
  api: ['define-graph', 'graph-instance', 'events'],
  guides: ['states#declare-a-state', 'states#raise-a-state', 'paths'],
} satisfies ExampleMeta
