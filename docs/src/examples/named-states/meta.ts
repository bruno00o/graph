import type { ExampleMeta } from '../types'

export default {
  title: 'Named states',
  description:
    'A state of your own, declared with its style: the neighbors of the selection take an accent contour and their labels, its others style fades the rest of the graph, and raise draws the neighbors above it.',
  hint: 'Click a node, then switch the neighbors to drawn in place and look at their edges.',
  category: 'style',
  order: 110,
  tags: ['Vanilla'],
  api: ['define-graph', 'graph-instance', 'events'],
  guides: ['states#declare-a-state', 'states#style-the-others', 'states#raise-a-state', 'paths'],
} satisfies ExampleMeta
