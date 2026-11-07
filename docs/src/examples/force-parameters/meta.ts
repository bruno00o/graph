import type { ExampleMeta } from '../types'

export default {
  title: 'Force parameters',
  description:
    'The four forces of the force layout on sliders: the length edges tend to, the push between nodes, the pull toward the center and the smallest gap. Each change gives the definition a new layout, which lays out every node again from where it is.',
  hint: 'Drag a slider and let go: the graph settles with the new value, then the view frames it.',
  category: 'layouts',
  order: 90,
  tags: ['Vanilla'],
  api: ['force', 'events'],
  guides: ['layout#force-options', 'layout#when-it-runs'],
} satisfies ExampleMeta
