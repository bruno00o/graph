import type { ExampleMeta } from '../types'

export default {
  title: 'Grid sorted by a field',
  description:
    'A grid layout whose order compares the data of two nodes: by group then weight, by weight, by label, or by degree. Nodes glide to their new cell and the view frames the grid.',
  hint: 'Change the sort or the number of columns.',
  category: 'layouts',
  order: 30,
  tags: ['Vanilla'],
  api: ['layouts'],
  guides: ['layout#grid-rings-and-radial'],
} satisfies ExampleMeta
