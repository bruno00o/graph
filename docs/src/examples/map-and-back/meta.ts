import type { ExampleMeta } from '../types'

export default {
  title: 'Onto a map and back',
  description:
    'One graph that moves between its own canvas, laid out with the geo layout, and a MapLibre map, where nodes sit on their longitude and latitude. The selection, the states and where each node was left on each side stay across the moves.',
  hint: 'Select or drag a node, show the map, then come back: the plain graph is as you left it.',
  category: 'time-and-maps',
  order: 170,
  tags: ['Vanilla'],
  api: ['map', 'mount-graph'],
  guides: ['map#with-and-without-a-map'],
} satisfies ExampleMeta
