import type { ExampleMeta } from '../types'

export default {
  title: 'Large graph',
  description:
    '50,000 nodes and 100,000 edges drawn with WebGL2. Pan, zoom, hover and drag any node.',
  hint: 'Scroll to zoom, drag the background to pan.',
  category: 'basics',
  order: 10,
  tags: ['Vanilla'],
  api: ['define-graph', 'nodes', 'edges', 'mount-graph'],
  guides: ['data', 'vanilla'],
} satisfies ExampleMeta
