import type { ExampleMeta } from '../types'

export default {
  title: 'Legend from your own rules',
  description:
    'Nodes and links are colored by rules of the application, not by a scale. The legend declares an entry per rule with its own label and swatch, and each entry tells which elements it covers, so hovering highlights them and a click hides them. A last entry is only displayed.',
  hint: 'Hover a rule in the legend, click it to hide its elements.',
  category: 'tools',
  order: 85,
  tags: ['React'],
  api: ['legend', 'define-graph'],
  guides: ['minimap-and-legend#a-legend-declared-by-the-application'],
} satisfies ExampleMeta
