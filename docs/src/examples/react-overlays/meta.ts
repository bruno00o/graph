import type { ExampleMeta } from '../types'

export default {
  title: 'React overlays',
  description:
    'A tooltip that follows the hovered node and a panel that lists the selection, both rendered as children of the graph.',
  hint: 'Hover a node, click to select, hold Shift to add more.',
  category: 'interaction',
  order: 30,
  tags: ['React'],
  api: ['graph-component', 'hooks', 'anchor'],
  guides: ['react'],
} satisfies ExampleMeta
