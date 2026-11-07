import type { ExampleMeta } from '../types'

export default {
  title: 'Merge parallel edges by kind',
  description:
    'Pairs of nodes joined by many edges of three kinds. Merge them by kind into one line per kind, as wide as its count and labeled with it, or every kind together into a single line. Pairs with fewer edges than the minimum keep them apart.',
  hint: 'Change the merge and the fewest edges that merge. Hover a line to read what it holds.',
  category: 'structure',
  order: 50,
  tags: ['Vanilla'],
  api: ['edges', 'events'],
  guides: ['transformations#merge-parallel-edges'],
} satisfies ExampleMeta
