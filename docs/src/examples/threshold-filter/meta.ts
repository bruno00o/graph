import type { ExampleMeta } from '../types'

export default {
  title: 'Filter with a hidden state',
  description:
    'A slider puts the nodes below a weight in a state declared with hide: true. They leave the drawing with their edges, but keep their place and their selection, and come back as they were.',
  hint: 'Select a few small nodes, raise the smallest weight, then lower it again.',
  category: 'structure',
  order: 40,
  tags: ['Vanilla'],
  api: ['define-graph', 'graph-instance'],
  guides: ['transformations#hide-without-losing-state', 'states'],
} satisfies ExampleMeta
