import type { ExampleMeta } from '../types'

export default {
  title: 'Force layout in levels',
  description:
    'A grid of 2,304 nodes laid out by forces. In levels, the layout first places a coarse copy of the grid, then refines it, and the sheet comes out flat. In a single level, every node starts at once and the grid folds on itself.',
  hint: 'Switch to a single level: the same grid folds on itself.',
  category: 'layouts',
  order: 95,
  tags: ['Vanilla'],
  api: ['force'],
  guides: ['layout#large-graphs', 'layout#engines'],
} satisfies ExampleMeta
