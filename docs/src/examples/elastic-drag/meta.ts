import type { ExampleMeta } from '../types'

export default {
  title: 'Elastic drag',
  description:
    'The neighbors of a dragged node follow it as if the edges were springs, less and less with each hop, and settle where they are pulled once it is dropped.',
  hint: 'Drag a node and watch its neighbors follow. The button turns the springs off.',
  category: 'interaction',
  order: 85,
  tags: ['Vanilla'],
  api: ['define-graph', 'force'],
  guides: ['interaction#let-the-neighbors-follow'],
} satisfies ExampleMeta
