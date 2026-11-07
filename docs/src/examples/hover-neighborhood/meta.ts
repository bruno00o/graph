import type { ExampleMeta } from '../types'

export default {
  title: 'Neighborhood on hover',
  description:
    'Hover a node to bring out its neighbors and the edges between them while the rest fades, or hover an edge to bring out its two ends.',
  hint: 'Move the pointer over the nodes and the edges.',
  category: 'interaction',
  order: 40,
  tags: ['Vanilla'],
  api: ['events', 'paths'],
  guides: ['states', 'paths#within-reach'],
} satisfies ExampleMeta
