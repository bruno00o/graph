import type { ExampleMeta } from '../types'

export default {
  title: 'Distance rings',
  description:
    'A radial layout puts each node on the ring of its distance from the root. A shaded band for each distance is pinned to the root, so it follows it, and its label sits at the top of the band.',
  hint: 'Click a node to make it the root: the layout runs again and the bands follow.',
  category: 'layouts',
  order: 60,
  tags: ['Vanilla'],
  api: ['layouts', 'shapes', 'graph-instance'],
  guides: ['layout#grid-rings-and-radial', 'shapes#pin-shapes-to-nodes', 'shapes#labels'],
} satisfies ExampleMeta
