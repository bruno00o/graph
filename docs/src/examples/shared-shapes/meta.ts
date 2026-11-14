import type { ExampleMeta } from '../types'

export default {
  title: 'Shared shapes',
  description:
    'Shapes read from a TanStack DB collection in localStorage, with a shape editor that writes each edit back to it, and the pointers and selections of the other tabs. Edit a shape in one tab and watch it change in the other.',
  hint: 'Open this page in a second tab, then move the pointer, select a shape or drag one of its points; turn on Simulate other editors to see others in a single tab.',
  category: 'data',
  order: 140,
  tags: ['React', 'TanStack DB'],
  api: ['persist-shapes', 'show-presence', 'shape-editor', 'shapes'],
  guides: [
    'editing-shapes#saving-edits',
    'editing-shapes#who-else-is-editing',
    'tanstack-db#write-shapes-back',
  ],
} satisfies ExampleMeta
