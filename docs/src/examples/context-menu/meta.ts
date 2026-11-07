import type { ExampleMeta } from '../types'

export default {
  title: 'Context menu',
  description:
    'Right-click a node for a menu pinned next to it, with actions on the node and its neighbors. Right-click the background for actions on the whole graph.',
  hint: 'Right-click a node or the background, then pick an action.',
  category: 'interaction',
  order: 70,
  tags: ['Vanilla'],
  api: ['graph-instance', 'events'],
  guides: ['drawing-layers#anchored-html', 'states#hide-members'],
} satisfies ExampleMeta
