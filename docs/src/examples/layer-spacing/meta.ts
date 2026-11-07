import type { ExampleMeta } from '../types'

export default {
  title: 'Layer direction and spacing',
  description:
    'A directed graph in layers that point right, down, left or up. Both gaps are measured between node borders, so large nodes push their neighbors apart and small ones pack close.',
  hint: 'Turn the layers, then drag the sliders to open or close the gaps.',
  category: 'layouts',
  order: 60,
  tags: ['Vanilla'],
  api: ['layouts'],
  guides: ['layout#layers'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
