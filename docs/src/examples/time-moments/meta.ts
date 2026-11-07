import type { ExampleMeta } from '../types'

export default {
  title: 'Moments and periods',
  description:
    'Nodes exist over a period, edges at a single moment. A three week window slides over the year: an edge shows while its moment is inside the window and both its nodes exist, and the fade lets it come and go gently.',
  hint: 'Press play, then change the fade.',
  category: 'time-and-maps',
  order: 60,
  tags: ['Vanilla'],
  api: ['timeline', 'define-graph', 'edges'],
  guides: ['time#give-elements-a-time', 'time#fade'],
} satisfies ExampleMeta
