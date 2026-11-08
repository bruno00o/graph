import type { ExampleMeta } from '../types'

export default {
  title: 'Edges through waypoints',
  description:
    'Edges drawn through points placed by hand, around the nodes in their way. Their ends stay on the nodes as you drag them, while the points in between stay put.',
  hint: 'Drag a node: its edges keep their waypoints. Press Waypoints to compare with straight edges.',
  category: 'edges',
  order: 120,
  tags: ['Vanilla'],
  api: ['edges'],
  guides: ['marks#waypoints'],
} satisfies ExampleMeta
