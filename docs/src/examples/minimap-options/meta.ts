import type { ExampleMeta } from '../types'

export default {
  title: 'Minimap options',
  description:
    'The same minimap in another corner, at another size, with or without edges, in the colors of the graph or in one color. The selection stands out in it.',
  hint: 'Change the options. Hold Shift and drag around nodes to select them: they light up in the minimap.',
  category: 'tools',
  order: 40,
  tags: ['Vanilla'],
  api: ['minimap'],
  guides: ['minimap-and-legend#minimap'],
} satisfies ExampleMeta
