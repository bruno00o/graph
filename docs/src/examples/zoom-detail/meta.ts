import type { ExampleMeta } from '../types'

export default {
  title: 'Zoom and level of detail',
  description:
    'Three tiers of nodes on fixed positions. Branches and leaves fade in as the view zooms in, and the dashed links between hubs fade out. Hidden elements are neither picked, labeled nor exported.',
  hint: 'Scroll to zoom in on a hub.',
  category: 'time-and-maps',
  order: 10,
  tags: ['Vanilla'],
  api: ['nodes', 'edges'],
  guides: ['zoom'],
} satisfies ExampleMeta
