import type { ExampleMeta } from '../types'

export default {
  title: 'Edges in batches',
  description:
    '100,000 nodes receive edges 50,000 at a time, up to 400,000, each batch in a new array. Edges already drawn keep their row, so a batch costs about the same whatever the size of the graph.',
  hint: 'Add batches and read the time each one takes to reach the screen.',
  category: 'data',
  order: 110,
  tags: ['Vanilla'],
  api: ['edges', 'graph-instance'],
  guides: ['data#update-the-data'],
} satisfies ExampleMeta
