import type { ExampleMeta } from '../types'

export default {
  title: 'Keyboard navigation',
  description:
    'Move the focus from node to node with the arrow keys, select with Enter, and let the view follow the focus when it nears the edge.',
  hint: 'Click the graph or press Tab, then use the arrow keys, Enter and Escape.',
  category: 'interaction',
  order: 60,
  tags: ['Vanilla'],
  api: ['graph-instance', 'events'],
  guides: ['interaction#keyboard'],
} satisfies ExampleMeta
