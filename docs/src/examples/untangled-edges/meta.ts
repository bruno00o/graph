import type { ExampleMeta } from '../types'

export default {
  title: 'Untangled force layout',
  description:
    'Twelve clusters linked in a tree, laid out by forces. Once the forces settle, a last pass turns the branches and moves the nodes that cross edges, and the nodes glide to where fewer edges cross. The count of crossings shows what it removes.',
  hint: 'Lay out without untangling: the same graph keeps more crossed edges.',
  category: 'layouts',
  order: 97,
  tags: ['Vanilla'],
  api: ['force'],
  guides: ['layout#untangle-crossed-edges'],
} satisfies ExampleMeta
