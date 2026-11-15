import type { ExampleMeta } from '../types'

export default {
  title: 'A layout per group',
  description:
    'Each group lays out its members with a layout of its own: a chain in layers, a tree as a radial, a cycle in rings, a catalog on a grid, and three nested clusters by forces inside a grid. The layout around the groups then places each one as a single block and turns it to face its neighbors.',
  hint: 'Double-click a group to fold it, and again to unfold it: its members come out of it and its layout arranges them while the others make room. Add a node: only its group is laid out again. Switch the layout around the groups.',
  category: 'layouts',
  order: 105,
  tags: ['Vanilla'],
  api: ['nodes', 'layouts', 'force'],
  guides: ['layout#a-layout-per-group', 'groups'],
} satisfies ExampleMeta
