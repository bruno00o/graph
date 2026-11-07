import type { ExampleMeta } from '../types'

export default {
  title: 'Radial tree from a root',
  description:
    'A radial layout walks the graph from a root and puts each node on the ring of its distance, next to the node it was reached from, each branch in a slice the size of its leaves. Click any node to walk from it instead.',
  hint: 'Click a node to make it the root.',
  category: 'layouts',
  order: 50,
  tags: ['Vanilla'],
  api: ['layouts', 'graph-instance'],
  guides: ['layout#grid-rings-and-radial', 'layout#run-it-from-code'],
  harness: { select: false },
} satisfies ExampleMeta
