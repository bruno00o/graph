import type { ExampleMeta } from '../types'

export default {
  title: 'Positions computed by the app',
  description:
    'Arrangements written in the app, run as layouts: columns by group placed with placed(), and a tree per group computed with layout.compute() on the members alone, then set side by side. Each run glides, emits its events and frames its result. A force run lays out the nodes shown as a graph of their own once light nodes are hidden.',
  hint: 'Try each arrangement, then hide the light nodes and run the forces on the rest.',
  category: 'layouts',
  order: 140,
  tags: ['Vanilla'],
  api: ['layouts', 'graph-instance'],
  guides: ['layout#positions-from-your-code', 'layout#compute-without-moving'],
} satisfies ExampleMeta
