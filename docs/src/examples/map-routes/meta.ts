import type { ExampleMeta } from '../types'

export default {
  title: 'Routes along a network',
  description:
    'Edges on a flat map that follow winding lines instead of going straight, read from GeoJSON line strings. Each line goes through its points in order, from one node to the other.',
  hint: 'Hover a route to read its length in points. Press Routes to compare with straight edges.',
  category: 'time-and-maps',
  order: 130,
  tags: ['React'],
  api: ['edges', 'map'],
  guides: ['map#routes-along-a-network', 'marks#waypoints'],
} satisfies ExampleMeta
