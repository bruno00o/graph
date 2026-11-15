import type { ExampleMeta } from '../types'

export default {
  title: 'Stacked places',
  description:
    'Nodes that share their longitude and latitude, grouped by place on a MapLibre map. While a group is unfolded, its nodes spread around their place, a few pixels apart at every zoom, and go back to it when the group folds. Without groups, the spread option of the definition moves them apart the same way. Their coordinates never change.',
  hint: 'Zoom in and out: the gaps stay the same. Double-click a container to fold it, press Spread to stack the nodes again, and Groups to spread them without groups.',
  category: 'time-and-maps',
  order: 120,
  tags: ['React'],
  api: ['groups', 'nodes', 'define-graph'],
  guides: ['groups#spread-children', 'positions#nodes-at-one-place', 'map#hulls-and-groups'],
} satisfies ExampleMeta
