import type { ExampleMeta } from '../types'

export default {
  title: 'View controls',
  description:
    'Buttons that zoom, fit every node or the selection, and go back to zoom 1, with the world origin pinned in HTML by toScreen and the pointer read in world units by toWorld.',
  hint: 'Select a few nodes with Shift, then fit the selection. Move the pointer to read world coordinates.',
  category: 'basics',
  order: 60,
  tags: ['Vanilla'],
  api: ['graph-instance', 'define-graph'],
  guides: ['view', 'view#screen-and-world-coordinates'],
} satisfies ExampleMeta
