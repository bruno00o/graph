import type { ExampleMeta } from '../types'

export default {
  title: 'A live source of your own',
  description:
    'Any object with a subscribeChanges method is a live source. This one streams nodes and edges in batches, and grows the nodes that receive links, without TanStack DB. Each batch lays out only its new nodes; once the stream ends, one run lays out the whole graph.',
  hint: 'Watch the graph grow, pause the stream, or start it again.',
  category: 'data',
  order: 60,
  tags: ['Vanilla'],
  api: ['nodes', 'edges', 'force'],
  guides: ['data#two-kinds-of-data', 'layout#when-it-runs'],
} satisfies ExampleMeta
