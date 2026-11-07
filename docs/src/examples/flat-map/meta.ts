import type { ExampleMeta } from '../types'

export default {
  title: 'Nodes on a flat map',
  description:
    'Nodes placed by longitude and latitude on a flat MapLibre map, with straight edges between them. The map pans and zooms, and nodes keep their size on screen; the graph keeps hover, selection, the lasso and node drags.',
  hint: 'Hover a node to read its coordinates. Hold Shift and drag to draw a lasso.',
  category: 'time-and-maps',
  order: 80,
  tags: ['React'],
  api: ['map', 'nodes'],
  guides: ['map#mount-on-a-map', 'positions#longitude-and-latitude'],
} satisfies ExampleMeta
