import type { ExampleMeta } from '../types'

export default {
  title: 'Edge bundling',
  description:
    'Edges between communities of a force layout merge into bundles once nodes stand still, computed by density in a Web Worker. Change the strength and the reach, or turn bundling off: edges glide between shapes.',
  hint: 'Drag a node: edges bundle again once it stops.',
  category: 'edges',
  order: 30,
  tags: ['Vanilla'],
  api: ['bundling', 'force'],
  guides: ['bundling'],
} satisfies ExampleMeta
