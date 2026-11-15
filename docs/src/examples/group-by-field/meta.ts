import type { ExampleMeta } from '../types'

export default {
  title: 'Group by a field',
  description:
    'The groups() mark adds one group node per value of a field and folds the items into it: the edges between two groups merge into one, as wide as their count. A folded group counts its items in a badge, an unfolded one in the label of its container. Group by another field, or by nothing, and the layout runs again over the new graph.',
  hint: 'Double-click a group to unfold it. Change the field the items are grouped by.',
  category: 'structure',
  order: 60,
  tags: ['Vanilla'],
  api: ['groups', 'edges'],
  guides: [
    'transformations#group-items-by-a-field',
    'transformations#layout-after-a-change',
    'groups#label-and-badges-of-an-unfolded-group',
  ],
} satisfies ExampleMeta
