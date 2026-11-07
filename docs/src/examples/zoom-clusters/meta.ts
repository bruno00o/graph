import type { ExampleMeta } from '../types'

export default {
  title: 'Groups that open with the zoom',
  description:
    'From afar, each group is one disc and the edges between groups are counted on one line. Zoom in: the discs and their lines fade out while the nodes and their own edges fade in. Two marks of each kind, one with maxZoom and one with minZoom.',
  hint: 'Scroll to zoom in on a group, then out again.',
  category: 'time-and-maps',
  order: 40,
  tags: ['Vanilla'],
  api: ['nodes', 'edges'],
  guides: ['zoom'],
} satisfies ExampleMeta
