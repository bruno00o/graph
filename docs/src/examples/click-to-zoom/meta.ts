import type { ExampleMeta } from '../types'

export default {
  title: 'Click to zoom',
  description:
    'Click a node and the view glides to frame it with its neighbors. Click the background to see the whole graph again.',
  hint: 'Click a node, then click the background.',
  category: 'interaction',
  order: 50,
  tags: ['Vanilla'],
  api: ['graph-instance', 'events'],
  guides: ['view#fit', 'interaction#events'],
} satisfies ExampleMeta
