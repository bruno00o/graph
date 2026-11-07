import type { ExampleMeta } from '../types'

export default {
  title: 'Graph on a map',
  description:
    'Places drawn by longitude and latitude inside a MapLibre map, in the same WebGL context, on the globe or on a flat map. Long routes follow great circles, and a hull encloses the selection. The map pans and zooms; the graph handles hover, selection, the lasso and node drags. The PNG export draws the map, the graph and the attribution.',
  hint: 'Drag the map to turn the globe, scroll to zoom. Click a place to animate its routes, Shift and drag to draw a lasso.',
  category: 'time-and-maps',
  order: 30,
  tags: ['React'],
  api: ['map', 'hull'],
  guides: ['map'],
} satisfies ExampleMeta
