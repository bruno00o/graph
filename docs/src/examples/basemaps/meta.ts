import type { ExampleMeta } from '../types'

export default {
  title: 'Basemaps',
  description:
    'A graph on a map with a basemap selector: five OpenFreeMap styles and a satellite layer built in code as a raster style. Edges and node outlines adapt to each basemap so the graph stays readable. Without a choice, the basemap follows the light or dark theme of the site.',
  hint: 'Pick a basemap, then switch the site theme to see the default follow it.',
  category: 'time-and-maps',
  order: 140,
  tags: ['React'],
  api: ['map'],
  guides: ['map'],
} satisfies ExampleMeta
