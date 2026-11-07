import type { ExampleMeta } from '../types'

export default {
  title: 'A legend of your own',
  description:
    'createLegend reads the color scale and counts the nodes of each group; this example draws it with its own markup, a bar per group. Hover highlights a group, a click hides it from the graph, and Alt and a click keeps only that group.',
  hint: 'Hover a group, click it to hide it, Alt and click to keep only it.',
  category: 'tools',
  order: 80,
  tags: ['Vanilla'],
  api: ['legend', 'define-graph'],
  guides: ['minimap-and-legend#highlight-and-switch-off', 'transformations#from-the-legend'],
} satisfies ExampleMeta
