import type { ExampleMeta } from '../types'

export default {
  title: 'A layout of your own',
  description:
    'A circle layout written in a few lines against the Layout port: it reads the item of each free node to sort it by group, leaves a gap between groups, and reports the result at once, so nodes glide there like with the built-in layouts.',
  hint: 'Switch to forces and back: both layouts go through the same port.',
  category: 'layouts',
  order: 110,
  tags: ['Vanilla'],
  api: ['define-graph', 'force'],
  guides: ['layout#write-your-own-layout'],
} satisfies ExampleMeta
