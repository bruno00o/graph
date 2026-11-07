import type { ExampleMeta } from '../types'

export default {
  title: 'Great circles without a map',
  description:
    'Nodes placed by longitude and latitude on a plain graph, without a map. Long edges follow great circles: they bend toward the poles, and an edge that crosses the antimeridian is cut at the edge of the world.',
  hint: 'Press Long edges to compare great circles with straight lines.',
  category: 'edges',
  order: 80,
  tags: ['Vanilla'],
  api: ['edges', 'map'],
  guides: ['map#great-circles', 'positions#longitude-and-latitude'],
} satisfies ExampleMeta
