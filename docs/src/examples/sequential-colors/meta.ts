import type { ExampleMeta } from '../types'

export default {
  title: 'Sequential colors',
  description:
    'A numeric value colors nodes and edges along a gradient: two or three color stops, a domain that clamps what falls outside it, and the default range over the extent of the data.',
  hint: 'Cycle the colors: over 40 to 60, every value below 40 takes the first color.',
  category: 'style',
  order: 70,
  tags: ['Vanilla'],
  api: ['define-graph', 'nodes', 'edges', 'legend'],
  guides: ['scales#color', 'theming#colors-in-your-options'],
} satisfies ExampleMeta
