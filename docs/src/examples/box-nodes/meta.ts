import type { ExampleMeta } from '../types'

export default {
  title: 'Box nodes',
  description:
    'Rounded boxes as wide as their labels, in layers. The text takes the ink or the paper color, whichever reads better on the fill, and arrows stop at the border of each box.',
  hint: 'Switch the width, then turn the layers: the text, the edges and the layout follow the boxes.',
  category: 'style',
  order: 45,
  tags: ['Vanilla'],
  api: ['nodes', 'layouts'],
  guides: ['marks#boxes', 'marks#text-inside-a-node', 'layout#layers'],
} satisfies ExampleMeta
