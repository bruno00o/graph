import type { ExampleMeta } from '../types'

export default {
  title: 'Node shapes',
  description:
    'Circles, squares and diamonds, picked per node by a function: the shape tells the level of a tree, and the selection ring follows it.',
  hint: 'Cycle the shape, then select a node: its ring takes the shape of the node.',
  category: 'style',
  order: 40,
  tags: ['Vanilla'],
  api: ['nodes', 'define-graph'],
  guides: ['marks#node-options', 'marks#channels-and-styles', 'scales#functions'],
} satisfies ExampleMeta
