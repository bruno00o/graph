import type { ExampleMeta } from '../types'

export default {
  title: 'Onto a map and back, in React',
  description:
    'One Graph component that moves between its own canvas and a MapLibre map with its surface prop. The legend, the button and the map inside it stay mounted, and so do the selection and the places where nodes were left.',
  hint: 'Hover an area in the legend, select or drag a node, show the map, then come back.',
  category: 'time-and-maps',
  order: 180,
  tags: ['React'],
  api: ['graph-component', 'map-graph', 'legend'],
  guides: ['map#react', 'react#maps'],
} satisfies ExampleMeta
