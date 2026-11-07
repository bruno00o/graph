import type { ExampleMeta } from '../types'

export default {
  title: 'Flows on a map',
  description:
    'Edges that flow out of five hubs on a flat map, faster and wider with their volume. The long edges between hubs follow great circles and flow along their curve.',
  hint: 'Zoom in on a hub: dashes keep their speed on screen. Press Stop flows to freeze them.',
  category: 'time-and-maps',
  order: 90,
  tags: ['React'],
  api: ['map', 'edges'],
  guides: ['marks#flows', 'map#great-circles'],
} satisfies ExampleMeta
