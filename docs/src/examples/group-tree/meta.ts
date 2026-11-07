import type { ExampleMeta } from '../types'

export default {
  title: 'Group tree beside the graph',
  description:
    'Groups nested three deep, with a tree that folds and unfolds them. React state owns the folded groups through folded and onFoldChange, so the tree, the level buttons and a double-click on the graph all change the same list, and the layout runs again after each change.',
  hint: 'Fold a level, open a group from the tree, or double-click a group in the graph.',
  category: 'structure',
  order: 90,
  tags: ['React'],
  api: ['graph-component', 'define-graph', 'nodes'],
  guides: ['groups#controlled-folding', 'groups#fold-and-unfold', 'react'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
