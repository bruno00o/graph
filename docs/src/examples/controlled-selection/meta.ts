import type { ExampleMeta } from '../types'

export default {
  title: 'Selection synced with a list',
  description:
    'The selection lives in React state, shared by the graph and a list of checkboxes. Every request goes through the same handler, which keeps the last four nodes.',
  hint: 'Check nodes in the list, or Shift and click nodes in the graph. Hover the list to find a node.',
  category: 'interaction',
  order: 100,
  tags: ['React'],
  api: ['graph-component', 'hooks'],
  guides: ['react#controlled-selection', 'interaction#controlled-selection'],
} satisfies ExampleMeta
