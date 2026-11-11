import type { ExampleMeta } from '../types'

export default {
  title: 'Search and focus',
  description:
    'A search field over the node labels, blind to case and accents. Matches get a named state while the rest fades; Enter or a click frames the node with its neighbors, selects it and moves the keyboard focus to it.',
  hint: 'Type a few letters, move with the arrow keys, press Enter. Escape clears.',
  category: 'interaction',
  order: 110,
  tags: ['React'],
  api: ['graph-component', 'hooks', 'graph-instance'],
  guides: ['interaction#keyboard', 'states#style-the-others', 'view#fit'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
