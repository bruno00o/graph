import type { ExampleMeta } from '../types'

export default {
  title: 'Neighborhood exploration',
  description:
    'Start from one node and load its neighbors on demand with TanStack Query. A double-click unfolds a neighborhood, another folds it.',
  hint: 'Double-click a node to unfold or fold it.',
  category: 'data',
  order: 30,
  tags: ['React', 'TanStack Query'],
  api: ['create-exploration', 'graph-component'],
  guides: ['tanstack-query'],
  harness: { select: false },
} satisfies ExampleMeta
