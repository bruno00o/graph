import type { ExampleMeta } from '../types'

export default {
  title: 'Filter by degree',
  description:
    'The degree of each node, counted from the edge array, sets its size. A slider hides the nodes with fewer edges, and their edges with them, through a state.',
  hint: 'Move the slider to keep only the best connected nodes.',
  category: 'analysis',
  order: 20,
  tags: ['Vanilla'],
  api: ['nodes', 'define-graph'],
  guides: ['states#hide-members', 'scales#size-and-width'],
} satisfies ExampleMeta
