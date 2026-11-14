import type { ExampleMeta } from '../types'

export default {
  title: 'Shared shapes',
  description:
    'Shapes read from a TanStack DB collection in localStorage, with a shape editor that writes each edit back to it. Edit a shape in one tab and watch it change in the other.',
  hint: 'Open this page in a second tab, then drag a shape or one of its points; turn off Send while dragging to send on release only.',
  category: 'data',
  order: 140,
  tags: ['React', 'TanStack DB'],
  api: ['persist-shapes', 'shape-editor', 'shapes'],
  guides: ['editing-shapes#saving-edits', 'tanstack-db#write-shapes-back'],
} satisfies ExampleMeta
