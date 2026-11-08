import type { ExampleMeta } from '../types'

export default {
  title: 'Places by longitude and latitude',
  description:
    'Seven areas of places laid out with the geo layout: nodes sit where their coordinates project, as on a map, and those that overlap move apart a little. Places shared by several nodes become rings and spirals, and nodes without coordinates join their neighbors.',
  hint: 'Leave the overlaps in place to see the piles, or change the spacing.',
  category: 'layouts',
  order: 120,
  tags: ['Vanilla'],
  api: ['layouts'],
  guides: ['layout#geography', 'map#with-and-without-a-map'],
} satisfies ExampleMeta
