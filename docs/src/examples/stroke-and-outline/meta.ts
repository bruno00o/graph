import type { ExampleMeta } from '../types'

export default {
  title: 'Stroke and outline',
  description:
    'Two contours for a node: stroke draws inside the shape and eats into the fill, outline draws a ring outside it, and the label and the selection halo make room for the ring.',
  hint: 'Click nodes of each row: the selection recolors the stroke and its halo starts past the outline.',
  category: 'style',
  order: 90,
  tags: ['Vanilla'],
  api: ['nodes', 'define-graph'],
  guides: ['marks#outlines', 'states#override-the-built-in-states'],
} satisfies ExampleMeta
