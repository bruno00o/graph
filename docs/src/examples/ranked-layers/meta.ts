import type { ExampleMeta } from '../types'

export default {
  title: 'Layers fixed by the data',
  description:
    'A layered layout whose layers come from the data, one per kind, in an order you pick, instead of the direction of the edges. Edges against the order run back up, edges within a kind are left out of the layout, and nodes without a kind go on one more layer at the end.',
  hint: 'Change the order of the kinds, or switch to layers derived from the edges.',
  category: 'layouts',
  order: 75,
  tags: ['Vanilla'],
  api: ['layouts'],
  guides: ['layout#layers-by-rank'],
} satisfies ExampleMeta
