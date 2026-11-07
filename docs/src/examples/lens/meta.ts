import type { ExampleMeta } from '../types'

export default {
  title: 'Lens',
  description:
    'Twenty thousand nodes on fixed positions. A magnifying lens draws the area under it four times larger, with its own labels, and clicks inside it hit what it shows.',
  hint: 'Hold Alt over the graph, or show a fixed lens and drag it.',
  category: 'interaction',
  order: 20,
  tags: ['Vanilla'],
  api: ['define-graph', 'graph-instance'],
  guides: ['lens'],
} satisfies ExampleMeta
