import type { ExampleMeta } from '../types'

export default {
  title: 'Layouts',
  description:
    'A directed graph laid out in layers, in any direction, then with forces, on a grid sorted by group, in rings by degree and as a radial tree. Nest its branches in groups: the layers keep flowing across them. Nodes glide to their new place and the view frames the result.',
  hint: 'Switch the layout, the direction or the groups. Shift and drag around some nodes, then arrange only them.',
  category: 'layouts',
  order: 20,
  tags: ['Vanilla'],
  api: ['layouts', 'force'],
  guides: ['layout'],
} satisfies ExampleMeta
