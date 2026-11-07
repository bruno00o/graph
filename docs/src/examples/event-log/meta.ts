import type { ExampleMeta } from '../types'

export default {
  title: 'Event log',
  description:
    'Every pointer, drag, selection, focus and view event of the graph, written to a log as it fires, with the typed item from your data.',
  hint: 'Hover, click, double-click, right-click and drag nodes, then pan and zoom.',
  category: 'basics',
  order: 50,
  tags: ['Vanilla'],
  api: ['events', 'graph-instance'],
  guides: ['interaction#events', 'typescript'],
} satisfies ExampleMeta
