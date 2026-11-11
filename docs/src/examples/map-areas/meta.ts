import type { ExampleMeta } from '../types'

export default {
  title: 'Shapes on a map',
  description:
    'Areas from GeoJSON polygons, circles of 900 kilometers around places and a dashed line, drawn under the graph on a MapLibre map. An area and the line cross the antimeridian: on the flat map they show on both sides, and on the globe their long edges follow the surface.',
  hint: 'Turn the globe, then press Projection to see the same shapes flat. Click an area to fade the rest, Shift and drag to lasso.',
  category: 'time-and-maps',
  order: 150,
  tags: ['React'],
  api: ['shapes', 'map'],
  guides: ['map#shapes', 'shapes#on-a-map'],
} satisfies ExampleMeta
