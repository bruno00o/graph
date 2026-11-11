import type { ExampleMeta } from '../types'

export default {
  title: 'Merges, groups and filters',
  description:
    'Items in four sectors linked by parallel exchanges. Merge the exchanges of each pair into one line whose halves show, hover and select each direction, group the items by sector into folded group nodes, and hide a family from the legend without losing the selection.',
  hint: 'Click a half of a two-way line to select one direction. Switch the merge and the sectors. Double-click a sector to unfold it. Click a family in the legend to hide it.',
  category: 'structure',
  order: 20,
  tags: ['Vanilla'],
  api: ['edges', 'groups', 'legend'],
  guides: ['transformations'],
} satisfies ExampleMeta
