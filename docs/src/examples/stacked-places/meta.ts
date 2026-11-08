import type { ExampleMeta } from '../types'

export default {
  title: 'Stacked places',
  description:
    'Nodes that share their longitude and latitude, grouped by place on a MapLibre map. While a group is unfolded, its nodes spread around their place, a few pixels apart at every zoom, and go back to it when the group folds. Their coordinates never change.',
  hint: 'Zoom in and out: the gaps stay the same. Double-click a container to fold it, and press Spread to stack the nodes again.',
  category: 'time-and-maps',
  order: 120,
  tags: ['React'],
  api: ['groups', 'nodes'],
  guides: ['groups#spread-children', 'map#hulls-and-groups'],
} satisfies ExampleMeta
