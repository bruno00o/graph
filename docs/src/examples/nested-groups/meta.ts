import type { ExampleMeta } from '../types'

export default {
  title: 'Nested groups',
  description:
    'Nodes in nested groups, laid out by forces or in layers, with every container kept whole. Fold a group into a single node: the edges that cross it merge into one edge per pair, styled by their count.',
  hint: 'Double-click a group to fold or unfold it. Drag a group by its border to move everything inside. Switch to layers to see the edges flow across the groups.',
  category: 'structure',
  order: 10,
  tags: ['Vanilla'],
  api: ['nodes', 'edges', 'layouts'],
  guides: ['groups'],
} satisfies ExampleMeta
