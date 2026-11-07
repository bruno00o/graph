import type { ExampleMeta } from '../types'

export default {
  title: 'Screen units',
  description:
    'Large zones sized in world units grow and shrink with the zoom, while the markers inside them keep the same size on screen at every zoom level.',
  hint: 'Zoom in and out, then switch the markers to world units and zoom again.',
  category: 'style',
  order: 100,
  tags: ['Vanilla'],
  api: ['nodes', 'define-graph'],
  guides: ['marks#screen-units', 'zoom'],
} satisfies ExampleMeta
