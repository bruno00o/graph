import type { ExampleMeta } from '../types'

export default {
  title: 'Rings around a center',
  description:
    'Rings that fill outward in the order of a value: the heaviest nodes, the busiest or one group after another sit closest to the middle. Click a node to put it in the middle instead.',
  hint: 'Click a node to make it the center. Change what ranks the rings.',
  category: 'layouts',
  order: 40,
  tags: ['Vanilla'],
  api: ['layouts', 'graph-instance'],
  guides: ['layout#grid-rings-and-radial', 'states'],
  harness: { select: false },
} satisfies ExampleMeta
