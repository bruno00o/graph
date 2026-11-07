import type { ExampleMeta } from '../types'

export default {
  title: 'Lay out again after a fold',
  description:
    'With relayout: true, folding or unfolding a group runs the force layout again over every node, so the drawing closes the gaps a fold leaves and makes room for a group that opens. Without it, only the nodes that appear are placed, and an unfolded group pushes its neighbors aside.',
  hint: 'Double-click a group to fold or unfold it, in both modes. Fold all, then unfold all.',
  category: 'structure',
  order: 80,
  tags: ['Vanilla'],
  api: ['define-graph', 'force', 'graph-instance'],
  guides: ['transformations#layout-after-a-change', 'groups#positions-and-layouts'],
} satisfies ExampleMeta
