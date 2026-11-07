import type { ExampleMeta } from '../types'

export default {
  title: 'Selection and lasso',
  description:
    'A thousand nodes from two arrays. Select a node to fade everything outside its neighborhood, or draw a lasso around several.',
  hint: 'Shift and drag to draw a lasso. Arrows move the focus, Enter selects.',
  category: 'interaction',
  order: 10,
  tags: ['Vanilla'],
  api: ['define-graph', 'graph-instance'],
  guides: ['states', 'interaction'],
} satisfies ExampleMeta
