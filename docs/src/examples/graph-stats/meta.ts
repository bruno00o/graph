import type { ExampleMeta } from '../types'

export default {
  title: 'Live statistics from the store',
  description:
    'Each part of the panel reads its own slice of the graph state with useGraphState, and renders again only when that slice changes: the counters show how often. The element counts come from graph.count(), which returns the same object until what is drawn changes.',
  hint: 'Pan, hover, click and select with Shift and a drag: only the matching part of the panel renders. Hide the selection to change the counts.',
  category: 'tools',
  order: 90,
  tags: ['React'],
  api: ['hooks', 'graph-component', 'graph-instance'],
  guides: ['react#hooks', 'states'],
} satisfies ExampleMeta
