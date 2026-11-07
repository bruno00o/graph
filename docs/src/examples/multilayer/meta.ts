import type { ExampleMeta } from '../types'

export default {
  title: 'Multilayer graph',
  description:
    'Three layers of edges between the same places: segments, paths that run along segments, and routes that run along paths. Hide a layer from the legend, and click an edge to light what carries it and what it carries.',
  hint: 'Click an edge. Click a layer in the legend to hide it.',
  category: 'structure',
  order: 30,
  tags: ['Vanilla'],
  api: ['edges', 'support', 'legend'],
  guides: ['multilayer'],
} satisfies ExampleMeta
